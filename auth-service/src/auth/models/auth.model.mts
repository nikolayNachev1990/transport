import randomstring from "randomstring";
import moment from "moment";
// Same tsc 7.x default-import defect as passport-http-bearer/ajv (no
// package.json "exports" field) — jwt-decode's default export is a
// function; the runtime value is correct (Node's CJS-interop binds a
// default import straight to module.exports), only tsc's static type for
// this binding is wrong, so it's cast through the real type rather than
// re-imported as a namespace (a namespace object is never itself
// callable — see passport.mts's note on the same defect).
// The Apple JWT flow itself is untouched, just this one import.
import jwtDecodeImport from "jwt-decode";
const jwt_decode = jwtDecodeImport as unknown as <T>(token: string) => T;
import { verifyPassword, hashPassword } from "@transport/core/crypt";
import { db, broker } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";
import GeoLookUpService from "../../geoip/services/geoLookup.service.mjs";

const grants = ["password", "refresh_token", "authorization_code"];

interface ClientRow {
  id: string;
  secret: string;
  redirect: string;
}

function parseClientRow(row: ClientRow) {
  return {
    // oauth2-server's Client.id must be the string client identifier, not
    // a separate numeric id — same value as clientId.
    id: row.id,
    clientId: row.id,
    clientSecret: row.secret,
    redirectUri: row.redirect,
    grants,
  };
}

// auth-service only publishes the event — notification-service owns
// rendering and actually sending it (template choice, "from" address,
// provider). No EJS/HTML here; just the data the template needs.
async function sendNotice(to: string, template: string, locale: string, vars: Record<string, unknown>) {
  await broker.send("send.mail", { to, template, locale, vars });
}

const AuthModel = {
  getClient: async (clientId?: string, clientSecret?: string) => {
    if (!clientId || !clientSecret) {
      return AuthModel.getClientMain();
    }
    return AuthModel.getClientByIdAndSecret(clientId, clientSecret);
  },

  getClientByIdAndSecret: async (clientId: string, clientSecret: string) => {
    const result = await db.raw<{ rows: ClientRow[] }>(
      `SELECT id, secret, redirect FROM oauth_clients WHERE id = :id AND secret = :secret LIMIT 1`,
      { id: clientId, secret: clientSecret },
    );
    return parseClientRow(result!.rows[0]);
  },

  getClientByProvider: async (provider: string) => {
    const result = await db.raw<{ rows: ClientRow[] }>(
      `SELECT id, secret, redirect FROM oauth_clients WHERE provider = :provider LIMIT 1`,
      { provider },
    );
    return parseClientRow(result!.rows[0]);
  },

  getClientById: async (id: string) => {
    const result = await db.raw<{ rows: ClientRow[] }>(`SELECT id, secret, redirect FROM oauth_clients WHERE id = :id LIMIT 1`, { id });
    return parseClientRow(result!.rows[0]);
  },

  getClientMain: async () => AuthModel.getClientByProvider("users"),

  getUser: async (username: string, password: string) => {
    const result = await db.raw<{ rows: { password: string }[] }>(
      "SELECT * FROM users WHERE email = :username or mobile_number = :username LIMIT 1",
      { username },
    );
    const user = result?.rows[0];
    if (!user) return false;
    const valid = await verifyPassword(password, user.password);
    return valid ? user : false;
  },

  setGoogleUser: async (accessToken: string, refreshToken: string, profile: { displayName: string; emails: { value: string }[]; id: string }, request: { hostname: string }) => {
    const gmail = profile.emails[0]?.value;
    if (!gmail) return false;
    return AuthModel.findOrCreateSocialUser(gmail, profile.displayName, request, { google_id: profile.id });
  },

  setAppleUser: async (accessToken: string, refreshToken: string, idToken: string, usr: string | null, req: { hostname: string }) => {
    let name: string | null = null;
    let email: string;
    if (usr) {
      const parsed = JSON.parse(usr);
      name = `${parsed.name.firstName} ${parsed.name.lastName}`;
      email = parsed.email;
    } else {
      const userData: { email: string } = jwt_decode(idToken);
      email = userData.email;
    }
    if (!email) return false;
    return AuthModel.findOrCreateSocialUser(email, name, req, { apple_id: idToken });
  },

  findOrCreateSocialUser: async (
    email: string,
    name: string | null,
    request: { hostname: string },
    extra: { google_id?: string; apple_id?: string },
  ) => {
    const dbResult = await db.raw<{ rows: Record<string, unknown>[]; rowCount: number }>(
      `SELECT * FROM users WHERE email = :email LIMIT 1`,
      { email },
    );

    if (dbResult && dbResult.rowCount > 0) {
      const row = dbResult.rows[0] as { id: string; name: string; email: string; role: string; mobile_number: string | null };
      return { id: row.id, name: row.name, email: row.email, role: row.role, phoneNumber: row.mobile_number, new: false };
    }

    const newUser = await AuthModel.userInsert(
      {
        name,
        email,
        password: randomstring.generate({ length: 24, charset: "alphabetic" }),
        active: true,
        email_verified_at: moment(),
        ...extra,
      },
      request,
      false,
    );
    if (!newUser) return null;
    return { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, phoneNumber: newUser.mobile_number, new: true };
  },

  getAccessToken: async (bearerToken: string) => {
    const result = await db.raw<{ rows: { access_token: string; user_id: string; client_id: string; expires_at: string }[] }>(
      "SELECT id AS access_token, user_id, client_id, expires_at FROM oauth_access_tokens WHERE id = :id AND revoked = false",
      { id: bearerToken },
    );
    const row = result!.rows[0];
    const client = await AuthModel.getClientById(row.client_id);
    return { accessToken: row.access_token, accessTokenExpiresAt: new Date(row.expires_at), client, user: { id: row.user_id } };
  },

  refreshTokenDb: async (bearerToken: string) => {
    const tokenResult = await db.raw<{ rows: { access_token: string; refresh_token: string; expires_at: string }[]; rowCount: number }>(
      "SELECT access_token_id AS access_token, id AS refresh_token, expires_at FROM oauth_refresh_tokens WHERE id = :id AND revoked = false LIMIT 1",
      { id: bearerToken },
    );
    if (!tokenResult || tokenResult.rowCount === 0) {
      throw new Error("refresh token not found");
    }
    const token = tokenResult.rows[0] as { access_token: string; refresh_token: string; expires_at: string; user_id?: string };

    const accessResult = await db.raw<{ rows: { user_id: string }[]; rowCount: number }>(
      "SELECT id AS access_token, user_id, client_id, expires_at FROM oauth_access_tokens WHERE id = :id",
      { id: token.access_token },
    );
    if (!accessResult || accessResult.rowCount === 0) {
      throw new Error("access token for refresh token not found");
    }
    token.user_id = accessResult.rows[0].user_id;
    return token;
  },

  getRefreshToken: async (bearerToken: string) => {
    const [token, client] = await Promise.all([AuthModel.refreshTokenDb(bearerToken), AuthModel.getClient()]);
    return {
      refreshToken: token.refresh_token,
      refreshTokenExpiresAt: new Date(token.expires_at),
      scope: "*",
      client,
      user: { id: token.user_id },
    };
  },

  revokeToken: async (token: { refreshToken?: string }) => {
    if (!token.refreshToken) return false;
    const deleted = await db.deleteById("oauth_refresh_tokens", token.refreshToken);
    return Boolean(deleted);
  },

  // Every client is granted a single "*" scope (see saveToken/getClient*
  // below) — nothing to check against, so any requested scope passes.
  verifyScope: async () => true,

  saveToken: async (token: { accessToken: string; accessTokenExpiresAt: Date; refreshToken: string; refreshTokenExpiresAt: Date }, client: { id: string; grants: string[] }, user: { id: string }) => {
    const [accessRow] = await Promise.all([
      db.insert<{ created_at: string }>("oauth_access_tokens", {
        id: token.accessToken,
        user_id: user.id,
        client_id: client.id,
        scopes: '["*"]',
        revoked: false,
        expires_at: token.accessTokenExpiresAt,
      }),
      db.insert("oauth_refresh_tokens", {
        id: token.refreshToken,
        access_token_id: token.accessToken,
        revoked: false,
        expires_at: token.refreshTokenExpiresAt,
      }),
    ]);

    return {
      accessToken: token.accessToken,
      accessTokenCreatedAt: accessRow?.created_at,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      scope: '["*"]',
      client,
      user: { id: user.id },
    };
  },

  setAuthorizationCode: async (user: { id: string }, provider: string) => {
    if (!user) return null;
    const oauthClient = await AuthModel.getClientByProvider(provider);
    if (!oauthClient) return null;

    await db.deleteByWhere("oauth_auth_codes", { user_id: user.id, client_id: oauthClient.clientId });

    const newRow = await db.insert<{ _id: string }>("oauth_auth_codes", {
      user_id: user.id,
      client_id: oauthClient.clientId,
      scopes: "*",
      revoked: false,
      expires_at: moment().add(20, "minutes").toDate(),
    });
    if (!newRow) return null;
    return { ...newRow, id: newRow._id };
  },

  setGoogleAuthorizationCode: async (user: { id: string }) => AuthModel.setAuthorizationCode(user, "google"),
  setAppleAuthorizationCode: async (user: { id: string }) => AuthModel.setAuthorizationCode(user, "apple"),

  getAuthorizationCode: async (_id: string) => {
    const codeResult = await db.raw<{ rows: { _id: string; client_id: string; user_id: string; expires_at: string }[]; rowCount: number }>(
      `SELECT * FROM oauth_auth_codes WHERE _id = :_id LIMIT 1`,
      { _id },
    );
    if (!codeResult || codeResult.rowCount === 0) return null;

    const codeRow = codeResult.rows[0];
    const client = await AuthModel.getClientById(codeRow.client_id);
    const userResult = await db.raw<{ rows: Record<string, unknown>[]; rowCount: number }>("SELECT * FROM users WHERE id = :id LIMIT 1", { id: codeRow.user_id });
    const user = userResult && userResult.rowCount > 0 ? userResult.rows[0] : null;

    return { _id, client, user, expiresAt: new Date(codeRow.expires_at), redirectUri: client.redirectUri };
  },

  revokeAuthorizationCode: async (codeData: { _id: string }) => {
    await db.deleteByWhere("oauth_auth_codes", { _id: codeData._id });
    return true;
  },

  userFind: async (id: string) => {
    if (!id) return null;
    const result = await db.raw<{ rows: Record<string, unknown>[]; rowCount: number }>("SELECT * FROM users WHERE id = :id LIMIT 1", { id });
    return result && result.rowCount > 0 ? result.rows[0] : null;
  },

  userInsert: async (
    sets: {
      name: string | null;
      email: string;
      password: string;
      active?: boolean;
      language?: string;
      google_id?: string;
      apple_id?: string;
      email_verified_at?: moment.Moment;
    },
    req: { hostname: string; useragent?: unknown; headers?: Record<string, unknown> },
    sendMail = true,
  ) => {
    const activationToken = randomstring.generate({ length: 12, charset: "alphabetic" });
    const domain = sets.email.slice(sets.email.lastIndexOf("@") + 1);
    const hashedPassword = await hashPassword(sets.password);

    const lookUp = new GeoLookUpService(req as never);
    const lookUpData = (await lookUp.geoIpLookUpUser()) as { country?: string } | null;

    const active = sets.active ?? false;
    const language = sets.language ?? "en";

    await db.raw(
      `INSERT INTO users (name, email, domain, password, active, activation_token, language, country, email_verified_at)
       VALUES (:name, :email, :domain, :password, :active, :activation_token, :language, :country, :email_verified_at)`,
      {
        name: sets.name,
        email: sets.email,
        domain,
        password: hashedPassword,
        active,
        activation_token: activationToken,
        language,
        country: lookUpData?.country ?? null,
        email_verified_at: sets.email_verified_at?.toDate() ?? null,
      },
    );

    const userResult = await db.raw<{ rows: Record<string, unknown>[] }>(`SELECT * FROM users WHERE email = :email`, { email: sets.email });
    const user = userResult!.rows[0] as { id: string; name: string; email: string; mobile_number: string | null; mobile_number_verified: boolean; active: boolean; avatar: string | null; role: string; country: string | null; language: string; platform: string | null; community_subscription: boolean; created_at: string; updated_at: string };
    if (!user.id) return null;

    if (sets.google_id) await db.updateById("users", user.id, { google_id: sets.google_id });
    if (sets.apple_id) await db.updateById("users", user.id, { apple_id: sets.apple_id });

    if (sendMail && !sets.email.endsWith("@localhost")) {
      const activationLink = `${req.hostname}/auth/activate/${user.id}/${activationToken}`;
      await sendNotice(sets.email, "user-activation", user.language || "en", { name: user.name, link: activationLink });
    }

    await broker.send("user.created", {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile_number: user.mobile_number,
      mobile_number_verified: user.mobile_number_verified,
      active: user.active,
      avatar: user.avatar,
      role: user.role,
      country: user.country,
      language: user.language,
      platform: user.platform,
      community_subscription: user.community_subscription,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });

    const service = new AuthService();
    await service.searchSetIndex(user);
    await service.notifyPeerSync("create", user.id);

    return user;
  },

  resendActivationCode: async (sets: { email: string; userId: string }, options: { sendEmail?: boolean } = {}) => {
    if (!sets.email || !sets.userId) {
      console.log("resendActivationCode: email and userId are required");
      return null;
    }

    const activationToken = randomstring.generate({ length: 12, charset: "alphabetic" });
    const updated = await db.updateById<{ language: string | null; name: string }>("users", sets.userId, { activation_token: activationToken });
    if (!updated) {
      console.log("resendActivationCode: user update failed");
      return null;
    }

    if (options.sendEmail ?? true) {
      await sendNotice(sets.email, "user-activation", updated.language || "en", {
        name: updated.name,
        link: `/auth/activate/${sets.userId}/${activationToken}`,
      });
    }

    return updated;
  },

  userUpdateById: async (id: string, sets: Record<string, unknown>) => {
    try {
      await db.updateById("users", id, sets);
    } catch (error) {
      console.log("userUpdateById error", error);
      return null;
    }

    const notifyOn = ["name", "email", "active"];
    if (Object.keys(sets).some((key) => notifyOn.includes(key))) {
      const user = (await AuthModel.userFind(id)) as Record<string, unknown> | null;
      if (user) {
        await broker.send("user.updated", user);
        const service = new AuthService();
        await service.searchUpdateIndex(user, id);
        await service.notifyPeerSync("update", id);
      }
    }
    return true;
  },
};

export default AuthModel;
