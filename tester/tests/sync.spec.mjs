import { expect } from "chai";
import tester from "tester";

// Verifies the actual Kafka sync end to end: auth-service publishes
// user.created/user.updated/user.deleted, core-service makes sure the
// topics exist, query-service's sync map (src/config/broker.mts) applies
// them onto its own local users table. Delivery is async, so every check
// here polls (hasura.repeat) instead of asserting immediately.
describe("#Integration Kafka sync (auth-service -> query-service) — sync.spec.mjs", function () {
  this.timeout(30000);

  before(async function () {
    this.testData = { userId: null, accessToken: null };
  });

  it("user.created reaches query-db's users table > users_by_email", async function () {
    const config = this.config;
    const user = config.users.freshSync;
    const helpers = await tester.helpers(config, ["hasura"]);

    await helpers.hasura.request({
      name: "auth_signup",
      vars: { name: user.name, email: user.email, password: user.password, password_confirmation: user.password },
      pick: (response) => response.data,
    });

    const signupCode = await helpers.hasura.request({
      name: "auth_get_signup_code",
      vars: { account: user.email, system: "email" },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.auth_get_signup_code.data,
    });
    this.testData.userId = signupCode.id;
    await helpers.hasura.request({
      name: "auth_activate",
      vars: { userId: signupCode.id, token: signupCode.code },
      pick: (response) => response.data.data.auth_activate,
    });

    const synced = await helpers.hasura.repeat({
      name: "users_by_email",
      vars: { email: user.email },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1,
    });

    expect(synced).to.have.lengthOf(1);
    expect(synced[0]).to.have.property("id", this.testData.userId);
    expect(synced[0]).to.have.property("name", user.name);
  });

  it("user.updated reaches query-db's users table > users_by_email", async function () {
    const config = this.config;
    const user = config.users.freshSync;
    const helpers = await tester.helpers(config, ["hasura"]);

    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: user.email, password: user.password },
      pick: (response) => response.data.data.auth_login.data,
    });
    this.testData.accessToken = login.access_token;

    await helpers.hasura.request({
      name: "auth_user_profile_update",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { name: user.newName },
      pick: (response) => response.data.data.auth_user_profile_update,
    });

    const synced = await helpers.hasura.repeat({
      name: "users_by_email",
      vars: { email: user.email },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && rows[0].name === user.newName,
    });

    expect(synced[0]).to.have.property("name", user.newName);
  });

  it("user.deleted removes the row from query-db's users table > users_by_email", async function () {
    const config = this.config;
    const user = config.users.freshSync;
    const helpers = await tester.helpers(config, ["hasura"]);

    await helpers.hasura.request({
      name: "auth_user_delete",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_user_delete,
    });

    const synced = await helpers.hasura.repeat({
      name: "users_by_email",
      vars: { email: user.email },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 0,
    });

    expect(synced).to.have.lengthOf(0);
  });
});
