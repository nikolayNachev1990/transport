import type { BrokerEvent } from "@transport/core/broker";
import { createCronTracker } from "@transport/core/crons";
import cronsConfig from "../../config/crons.mjs";

// Dynamic imports, not top-level ones — resources.mjs (and
// qrcode.service.mjs, which itself imports resources.mjs) can't be
// imported at this file's top level: this file is itself imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await — a top-level import here
// would deadlock.
export default async (_event: BrokerEvent) => {
  const [{ db }, { default: QRCodeService }] = await Promise.all([
    import("../../resources.mjs"),
    import("../services/qrcode.service.mjs"),
  ]);
  const cronTracker = createCronTracker(db, cronsConfig.timeoutMinutes);
  const service = new QRCodeService();

  const cronResult = await cronTracker.addEvent("qrcodes.clear.queue");
  if (!cronResult) {
    return false;
  }
  await service.deleteExpiredQRCodes();
  await cronTracker.completeEvent(cronResult.id);
};
