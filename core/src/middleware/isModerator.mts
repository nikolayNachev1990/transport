import type { RequestHandler } from "express";

const allowedRoles = ["admin", "moderator"];

export const isModerator: RequestHandler = async (req, res, next) => {
  if (!req.hasuraUser || !allowedRoles.includes(req.hasuraUser.role ?? "")) {
    res.jsonError(403, "ACCESS_DENIED", [{ no_permission: "You do not have rights to access this endpoint." }]);
    return;
  }
  next();
};
