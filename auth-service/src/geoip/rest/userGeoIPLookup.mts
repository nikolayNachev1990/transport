import type { RestDefinition } from "@transport/core/server";
import GeoLookUpService from "../services/geoLookup.service.mjs";

const rest: RestDefinition = {
  route: "/user/geoip/lookup",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Update user last seen",
    responses: {
      200: {
        description: "SUCCESS",
      },
      400: {
        description: "BAD_REQUEST",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const lookUpService = new GeoLookUpService(req);
    const lookUpData = await lookUpService.geoIpLookUpUser();
    if (!lookUpData) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "Error retrieving geoip data.",
      });
      return;
    }
    res.jsonOk(lookUpData);
  },
};

export default rest;
