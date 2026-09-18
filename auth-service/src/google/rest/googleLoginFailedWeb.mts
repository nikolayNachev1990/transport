import type { RestDefinition } from "@transport/core/server";
import { getGoogleRedirectUrl } from "../googleHelper.mjs";

const rest: RestDefinition = {
  route: "/google/login/failed/web",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Google Login"],
    description: "Failed login route for google auth",
    responses: {},
  },

  middlewares: [],

  entryPoint: async (_req, res) => {
    res.status(301).redirect(`${getGoogleRedirectUrl("/web")}?login_error=INVALID_CREDENTIALS`);
  },
};
export default rest;
