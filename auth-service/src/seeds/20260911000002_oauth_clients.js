// Consolidated from auth/seeds/{develop,production}/oauth_clients.js (the
// two were identical). Dropped the "(rival24)" Apple/Google grant client
// entries — a different platform's OAuth clients, not applicable here.
require("dotenv").config();
const randomstring = require("randomstring");

function generateSecret() {
  return randomstring.generate({ length: 40, charset: "alphabetic" });
}

exports.seed = async function (knex) {
  const seeds = [
    {
      id: 1,
      name: "Password Grant Client",
      secret: generateSecret(),
      provider: "users",
      redirect: "",
      personal_access_client: false,
      password_client: true,
      revoked: false,
    },
    {
      id: 2,
      name: "Google Grant Client",
      secret: generateSecret(),
      provider: "google",
      redirect: process.env.AUTHORIZATION_CODE_REDIRECT_URL,
      personal_access_client: false,
      password_client: true,
      revoked: false,
    },
    {
      id: 3,
      name: "Apple Grant Client",
      secret: generateSecret(),
      provider: "apple",
      redirect: process.env.AUTHORIZATION_CODE_REDIRECT_URL,
      personal_access_client: false,
      password_client: true,
      revoked: false,
    },
  ];

  for (const seed of seeds) {
    const exists = await knex("oauth_clients").select().where({ provider: seed.provider }).first();
    if (!exists) {
      await knex("oauth_clients").insert(seed);
    }
  }
};
