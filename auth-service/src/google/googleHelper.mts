import oauth2Config from "../config/oauth2.mjs";

// rival24 branding/multi-tenant branching removed — this service only ever
// serves one client set now, so these collapse to plain lookups.
export const getGoogleCallbackURL = (suffix: "" | "/web" | "/expo" = ""): string => {
  if (suffix === "/expo") return oauth2Config.google.appConfigs.expo.callback;
  if (suffix === "/web") return oauth2Config.google.appConfigs.web.callback;
  return oauth2Config.google.callback;
};

export const getGoogleRedirectUrl = (suffix: "/web" | "/expo"): string =>
  suffix === "/web" ? oauth2Config.google.appConfigs.web.redirectUrl : oauth2Config.google.appConfigs.expo.redirectUrl;
