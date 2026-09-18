import { expect } from "chai";
import tester from "tester";

// Smoke test for the 3 bootstrap accounts auth-service/src/seeds/*_users.js
// creates, and for the two query-db tables Hasura tracks
// (hasura/metadata/databases/query-db/tables/).
describe("#Integration Seeded users + tracked tables — seeded-users.spec.mjs", function () {
  this.timeout(30000);

  it("admin can log in and auth_me reports role=admin", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);

    const headers = await helpers.login.admin();
    const response = await helpers.hasura.request({
      name: "auth_me",
      headers,
      pick: (response) => response.data.data.auth_me,
    });

    expect(response.data).to.have.property("email", config.users.admin.email);
  });

  it("moderator can log in", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);

    const headers = await helpers.login.moderator();
    const response = await helpers.hasura.request({
      name: "auth_me",
      headers,
      pick: (response) => response.data.data.auth_me,
    });

    expect(response.data).to.have.property("email", config.users.moderator.email);
  });

  it("test user can log in", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);

    const headers = await helpers.login.test();
    const response = await helpers.hasura.request({
      name: "auth_me",
      headers,
      pick: (response) => response.data.data.auth_me,
    });

    expect(response.data).to.have.property("email", config.users.test.email);
  });

  it("query-db's users table is tracked and admin-queryable > users", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "users",
      vars: { limit: 10 },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
    });

    expect(response).to.be.an("array");
  });

  it("query-db's force_update_min_version table is tracked > force_update_min_version", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "force_update_min_version",
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.force_update_min_version,
    });

    expect(response).to.be.an("array");
  });
});
