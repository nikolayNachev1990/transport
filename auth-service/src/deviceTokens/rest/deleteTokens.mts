import type { RestDefinition } from "@transport/core/server";
import DeviceTokenService from "../services/deviceTokenService.mjs";

const rest: RestDefinition = {
  route: "/device_token/delete_all",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["DeviceTokens"],
    description: "Delete all user tokens which is not IOS or ANDROID",
    responses: {
      200: {
        description: "EXECUTED",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const service = new DeviceTokenService();
    await service.deleteAll();
    res.jsonOk();
  },
};
export default rest;
