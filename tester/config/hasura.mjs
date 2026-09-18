export default {
  url: process.env.HASURA_URL ?? null,
  adminHeaders: {
    "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET ?? null,
  },
};
