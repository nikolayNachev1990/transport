// Published by auth-service's company-invite activation endpoint (src/
// company/rest/companyInviteActivate.mts) — deliberately NOT user.updated
// (spec rule 8): the plain self-service /activate flow still emits
// user.updated (it's just an email-verification step, password already
// set at signup), but a company-invited identity's activation is a
// distinct transition company-service needs to react to (pending ->
// active membership), so it gets its own topic rather than overloading
// user.updated's generic "something changed" semantics.
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
      id: { type: "string", format: "uuid" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {
    "company-group": { mode: "one" },
  },
};
