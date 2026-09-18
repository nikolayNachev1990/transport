// Both passport strategies, registered exactly once at startup — not at
// import time inside whichever rest file happens to use them first (the
// old code registered LocalStrategy that way, inside auth/rest/login.mts,
// which only worked by accident of import order). Route handlers just call
// passport.authenticate("bearer" | "local", ...).
import passport from "passport";
import type { Request } from "express";
import PassportHttpBearerImport from "passport-http-bearer";
import PassportLocalImport from "passport-local";
import type { IStrategyOptionsWithRequest, IVerifyOptions } from "passport-local";
import { verifyPassword } from "@transport/core/crypt";
import { db } from "./resources.mjs";

// Same tsc 7.x default-import defect documented in core/src/validator:
// "passport-http-bearer"/"passport-local" have no package.json "exports"
// field, so tsc's static type for the default-import binding resolves to
// the whole module namespace instead of the Strategy class — but the
// runtime value IS the class (confirmed: Node's own CJS-interop always
// binds a default import to `module.exports`). A namespace import
// (`import * as X`) would be wrong here despite looking similar — the
// namespace object itself is never callable, only `.default` is; a plain
// default import already gets that value directly, cast through the real
// type instead of `any`.
type BearerVerify = (token: string, done: (error: unknown, user?: unknown) => void) => void;
const BearerStrategy = PassportHttpBearerImport as unknown as new (verify: BearerVerify) => passport.Strategy;

// passReqToCallback so the verify function reads email/password from
// req.validated (populated by core's validateBody middleware) instead of
// passport-local's own default extraction, which reads req.body.email /
// req.body.password directly — those don't exist when the body arrives
// wrapped as `{"input": {...}}` (every Hasura Action call, and any client
// following that convention), so the strategy would look up `email
// = undefined` and always report "Invalid credentials" for such callers.
type LocalVerify = (
  req: Request,
  username: string,
  password: string,
  done: (error: unknown, user?: unknown, options?: IVerifyOptions) => void,
) => void;
const LocalStrategyCtor = PassportLocalImport as unknown as new (
  options: IStrategyOptionsWithRequest,
  verify: LocalVerify,
) => passport.Strategy;

interface AccessTokenRow {
  user_id: string;
  expires_at: string;
  name: string | null;
  email: string | null;
  mobile_number: string | null;
  role: string | null;
}

passport.use(
  new BearerStrategy(async (token, done) => {
    try {
      const result = await db.raw<{ rows: AccessTokenRow[]; rowCount: number }>(
        `SELECT
          t.user_id,
          t.expires_at,
          ( SELECT u.name FROM users u WHERE u.id = t.user_id LIMIT 1 ) AS name,
          ( SELECT u.email FROM users u WHERE u.id = t.user_id LIMIT 1 ) AS email,
          ( SELECT u.mobile_number FROM users u WHERE u.id = t.user_id LIMIT 1 ) AS mobile_number,
          ( SELECT u.role FROM users u WHERE u.id = t.user_id LIMIT 1 ) AS role
        FROM oauth_access_tokens t
        WHERE t.id = :id AND t.revoked = :revoked
        LIMIT 1`,
        { id: token, revoked: false },
      );

      const row = result?.rows[0];
      if (!row || new Date(row.expires_at) < new Date()) {
        done(null, false);
        return;
      }

      done(null, {
        id: row.user_id,
        name: row.name,
        email: row.email,
        mobile_number: row.mobile_number,
        role: row.role,
        accessToken: token,
      });
    } catch (error) {
      console.log("passport bearer strategy error:", error);
      done(null, false);
    }
  }),
);

interface LoginUserRow {
  id: string;
  name: string;
  mobile_number: string | null;
  email: string;
  twofa: boolean;
  password: string;
  role: string;
  active: boolean;
}

passport.use(
  new LocalStrategyCtor(
    { usernameField: "email", passwordField: "password", passReqToCallback: true },
    async (req, username, password, done) => {
      const email = ((req.validated?.email as string | undefined) ?? username).toLowerCase();
      const pass = (req.validated?.password as string | undefined) ?? password;
      try {
        const result = await db.raw<{ rows: LoginUserRow[] }>(
          `SELECT id, name, mobile_number, email, twofa, password, role, active
           FROM users
           WHERE email = :username
           LIMIT 1`,
          { username: email },
        );

        const user = result?.rows[0];
        if (!user) {
          done(null, false, { message: "Invalid credentials." });
          return;
        }

        const valid = await verifyPassword(pass, user.password);
        if (!valid) {
          done(null, false, { message: "Invalid credentials." });
          return;
        }

        done(null, { ...user, password: undefined });
      } catch (error) {
        done(error);
      }
    },
  ),
);
