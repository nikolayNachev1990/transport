// Published by auth-service (src/auth/models/auth.model.mts's
// sendNotice) whenever a user needs an email — auth-service never
// renders or sends the email itself, notification-service will own that
// once it exists.
export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties: {
      to: { type: "string", format: "email" },
      template: { type: "string" },
      locale: { type: "string" },
      vars: { type: "object" },
    },
    required: ["to", "template"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {},
};
