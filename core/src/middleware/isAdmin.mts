import type { RequestHandler } from "express";

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (req.hasuraUser?.role !== "admin") {
    res.jsonError(403, "ACCESS_DENIED", [{ no_permission: "You do not have rights to access this endpoint." }]);
    return;
  }
  next();
};
