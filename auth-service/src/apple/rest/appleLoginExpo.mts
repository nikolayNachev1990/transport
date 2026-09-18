import type { RestDefinition } from "@transport/core/server";
import passport from "passport";
import { getAppleCallbackURL } from "../appleHelper.mjs";

const rest: RestDefinition = {
  route: "/apple/login/expo",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Apple Login"],
    description: "Login with your Apple account (Expo)",
    responses: {
      200: { description: "REDIRECT_TO_APPLE" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [
    (req, res, next) => {
      const callbackURL = getAppleCallbackURL("/expo");
      passport.authenticate("apple", { callbackURL, session: false } as passport.AuthenticateOptions)(req, res, next);
    },
  ],

  entryPoint: async (_req, res) => {
    res.jsonOk();
  },
};

export default rest;
