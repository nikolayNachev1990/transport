import type { RestDefinition } from "@transport/core/server";
import { db, broker } from "../../resources.mjs";

const table = "force_update_min_version";

interface ForceUpdateRow {
  id: string;
  platform: string;
  ios: number;
  android: number;
}

const rest: RestDefinition = {
  route: "/update/version",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: "Target app/platform key",
        },
        android: {
          type: "number",
        },
        ios: {
          type: "number",
        },
      },
      required: ["android", "ios"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Update Version"],
    description: "Update device version for IOS & android",
    responses: {
      200: {
        description: "UPDATED",
      },
      404: {
        description: "NOT_FOUND",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const inputs = {
      ios: req.validated?.ios as number,
      android: req.validated?.android as number,
      platform: req.validated?.platform as string | undefined,
    };

    const found = await db.findByWhere<ForceUpdateRow>(table, { platform: inputs.platform });
    const row = Array.isArray(found) ? found[0] : found;
    if (!row) {
      res.jsonError(422, "VALIDATION_ERRORS", {});
      return;
    }
    const update = await db.updateById<ForceUpdateRow>(table, row.id, {
      ios: inputs.ios,
      android: inputs.android,
    });

    if (!update) {
      res.jsonError(422, "VALIDATION_ERRORS", {});
      return;
    }
    await broker.send("forceUpdateMinVersion.updated", update);
    res.jsonOk();
  },
};
export default rest;
