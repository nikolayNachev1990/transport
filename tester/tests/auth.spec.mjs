import { expect } from "chai";
import tester from "tester";

// Full account lifecycle against the real running stack (Hasura ->
// auth-service, over the "auth_*" actions in hasura/metadata/actions.yaml).
// auth_get_signup_code (admin-only, dev-mode-gated — see
// auth-service/src/auth/rest/getCodeDev.mts) reads the real
// activation/reset code straight out of the DB, so this never depends on
// an actual email provider.
describe("#Integration Auth (email) — auth.spec.mjs", function () {
  this.timeout(60000);

  before(async function () {
    this.testData = {
      userId: null,
      activationToken: null,
      accessToken: null,
      refreshToken: null,
      resetToken: null,
    };
  });

  it("Can sign up with email > auth_signup", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_signup",
      vars: { name: user.name, email: user.email, password: user.password, password_confirmation: user.password },
      pick: (response) => response.data,
    });

    if (response.errors) {
      console.log("auth_signup errors (leftover user from a previous run?):", response.errors);
    }
    expect(response.data?.auth_signup).to.have.property("success", true);
  });

  it("Can read the activation code (admin, dev-only) > auth_get_signup_code", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_get_signup_code",
      vars: { account: user.email, system: "email" },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.auth_get_signup_code,
    });

    expect(response).to.have.property("success", true);
    this.testData.userId = response.data.id;
    this.testData.activationToken = response.data.code;
    expect(this.testData.userId).to.be.a("string");
    expect(this.testData.activationToken).to.be.a("string");
  });

  it("Can activate the account > auth_activate", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_activate",
      vars: { userId: this.testData.userId, token: this.testData.activationToken },
      pick: (response) => response.data.data.auth_activate,
    });

    expect(response).to.have.property("success", true);
  });

  it("Can log in > auth_login", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: user.email, password: user.password },
      pick: (response) => response.data.data.auth_login,
    });

    expect(response).to.have.property("success", true);
    expect(response.data).to.have.property("access_token");
    expect(response.data).to.have.property("refresh_token");
    this.testData.accessToken = response.data.access_token;
    this.testData.refreshToken = response.data.refresh_token;
  });

  it("Can read its own profile > auth_me", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_me",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_me,
    });

    expect(response).to.have.property("success", true);
    expect(response.data).to.have.property("id", this.testData.userId);
    expect(response.data).to.have.property("email", user.email);
    expect(response.data).to.have.property("name", user.name);
  });

  it("Can request a password reset > auth_password_reset", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_password_reset",
      vars: { email: user.email },
      pick: (response) => response.data.data.auth_password_reset,
    });

    expect(response).to.have.property("success", true);
  });

  it("Can read the reset code (admin, dev-only) > auth_get_signup_code", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_get_signup_code",
      vars: { account: user.email, system: "email" },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.auth_get_signup_code,
    });

    expect(response).to.have.property("success", true);
    this.testData.resetToken = response.data.code;
  });

  it("Can confirm the new password > auth_password_confirmation", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_password_confirmation",
      vars: { token: this.testData.resetToken, password: user.newPassword, password_confirmation: user.newPassword },
      pick: (response) => response.data.data.auth_password_confirmation,
    });

    expect(response).to.have.property("success", true);
  });

  it("Can log in with the new password > auth_login", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: user.email, password: user.newPassword },
      pick: (response) => response.data.data.auth_login,
    });

    expect(response).to.have.property("success", true);
    this.testData.accessToken = response.data.access_token;
    this.testData.refreshToken = response.data.refresh_token;
  });

  it("Can update its profile name > auth_user_profile_update", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_user_profile_update",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { name: user.newName },
      pick: (response) => response.data.data.auth_user_profile_update,
    });

    expect(response).to.have.property("success", true);
  });

  it("Can see the updated name > auth_me", async function () {
    const config = this.config;
    const user = config.users.fresh;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_me",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_me,
    });

    expect(response.data).to.have.property("name", user.newName);
  });

  it("Can refresh its access token > auth_refresh", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_refresh",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { refresh_token: this.testData.refreshToken },
      pick: (response) => response.data.data.auth_refresh,
    });

    expect(response).to.have.property("success", true);
    expect(response.data).to.have.property("access_token");
    this.testData.accessToken = response.data.access_token;
    this.testData.refreshToken = response.data.refresh_token;
  });

  it("Can use the refreshed token > auth_me", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_me",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_me,
    });

    expect(response).to.have.property("success", true);
    expect(response.data).to.have.property("id", this.testData.userId);
  });

  it("Can log out > auth_logout", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_logout",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_logout,
    });

    expect(response).to.have.property("success", true);
  });

  it("Can delete its own account, cleaning up after itself > auth_user_delete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    // Deleting needs a valid token — auth_logout above only drops the
    // cached auth entry server-side, the JWT-less opaque token itself is
    // still accepted by a fresh lookup, so this still works.
    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: config.users.fresh.email, password: config.users.fresh.newPassword },
      pick: (response) => response.data.data.auth_login.data,
    });

    const response = await helpers.hasura.request({
      name: "auth_user_delete",
      headers: { authorization: `Bearer ${login.access_token}` },
      pick: (response) => response.data.data.auth_user_delete,
    });

    expect(response).to.have.property("success", true);
  });
});
