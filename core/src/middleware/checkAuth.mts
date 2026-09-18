import type { RequestHandler } from "express";

export const checkAuth: RequestHandler = async (req, res, next) => {
  if (!req.hasuraUser?.id) {
    res.jsonError(401, "UNAUTHORIZED");
    return;
  }
  next();
};
