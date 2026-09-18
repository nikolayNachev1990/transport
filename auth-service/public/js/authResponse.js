const body = document.body;
const allowedOrigins = [
  body.getAttribute("data-url"),
  "http://localhost:3000/",
];
const accessToken = body.getAttribute("data-access-token");
const refreshToken = body.getAttribute("data-refresh-token");

if (window.opener) {
  allowedOrigins.forEach((origin) => {
    window.opener.postMessage(
      {
        type: "DOPE_AUTH_RESPONSE",
        data: {
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
      },
      origin
    );
  });
}

// Chrome Extension
if (
  typeof chrome !== "undefined" &&
  typeof chrome.runtime !== "undefined" &&
  typeof chrome.runtime.sendMessage === "function"
) {
  chrome.runtime.sendMessage({
    type: "DOPE_AUTH_RESPONSE",
    data: {
      accessToken: accessToken,
      refreshToken: refreshToken,
    },
  });
}

// Firefox extension
if (
  typeof browser !== "undefined" &&
  typeof browser.runtime !== "undefined" &&
  typeof browser.runtime.sendMessage === "function"
) {
  browser.runtime.sendMessage({
    type: "DOPE_AUTH_RESPONSE",
    data: {
      accessToken: accessToken,
      refreshToken: refreshToken,
    },
  });
}
