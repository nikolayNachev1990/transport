import crypto from "node:crypto";
import qrcode from "qrcode";
import Jimp from "jimp";
import moment from "moment";
import { db, broker } from "../../resources.mjs";
import qrcodesConfig from "../../config/qrcodes.mjs";

interface QRCodeRow {
  id: string;
  key: string;
  user_data: Record<string, unknown>;
  status: boolean;
}

class QRCodeService {
  async generateQRCode() {
    // Generate unique key for the qr code needed
    let uniqueQRKey = "";
    uniqueQRKey += crypto.randomBytes(8).toString("hex");
    uniqueQRKey += Date.now();
    crypto.createHash("md5").update(uniqueQRKey);
    // Generate the base64 qr code using the key
    try {
      const base64QRCode = await this.generateQRCodeWithData(uniqueQRKey);
      if (base64QRCode) {
        const dbResult = await db.insert<QRCodeRow>("qrcodes", {
          key: uniqueQRKey,
          user_data: {},
          status: false,
        });

        if (!dbResult) {
          return false;
        }
        await broker.send("qrcode.created", dbResult);
        return base64QRCode;
      }
      return false;
    } catch (error) {
      console.log("Failed generating QR code", error);
      return false;
    }
  }

  async generateQRCodeWithData(uniqueKey: string) {
    try {
      const logoPath = qrcodesConfig.qrCodeLogo;
      const scanURL = qrcodesConfig.scanURLDomain + qrcodesConfig.scanURLEndpoint + uniqueKey;
      // Create the qr code with the url, containing the unique key
      const qrCode = await qrcode.toDataURL(scanURL, qrcodesConfig.qrCodeOptions);

      if (!logoPath) {
        return qrCode;
      }

      // Read the logo image as a buffer
      const buff = Buffer.from(logoPath.split(",")[1] ?? "", "base64");
      const logoImage = await Jimp.read(buff);
      const qrCodeImage = await Jimp.read(Buffer.from(qrCode.split(",")[1] ?? "", "base64"));

      // Set position of the inner logo in the qr code and append it to the qr code
      const x = Math.floor((qrCodeImage.bitmap.width - logoImage.bitmap.width) / 2);
      const y = Math.floor((qrCodeImage.bitmap.height - logoImage.bitmap.height) / 2);
      qrCodeImage.composite(logoImage, x, y);

      // Convert the image to a base64 string
      const base64String = await qrCodeImage.getBase64Async(Jimp.MIME_PNG);

      return base64String;
    } catch (error) {
      console.log("Error generating QR code:", error);
      return false;
    }
  }

  async scanQRCode(key: string, data: Record<string, unknown>): Promise<boolean> {
    // Check if the key is present in the db
    const found = await db.findByWhere<QRCodeRow>("qrcodes", { key, status: false });
    const qrCodeSelected = Array.isArray(found) ? found[0] : found;
    if (!qrCodeSelected) {
      return false;
    }

    // Update the key and mark it as used
    const qrCodeUpdatedResult = await db.updateById<QRCodeRow>("qrcodes", qrCodeSelected.id, {
      user_data: data,
      status: true,
    });
    if (!qrCodeUpdatedResult) {
      return false;
    }
    await broker.send("qrcode.updated", qrCodeUpdatedResult);
    return true;
  }

  async deleteExpiredQRCodes() {
    const today = moment().utc();
    const before = today.subtract({ minutes: 1 }).utc().format("YYYY-MM-DD HH:mm");
    const result = await db.raw<{ rows: QRCodeRow[] }>(
      `
          SELECT * FROM
            qrcodes
          WHERE
          created_at <= :before
        `,
      { before },
    );
    if (result && result.rows.length > 0) {
      for (const row of result.rows) {
        const deleted = await db.deleteById("qrcodes", row.id);
        if (deleted) {
          await broker.send("qrcode.deleted", deleted);
        }
      }
    }
    return true;
  }
}

export default QRCodeService;
