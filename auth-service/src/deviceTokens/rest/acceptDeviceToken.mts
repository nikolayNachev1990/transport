import { checkAuth, restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import DeviceTokenService from "../services/deviceTokenService.mjs";
import type DeviceTokenInterface from "../services/interfaces/deviceTokensInterface.mjs";

const rest: RestDefinition = {
  route: "/device_token/accept",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        platform: {
          type: "string",
        },
        device_token: {
          type: "string",
        },
      },
      required: ["platform", "device_token"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["DeviceTokens"],
    description: "Create a device token per user",
    responses: {
      201: {
        description: "CREATED",
      },
      404: {
        description: "NOT_FOUND",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [checkAuth, restIdempotence],

  entryPoint: async (req, res) => {
    const inputs: DeviceTokenInterface = {
      userId: req.hasuraUser?.id as string,
      platform: req.validated?.platform as string,
      deviceToken: req.validated?.device_token as string,
      domain: (req.headers?.domain as string | undefined) ?? "",
    };

    const deviceTokenService = new DeviceTokenService();
    const foundActiveDeviceToken = await deviceTokenService.findByDeviceToken(inputs.deviceToken);

    if (foundActiveDeviceToken) {
      if (
        foundActiveDeviceToken.user_id === inputs.userId &&
        foundActiveDeviceToken.platform === inputs.platform &&
        foundActiveDeviceToken.domain === inputs.domain
      ) {
        res.jsonOk({ device_token: foundActiveDeviceToken });
        return;
      }

      const deviceTokenData = {
        user_id: inputs.userId,
        device_token: inputs.deviceToken,
        platform: inputs.platform,
        domain: inputs.domain,
      };
      const updateDeviceToken = await deviceTokenService.updateDeviceToken(deviceTokenData);
      if (!updateDeviceToken) {
        res.jsonError(422, "VALIDATION_ERRORS", {
          foundActiveDeviceToken,
          updateDeviceToken,
        });
        return;
      }
      res.jsonOk({ device_token: updateDeviceToken });
      return;
    }

    const deviceTokenData = {
      user_id: inputs.userId,
      device_token: inputs.deviceToken,
      platform: inputs.platform,
      domain: inputs.domain,
    };
    const newDeviceToken = await deviceTokenService.createDeviceToken(deviceTokenData);
    if (!newDeviceToken) {
      res.jsonError(422, "VALIDATION_ERRORS", {});
      return;
    }
    res.jsonOk();
  },
};
export default rest;
