import type { RequestHandler } from "express";
import AuthService from "../services/auth.service.mjs";

const loginHistoryCheck: RequestHandler = async (req, res, next) => {
  const headers = req.headers;
  const userId = req.hasuraUser?.id;
  let sessionId: string | string[] | null = null;

  if (Object.prototype.hasOwnProperty.call(headers, "SessionId")) {
    sessionId = headers.SessionId as string;
  }

  if (Object.prototype.hasOwnProperty.call(headers, "sessionid")) {
    sessionId = headers.sessionid as string;
  }

  const service = new AuthService();
  const checkSession = userId ? await service.loginHistoryCheck(userId, sessionId as string | null) : false;
  if (!checkSession) {
    sessionId = null;
  }

  if (!sessionId) {
    res.jsonError(403, "ACCESS_DENIED", { api_error: "", code: "ACCESS_DENIED" });
    return;
  }
  next();
};

export default loginHistoryCheck;
