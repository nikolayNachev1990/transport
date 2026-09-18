import geoip from "geoip-lite";
import type { Request } from "express";
import ipware from "ipware";

class GeoLookUpService {
  request: Request;
  getIp: (req: Request) => { clientIp: string | null };

  constructor(req: Request) {
    this.request = req;
    this.getIp = ipware().get_ip;
  }

  async geoIpLookUpUser() {
    const ip = this.getIp(this.request).clientIp;
    if (ip) {
      const data = geoip.lookup(ip);
      if (!data) {
        return null;
      }
      const formattedGeoIPOutput: Record<string, unknown> = {};
      const geoIPDataProperties = Object.keys(data) as (keyof typeof data)[];
      for (const key of geoIPDataProperties) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          formattedGeoIPOutput[key] = data[key] || null;
        }
      }
      formattedGeoIPOutput.ip = ip;

      formattedGeoIPOutput.browser = "n/a";
      formattedGeoIPOutput.platform = "n/a";

      const useragent = (this.request as Request & { useragent?: { browser?: string; os?: string } }).useragent;
      if (useragent?.browser && useragent?.os) {
        formattedGeoIPOutput.browser = useragent.browser;
        formattedGeoIPOutput.platform = useragent.os;
      }

      const headers = this.request.headers as Record<string, string | undefined>;
      if (headers["app-device"]) {
        formattedGeoIPOutput.platform = headers["app-device"];
      }

      if (headers["app-device"] && headers["app-os"]) {
        formattedGeoIPOutput.platform = `${headers["app-device"]}(${headers["app-os"]})`;
      }

      if (headers["sessionid"]) {
        formattedGeoIPOutput.session_id = headers["sessionid"];
      }

      return formattedGeoIPOutput;
    }

    return null;
  }
}

export default GeoLookUpService;
