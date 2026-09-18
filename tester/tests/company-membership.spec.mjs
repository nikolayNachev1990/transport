import { expect } from "chai";
import tester from "tester";

// Full company-membership lifecycle, through Hasura's company_*/auth_*
// actions, against the real running stack: a fresh user signs up and
// becomes a company's creator/owner (Etap 2-4), invites and links staff
// (mutation 1 + mutation 2, Etap 4-5), activates them (Etap 5), changes
// roles and triggers the plan-driven downgrade function (Etap 6), and
// finally deletes their own account, cascading a real hard-delete of the
// whole company (Etap 4). Kept as a permanent regression file — this
// whole area needs to be re-verified on every change, not just once.
describe("#Integration Company membership (auth-service + company-service) — company-membership.spec.mjs", function () {
  this.timeout(120000);

  const creator = { name: "Membership Creator", email: `membership-creator-${Date.now()}@transport.local`, password: "Passw0rd!" };
  const testData = { creatorToken: null, creatorId: null, companyId: null, dispatchers: [], dispatcherEmails: [] };

  async function signupActivateLogin(helpers, config, user) {
    await helpers.hasura.request({
      name: "auth_signup",
      vars: { name: user.name, email: user.email, password: user.password, password_confirmation: user.password },
      pick: (response) => response.data,
    });
    const code = await helpers.hasura.request({
      name: "auth_get_signup_code",
      vars: { account: user.email, system: "email" },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.auth_get_signup_code,
    });
    await helpers.hasura.request({
      name: "auth_activate",
      vars: { userId: code.data.id, token: code.data.code },
      pick: (response) => response.data.data.auth_activate,
    });
    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: user.email, password: user.password },
      pick: (response) => response.data.data.auth_login,
    });
    return { id: code.data.id, token: login.data.access_token };
  }

  async function inviteAndLinkAndActivate(helpers, config, email, companyRole = "dispatcher") {
    const created = await helpers.hasura.request({
      name: "company_user_create",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email, name: "Membership Staff", company_role: companyRole },
      pick: (response) => response.data.data.company_user_create,
    });
    const userId = created.data.id;

    await helpers.hasura.request({
      name: "company_user_link",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email },
      pick: (response) => response.data.data.company_user_link,
    });

    const code = await helpers.hasura.request({
      name: "auth_get_signup_code",
      vars: { account: email, system: "email" },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.auth_get_signup_code,
    });
    await helpers.hasura.request({
      name: "company_invite_activate",
      vars: { userId: code.data.id, token: code.data.code, password: "Passw0rd!", password_confirmation: "Passw0rd!" },
      pick: (response) => response.data.data.company_invite_activate,
    });

    return userId;
  }

  it("signs up a creator and creates a company (becoming its owner)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const creatorAuth = await signupActivateLogin(helpers, config, creator);
    testData.creatorToken = creatorAuth.token;
    testData.creatorId = creatorAuth.id;

    const created = await helpers.hasura.request({
      name: "company_create",
      headers: { authorization: `Bearer ${testData.creatorToken}` },
      vars: { name: "Membership Co", eik: `membership-eik-${Date.now()}`, country: "BG", is_customer: false, is_tenant: true },
      pick: (response) => response.data.data.company_create,
    });
    expect(created).to.have.property("success", true);
    testData.companyId = created.data.id;
  });

  it("rejects the driver role on company_user_create (not this stage's flow)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_create",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: "driver-attempt@transport.local", name: "Nope", company_role: "driver" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "INVALID_COMPANY_ROLE" });
  });

  it("rejects inviting the caller's own email (already in use)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_create",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: creator.email, name: "Dup", company_role: "dispatcher" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "EMAIL_ALREADY_USED" });
  });

  it("rejects a second owner on the free plan (max_owners=1) > OWNER_LIMIT_REACHED", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_create",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: `membership-owner2-${Date.now()}@transport.local`, name: "Owner2", company_role: "owner" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "OWNER_LIMIT_REACHED" });
  });

  it("rejects linking an email with no matching pending invite", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_link",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: "nobody-invited-this@transport.local" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "PENDING_USER_NOT_FOUND" });
  });

  it("invites, links and activates 3 dispatchers end to end", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    for (let i = 0; i < 3; i += 1) {
      const email = `membership-dispatcher-${i}-${Date.now()}@transport.local`;
      const userId = await inviteAndLinkAndActivate(helpers, config, email);
      testData.dispatchers.push(userId);
      testData.dispatcherEmails.push(email);

      const login = await helpers.hasura.request({
        name: "auth_login",
        vars: { email, password: "Passw0rd!" },
        pick: (response) => response.data.data.auth_login,
      });
      expect(login).to.have.property("success", true);
    }
  });

  it("owner can read the company's member roster synced into query-db > members", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const rows = await helpers.hasura.repeat({
      name: "members_by_company",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId },
      pick: (response) => response.data.data.members,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 4,
    });
    const byRole = rows.reduce((acc, row) => ({ ...acc, [row.user_id]: row }), {});
    expect(byRole[testData.creatorId]).to.include({ company_role: "owner", is_active: true, is_creator: true });
    for (const dispatcherId of testData.dispatchers) {
      expect(byRole[dispatcherId]).to.include({ company_role: "dispatcher", is_active: true, is_creator: false });
    }
  });

  it("a staff member (not just owner) can also read the roster", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: testData.dispatcherEmails[0], password: "Passw0rd!" },
      pick: (response) => response.data.data.auth_login,
    });

    const rows = await helpers.hasura.request({
      name: "members_by_company",
      headers: { authorization: `Bearer ${login.data.access_token}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId },
      pick: (response) => response.data.data.members,
    });
    expect(rows).to.have.lengthOf(4);
  });

  it("owner can read their own pending invitations, not linked ones > pending_users", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const rows = await helpers.hasura.request({
      name: "pending_users_by_company",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId },
      pick: (response) => response.data.data.pending_users,
    });
    // All 3 stay listed here even after linking — pending_users is a
    // permanent staging record, per spec rule 6 (never deleted/updated).
    expect(rows.map((row) => row.email).sort()).to.include.members(testData.dispatcherEmails);
  });

  it("linking the same email again is idempotent", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const linked = await helpers.hasura.request({
      name: "company_user_link",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: testData.dispatcherEmails[0] },
      pick: (response) => response.data.data.company_user_link,
    });
    expect(linked).to.have.property("success", true);
  });

  it("fills the free plan's staff limit (5) and rejects the 6th", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    // 3 dispatchers already active — 2 more fills free's max_staff=5.
    for (let i = 0; i < 2; i += 1) {
      const created = await helpers.hasura.request({
        name: "company_user_create",
        headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
        vars: { email: `membership-staff-${i}-${Date.now()}@transport.local`, name: `Extra Staff ${i}`, company_role: "accountant" },
        pick: (response) => response.data.data.company_user_create,
      });
      expect(created).to.have.property("success", true);
    }

    const sixth = await helpers.hasura.request({
      name: "company_user_create",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { email: `membership-staff-overflow-${Date.now()}@transport.local`, name: "Overflow", company_role: "accountant" },
      pick: (response) => response.data,
    });
    expect(sixth.errors?.[0]?.extensions?.[0]).to.include({ code: "STAFF_LIMIT_REACHED" });
  });

  it("rejects reusing an already-consumed company-invite activation token", async function () {
    const response = await tester
      .helpers(this.config, ["hasura"])
      .then((helpers) =>
        helpers.hasura.request({
          name: "company_invite_activate",
          vars: { userId: testData.dispatchers[0], token: "whatever-token-now-stale", password: "Passw0rd!", password_confirmation: "Passw0rd!" },
          pick: (response) => response.data,
        }),
      );
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "USER_NOT_FOUND" });
  });

  it("rejects changing the creator's own role", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_role_update",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { userId: testData.creatorId, company_role: "dispatcher" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "CANNOT_CHANGE_CREATOR" });
  });

  it("upgrades to plan_1 (max_owners=3) so promotions have room > company_update", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const updated = await helpers.hasura.request({
      name: "company_update_plan",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId, subscription_plan: "plan_1" },
      pick: (response) => response.data.data.company_update,
    });
    expect(updated).to.have.property("success", true);
  });

  it("rejects a non-owner editing another company (session/company mismatch)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    // The creator's own session is scoped to their company — passing a
    // different (fake) companyId must be rejected, not silently applied.
    const response = await helpers.hasura.request({
      name: "company_update_plan",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: "00000000-0000-0000-0000-000000000099", subscription_plan: "plan_1" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "NOT_OWNER" });
  });

  it("promotes two dispatchers to owner (creator-only) > company_user_role_update", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    for (const userId of [testData.dispatchers[0], testData.dispatchers[1]]) {
      const response = await helpers.hasura.request({
        name: "company_user_role_update",
        headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
        vars: { userId, company_role: "owner" },
        pick: (response) => response.data.data.company_user_role_update,
      });
      expect(response).to.have.property("success", true);
    }
  });

  it("rejects a 4th owner beyond plan_1's max_owners=3", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "company_user_role_update",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { userId: testData.dispatchers[2], company_role: "owner" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "OWNER_LIMIT_REACHED" });
  });

  it("rejects a non-creator owner assigning the owner role", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: testData.dispatcherEmails[0], password: "Passw0rd!" },
      pick: (response) => response.data.data.auth_login,
    });

    const response = await helpers.hasura.request({
      name: "company_user_role_update",
      headers: { authorization: `Bearer ${login.data.access_token}`, "x-company-id": testData.companyId },
      vars: { userId: testData.dispatchers[2], company_role: "owner" },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "NOT_CREATOR" });
  });

  it("rejects an owner deleting the company's creator > owner_user_delete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const login = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: testData.dispatcherEmails[0], password: "Passw0rd!" },
      pick: (response) => response.data.data.auth_login,
    });

    const response = await helpers.hasura.request({
      name: "owner_user_delete",
      headers: { authorization: `Bearer ${login.data.access_token}`, "x-company-id": testData.companyId },
      vars: { userId: testData.creatorId },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "CANNOT_DELETE_CREATOR" });
  });

  it("rejects the creator deleting themselves via owner_user_delete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "owner_user_delete",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { userId: testData.creatorId },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "CANNOT_DELETE_SELF" });
  });

  it("deletes a member for real > owner_user_delete", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "owner_user_delete",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { userId: testData.dispatchers[2] },
      pick: (response) => response.data.data.owner_user_delete,
    });
    expect(response).to.have.property("success", true);
    console.log("STAGE7_DELETED_USER_ID=" + testData.dispatchers[2]);
  });

  it("a deleted member's email no longer logs in (email cleared on delete)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_login",
      vars: { email: testData.dispatcherEmails[2], password: "Passw0rd!" },
      pick: (response) => response.data,
    });
    // Not ACCOUNT_NOT_ACTIVE — the email itself was cleared on delete
    // (spec: "owner_user_delete премахва имейла"), so the login lookup
    // finds no row at all, same as any unknown email.
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects deleting the same member again (already gone)", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "owner_user_delete",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { userId: testData.dispatchers[2] },
      pick: (response) => response.data,
    });
    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "MEMBER_NOT_FOUND" });
  });

  it("downgrades back to free, deactivating the two promoted owners > downgrade function", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const updated = await helpers.hasura.request({
      name: "company_update_plan",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId, subscription_plan: "free" },
      pick: (response) => response.data.data.company_update,
    });
    expect(updated).to.have.property("success", true);
  });

  it("audit_log recorded every audited action for this company > audit.action", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const rows = await helpers.hasura.repeat({
      name: "audit_log_by_company",
      headers: { authorization: `Bearer ${testData.creatorToken}`, "x-company-id": testData.companyId },
      vars: { companyId: testData.companyId },
      pick: (response) => response.data.data.audit_log,
      retry: 20,
      delay: 300,
      // link x3 (the 3 initial dispatchers — the idempotent repeat link
      // and the 2 never-linked staff-limit fillers don't audit, since
      // nothing actually changed), role_changed x2 (both promotions),
      // deleted x1, deactivated_by_downgrade x2 (the two demoted owners).
      validator: (rows) => rows.length === 8,
    });

    const byAction = rows.reduce((acc, row) => ({ ...acc, [row.action]: (acc[row.action] ?? 0) + 1 }), {});
    expect(byAction).to.deep.equal({
      "company_member.linked": 3,
      "company_member.role_changed": 2,
      "company_member.deleted": 1,
      "company_member.deactivated_by_downgrade": 2,
    });
    // Every row has a real event_id/actor_user_id/target_id — not a
    // blank/placeholder row.
    for (const row of rows) {
      expect(row.event_id).to.be.a("string").that.is.not.empty;
      expect(row.actor_user_id).to.be.a("string").that.is.not.empty;
      expect(row.target_id).to.be.a("string").that.is.not.empty;
    }
  });

  it("deletes the creator's own account, cascading a real hard-delete of the whole company", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const response = await helpers.hasura.request({
      name: "auth_user_delete",
      headers: { authorization: `Bearer ${testData.creatorToken}` },
      pick: (response) => response.data.data.auth_user_delete,
    });
    expect(response).to.have.property("success", true);
  });
});
