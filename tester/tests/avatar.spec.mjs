import { expect } from "chai";
import tester from "tester";

// Integration test across three services at once (auth-service,
// upload-service, query-service) plus MinIO and Kafka — this is the
// "do they actually work together" check: a real presigned upload
// against upload-service, claimed as an avatar by auth-service (which
// looks for the file at the exact same storage key upload-service wrote
// it to), then verified to have synced into query-db via the normal
// user.updated event. The presigned URLs are fetched directly from this
// process (not proxied through any service, not a docker exec) — exactly
// like a real browser or mobile client would use them, which is only
// possible because of S3_PUBLIC_ENDPOINT (see core/src/s3/index.mts).
describe("#Integration Avatar (upload-service + auth-service + query-service) — avatar.spec.mjs", function () {
  this.timeout(60000);

  before(async function () {
    this.testData = { userId: null, activationToken: null, accessToken: null, uploadId: null, fileContent: null };
  });

  it("Can sign up and activate > auth_signup + auth_activate", async function () {
    const config = this.config;
    const user = config.users.freshAvatar;
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

    const activated = await helpers.hasura.request({
      name: "auth_activate",
      vars: { userId: signupCode.id, token: signupCode.code },
      pick: (response) => response.data.data.auth_activate,
    });
    expect(activated).to.have.property("success", true);
  });

  it("Can log in > auth_login", async function () {
    const config = this.config;
    const user = config.users.freshAvatar;
    const helpers = await tester.helpers(config, ["hasura"]);

    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: user.email, password: user.password },
      pick: (response) => response.data.data.auth_login.data,
    });
    this.testData.accessToken = login.access_token;
    expect(this.testData.accessToken).to.be.a("string");
  });

  it("Can create a presigned upload and PUT the file directly to storage > upload_create", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "rest"]);

    const created = await helpers.hasura.request({
      name: "upload_create",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { filename: "avatar.jpg", mime_type: "image/jpeg" },
      pick: (response) => response.data.data.upload_create.data,
    });
    this.testData.uploadId = created.upload_id;
    expect(created.url).to.include("/transport/uploads/");

    this.testData.fileContent = `tester avatar content ${created.upload_id}`;
    const put = await helpers.rest.request({
      url: created.url,
      method: "PUT",
      body: Buffer.from(this.testData.fileContent),
      headers: { "content-type": "image/jpeg" },
    });
    expect(put.status).to.equal(200);
  });

  it("Can confirm the upload landed correctly > upload_complete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const completed = await helpers.hasura.request({
      name: "upload_complete",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { uploadId: this.testData.uploadId },
      pick: (response) => response.data.data.upload_complete,
    });
    expect(completed).to.have.property("success", true);
    expect(completed.data).to.have.property("mime_type", "image/jpeg");
  });

  it("Can claim it as the avatar > auth_user_avatar_update", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const updated = await helpers.hasura.request({
      name: "auth_user_avatar_update",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      vars: { upload_id: this.testData.uploadId, extension: ".jpg" },
      pick: (response) => response.data.data.auth_user_avatar_update,
    });
    expect(updated).to.have.property("success", true);
  });

  it("auth_me now returns a working avatar url, and it's really the uploaded file > auth_me", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "rest"]);

    const me = await helpers.hasura.request({
      name: "auth_me",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_me,
    });
    expect(me.data.avatar).to.be.a("string").that.is.not.empty;

    const fetched = await helpers.rest.request({ url: me.data.avatar, method: "GET" });
    expect(fetched.status).to.equal(200);
    expect(fetched.data.toString()).to.equal(this.testData.fileContent);
  });

  it("Avatar change synced into query-db > users_by_email", async function () {
    const config = this.config;
    const user = config.users.freshAvatar;
    const helpers = await tester.helpers(config, ["hasura"]);

    const synced = await helpers.hasura.repeat({
      name: "users_by_email",
      vars: { email: user.email },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && Boolean(rows[0].avatar),
    });

    expect(synced[0].avatar).to.be.a("string").that.is.not.empty;
  });

  it("Can remove the avatar > auth_user_avatar_remove", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const removed = await helpers.hasura.request({
      name: "auth_user_avatar_remove",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_user_avatar_remove,
    });
    expect(removed).to.have.property("success", true);
  });

  it("auth_me no longer has an avatar > auth_me", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const me = await helpers.hasura.request({
      name: "auth_me",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_me,
    });
    expect(me.data.avatar).to.not.be.ok;
  });

  it("Avatar removal synced into query-db > users_by_email", async function () {
    const config = this.config;
    const user = config.users.freshAvatar;
    const helpers = await tester.helpers(config, ["hasura"]);

    const synced = await helpers.hasura.repeat({
      name: "users_by_email",
      vars: { email: user.email },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.users,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && !rows[0].avatar,
    });

    expect(synced[0].avatar).to.not.be.ok;
  });

  it("Can delete its own account, cleaning up after itself > auth_user_delete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_user_delete",
      headers: { authorization: `Bearer ${this.testData.accessToken}` },
      pick: (response) => response.data.data.auth_user_delete,
    });

    expect(response).to.have.property("success", true);
  });
});
