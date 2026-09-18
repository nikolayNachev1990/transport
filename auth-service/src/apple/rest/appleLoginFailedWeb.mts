import type { RestDefinition } from "@transport/core/server";
import { getAppleRedirectUrl } from "../appleHelper.mjs";

const rest: RestDefinition = {
  route: "/apple/login/failed/web",
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
    res.status(301).redirect(`${getAppleRedirectUrl("/web")}?login_error=INVALID_CREDENTIALS`);
  },
};
export default rest;
