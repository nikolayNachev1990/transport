import type { RestDefinition } from "@transport/core/server";
import appConfig from "../../config/app.mjs";

const rest: RestDefinition = {
  route: "/apple/login/failed",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Apple Login"],
    description: "Failed login route for apple auth",
    responses: {},
  },

  middlewares: [],

  entryPoint: async (_req, res) => {
    // No view engine anymore (ejs was removed) — redirect to the web app
    // with an error flag, same shape as /apple/login/failed/web.
    res.status(301).redirect(`${appConfig.webUrl}?login_error=INVALID_CREDENTIALS`);
  },
};
export default rest;
