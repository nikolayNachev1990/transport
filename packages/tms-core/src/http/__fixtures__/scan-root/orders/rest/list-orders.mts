export default {
  route: "/orders",
  method: "GET",
  auth: { roles: ["owner"] },
  schema: { response: { 200: { type: "array" } } },
  handler: async () => [],
};
