import { loadConfig } from "@transport/core/config";

// Note: the original had a full second "rival24" branch (separate client
// IDs/keys/callbacks for a different platform) duplicating every field
// below. Dropped — not applicable here.
const env = loadConfig(
  {
    APPLE_LOGIN_CLIENT_ID: { required: false, default: "", description: "Apple Sign In client ID" },
    APPLE_LOGIN_TEAM_ID: { required: false, default: "", description: "Apple Sign In team ID" },
    APPLE_LOGIN_KEY_ID: { required: false, default: "", description: "Apple Sign In key ID" },
    APPLE_LOGIN_KEY_FILEPATH: { required: false, default: "", description: "Path to the Apple Sign In private key" },
    APPLE_LOGIN_CLIENT_CALLBACK_URL: { required: false, default: "", description: "Apple Sign In callback URL" },
    APPLE_LOGIN_CLIENT_CALLBACK_URL_EXPO: { required: false, default: "", description: "Apple Sign In callback URL (Expo)" },
    APPLE_LOGIN_CLIENT_REDIRECT_URL_EXPO: { required: false, default: "", description: "Apple Sign In redirect URL (Expo)" },
    APPLE_LOGIN_CLIENT_CALLBACK_URL_WEB: { required: false, default: "", description: "Apple Sign In callback URL (web)" },
    APPLE_LOGIN_CLIENT_REDIRECT_URL_WEB: { required: false, default: "", description: "Apple Sign In redirect URL (web)" },

    GOOGLE_LOGIN_CLIENT_ID: { required: false, default: "", description: "Google OAuth client ID" },
    GOOGLE_LOGIN_CLIENT_SECRET: { required: false, default: "", description: "Google OAuth client secret" },
    GOOGLE_LOGIN_CLIENT_CALLBACK_URL: { required: false, default: "", description: "Google OAuth callback URL" },
    GOOGLE_LOGIN_CLIENT_CALLBACK_URL_EXPO: { required: false, default: "", description: "Google OAuth callback URL (Expo)" },
    GOOGLE_LOGIN_CLIENT_REDIRECT_URL_EXPO: { required: false, default: "", description: "Google OAuth redirect URL (Expo)" },
    GOOGLE_LOGIN_CLIENT_CALLBACK_URL_WEB: { required: false, default: "", description: "Google OAuth callback URL (web)" },
    GOOGLE_LOGIN_CLIENT_REDIRECT_URL_WEB: { required: false, default: "", description: "Google OAuth redirect URL (web)" },

    AUTHORIZATION_CODE_REDIRECT_URL: { required: true, description: "Redirect URL after authorization-code grant" },
  },
  process.env,
);

export default {
  apple: {
    clientId: env.APPLE_LOGIN_CLIENT_ID,
    teamId: env.APPLE_LOGIN_TEAM_ID,
    keyId: env.APPLE_LOGIN_KEY_ID,
    keyPath: env.APPLE_LOGIN_KEY_FILEPATH,
    callback: env.APPLE_LOGIN_CLIENT_CALLBACK_URL,
    appConfigs: {
      expo: { callback: env.APPLE_LOGIN_CLIENT_CALLBACK_URL_EXPO, redirectUrl: env.APPLE_LOGIN_CLIENT_REDIRECT_URL_EXPO },
      web: { callback: env.APPLE_LOGIN_CLIENT_CALLBACK_URL_WEB, redirectUrl: env.APPLE_LOGIN_CLIENT_REDIRECT_URL_WEB },
    },
  },
  google: {
    clientId: env.GOOGLE_LOGIN_CLIENT_ID,
    clientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET,
    callback: env.GOOGLE_LOGIN_CLIENT_CALLBACK_URL,
    appConfigs: {
      expo: { callback: env.GOOGLE_LOGIN_CLIENT_CALLBACK_URL_EXPO, redirectUrl: env.GOOGLE_LOGIN_CLIENT_REDIRECT_URL_EXPO },
      web: { callback: env.GOOGLE_LOGIN_CLIENT_CALLBACK_URL_WEB, redirectUrl: env.GOOGLE_LOGIN_CLIENT_REDIRECT_URL_WEB },
    },
  },
  redirectUrl: env.AUTHORIZATION_CODE_REDIRECT_URL,
};
