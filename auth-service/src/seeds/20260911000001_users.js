// Consolidated from the old auth/seeds/{develop,production}/users.js and
// dopebot.js: the "Deleted User" placeholder, the 10 numbered throwaway
// @zikvid.com test accounts, and the DopeBot service account are dropped —
// not needed for now. Admin and moderator are no longer hardcoded rows;
// their name/email/password come from ADMIN_USER_*/MODERATOR_USER_* env
// vars (see .env), so they're swappable per environment without editing
// this file. Runs the same in every environment (no dev/production split).
//
// Passwords hashed with argon2 (@transport/core/crypt), not bcrypt — no
// separate salt column, argon2's own hash string embeds it.
//
// NOTE: the original seed also called AuthService.searchSetIndex(row) to
// push each new user into the search index. That's dropped here — it
// depended on the old zikvid-common AuthService, which doesn't build yet.
// Re-add once auth-service's own code is wired to @transport/core/search.
require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`seed users: ${name} is not set`);
  }
  return value;
}

exports.seed = async function (knex) {
  const { hashPassword } = await import("@transport/core/crypt");

  const seeds = [
    {
      id: requireEnv("ADMIN_USER_ID"),
      name: requireEnv("ADMIN_USER_NAME"),
      email: requireEnv("ADMIN_USER_EMAIL"),
      password: await hashPassword(requireEnv("ADMIN_USER_PASS")),
      active: true,
      role: requireEnv("ADMIN_USER_ROLE"),
    },
    {
      id: requireEnv("MODERATOR_USER_ID"),
      name: requireEnv("MODERATOR_USER_NAME"),
      email: requireEnv("MODERATOR_USER_EMAIL"),
      password: await hashPassword(requireEnv("MODERATOR_USER_PASS")),
      active: true,
      role: requireEnv("MODERATOR_USER_ROLE"),
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Test User",
      email: "test@transport.local",
      password: await hashPassword("test"),
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
