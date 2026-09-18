import type { Response } from "express";
import type { RestDefinition } from "@transport/core/server";
import passport from "passport";
import AuthService from "../services/auth.service.mjs";
import authConfig from "../../config/auth.mjs";
import { resolveCompanyRole } from "../../company/services/companyMembership.service.mjs";

interface CachedAuthEntry {
  user_role: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_mobile_number: string | null;
}

interface BearerUser {
  id: string;
  name: string;
  email: string;
  mobile_number: string | null;
  role: string;
}

// Shared by both the cache-hit path and the fresh passport-verified path
// below — the client picks which company it's acting as via its own
// "x-company-id" header (never an X-Hasura-* one, so it can't be spoofed
// into a Hasura session variable directly). No header at all -> the
// caller's plain platform role (admin/moderator/user), unchanged from
// before this company layer existed.
async function respondWithSession(
  res: Response,
  user: { id: string; role: string; name: string; email: string; mobile_number: string | null },
  companyId: string | undefined,
): Promise<void> {
  const role = (user.role as string) === "client" ? "user" : user.role;

  if (!companyId) {
    res.json({
      "X-Hasura-Role": `${role}`,
      "X-Hasura-User-Id": `${user.id}`,
      "X-Hasura-User-Name": `${user.name}`,
      "X-Hasura-User-Email": `${user.email}`,
      "X-Hasura-User-MobileNumber": `${user.mobile_number}`,
    });
    return;
  }

  const companyRole = await resolveCompanyRole(user.id, companyId);
  if (!companyRole) {
    res.jsonError(401, "UNAUTHORIZED", { api_error: "No active membership in the requested company.", code: "COMPANY_ACCESS_DENIED" });
    return;
  }

  res.json({
    "X-Hasura-Role": companyRole,
    "X-Hasura-User-Id": `${user.id}`,
    "X-Hasura-Company-Id": companyId,
  });
}

const rest: RestDefinition = {
  route: "/hasura/webhook",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Hasura"],
    description: "Get logged user details",
    responses: {
      200: { description: "Logged user data." },
      401: { description: "Anonymous" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res, next) => {
    const authService = new AuthService();
    let accessToken: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.split(" ")[0] === "Bearer") {
      accessToken = authHeader.split(" ")[1] ?? null;
    }

    if (!accessToken) {
      res.json({ "X-Hasura-Role": "anonymous" });
      return;
    }

    const companyIdHeader = req.headers["x-company-id"];
    const companyId = typeof companyIdHeader === "string" ? companyIdHeader.trim() || undefined : undefined;

    const entry = await authService.checkAuthEntryInCache(accessToken);
    if (entry) {
      const authEntryFromCache = JSON.parse(entry) as CachedAuthEntry;
      await respondWithSession(
        res,
        {
          id: authEntryFromCache.user_id,
          role: authEntryFromCache.user_role,
          name: authEntryFromCache.user_name,
          email: authEntryFromCache.user_email,
          mobile_number: authEntryFromCache.user_mobile_number,
        },
        companyId,
      );
      return;
    }

    passport.authenticate("bearer", async (err: unknown, user: BearerUser | false, _info: unknown) => {
      if (err) {
        res.json({ "X-Hasura-Role": "anonymous" });
        return;
      }
      if (user) {
        await authService.addAuthEntryToCache(
          accessToken,
          {
            user_role: user.role,
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            user_mobile_number: user.mobile_number,
          },
          authConfig.accessTokenLifetime,
        );
        await respondWithSession(res, user, companyId);
      } else {
        res.json({ "X-Hasura-Role": "anonymous" });
      }
    })(req, res, next);
  },
};
export default rest;
