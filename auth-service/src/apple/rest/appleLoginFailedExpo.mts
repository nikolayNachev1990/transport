import type { RestDefinition } from "@transport/core/server";
import { getAppleRedirectUrl } from "../appleHelper.mjs";

const rest: RestDefinition = {
  route: "/apple/login/failed/expo",
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
    res.status(301).redirect(`${getAppleRedirectUrl("/expo")}?login_error=INVALID_CREDENTIALS`);
  },
};
export default rest;
