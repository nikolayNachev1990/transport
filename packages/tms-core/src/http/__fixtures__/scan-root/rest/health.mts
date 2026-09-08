export default {
  route: "/health",
  method: "GET",
  auth: false,
  schema: { response: { 200: { type: "object", properties: { ok: { type: "boolean" } } } } },
  handler: async () => ({ ok: true }),
};
