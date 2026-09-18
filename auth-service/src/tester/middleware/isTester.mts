import type { RequestHandler } from "express";
import authConfig from "../../config/auth.mjs";

const isTester: RequestHandler = async (req, res, next) => {
  if (!Object.prototype.hasOwnProperty.call(req.headers, authConfig.testerHeaderKey)) {
    res.jsonError(403, "ACCESS_DENIED");
    return;
  }

  if (req.headers[authConfig.testerHeaderKey] !== authConfig.testerSecretKey) {
    res.jsonError(403, "ACCESS_DENIED");
    return;
  }
  next();
};

export default isTester;
