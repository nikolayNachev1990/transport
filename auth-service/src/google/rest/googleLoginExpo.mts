import type { RestDefinition } from "@transport/core/server";
import passport from "passport";
import { getGoogleCallbackURL } from "../googleHelper.mjs";

const rest: RestDefinition = {
  route: "/google/login/expo",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Google Login"],
    description: "Login with your Google account (Expo)",
    responses: {
      200: { description: "REDIRECT_TO_GOOGLE" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [
    (req, res, next) => {
      const callbackURL = getGoogleCallbackURL("/expo");
      passport.authenticate("google", { callbackURL, scope: ["email", "profile"], session: false } as passport.AuthenticateOptions)(req, res, next);
    },
  ],

  entryPoint: async (_req, res) => {
    res.jsonOk();
  },
};
export default rest;
