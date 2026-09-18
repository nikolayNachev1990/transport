import oauth2Config from "../config/oauth2.mjs";

// rival24 branding/multi-tenant branching removed — this service only ever
// serves one client set now, so these collapse to plain lookups.
export const getAppleCallbackURL = (suffix: "" | "/web" | "/expo" = ""): string => {
  if (suffix === "/expo") return oauth2Config.apple.appConfigs.expo.callback;
  if (suffix === "/web") return oauth2Config.apple.appConfigs.web.callback;
  return oauth2Config.apple.callback;
};

export const getAppleRedirectUrl = (suffix: "/web" | "/expo"): string =>
  suffix === "/web" ? oauth2Config.apple.appConfigs.web.redirectUrl : oauth2Config.apple.appConfigs.expo.redirectUrl;
