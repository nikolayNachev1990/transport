// Mirrors auth-service/src/seeds/20260911000001_users.js's 3 bootstrap
// accounts (same ids, same ADMIN_USER_*/MODERATOR_USER_* env vars) — a
// stand-in for the real Kafka sync (see src/config/broker.mts) until
// that's wired up. Once user.created/user.updated consumers exist, this
// seed becomes redundant for anything created after that point, but stays
// harmless (idempotent by id) as the bootstrap for these 3 fixed accounts.
// No dotenv here — unlike a bare host run, docker-compose already injects
// these into process.env directly.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`seed users: ${name} is not set`);
  }
  return value;
}

exports.seed = async function (knex) {
  const seeds = [
    {
      id: requireEnv("ADMIN_USER_ID"),
      name: requireEnv("ADMIN_USER_NAME"),
      email: requireEnv("ADMIN_USER_EMAIL"),
      active: true,
      role: requireEnv("ADMIN_USER_ROLE"),
    },
    {
      id: requireEnv("MODERATOR_USER_ID"),
      name: requireEnv("MODERATOR_USER_NAME"),
      email: requireEnv("MODERATOR_USER_EMAIL"),
      active: true,
      role: requireEnv("MODERATOR_USER_ROLE"),
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Test User",
      email: "test@transport.local",
      active: true,
      role: "user",
    },
  ];

  for (const seed of seeds) {
    const exists = await knex("users").select("id").where({ id: seed.id }).first();
    if (!exists) {
      await knex("users").insert(seed);
    }
  }
};
