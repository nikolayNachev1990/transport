import { expect } from "chai";
import tester from "tester";

// Integration test for company-service, through Hasura's company_*
// actions — mirrors how a real client (or a future frontend) would use
// it: log in as a real seeded user, not admin-secret role spoofing.
// The async company.requested flow (billing/order asking for a
// company_id for an eik they recognized) is deliberately NOT covered
// here — there's no real producer of that event yet (billing-service/
// order-service don't exist), and it was already verified manually this
// session with a raw kafkajs producer, including the idempotency
// guarantee (two requests for the same new eik -> exactly one row, two
// company.created events). It belongs in that future service's own test
// suite once there's a real caller to test against.
describe("#Integration Company registry (company-service + query-service) — company.spec.mjs", function () {
  this.timeout(60000);

  before(async function () {
    this.testData = { companyId: null, eik: `test-eik-${Date.now()}`, logoUploadId: null, logoContent: null };
  });

  it("Can create a company > company_create", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);
    const auth = await helpers.login.admin();

    const created = await helpers.hasura.request({
      name: "company_create",
      headers: auth,
      vars: { name: "Tester Carrier EOOD", eik: this.testData.eik, country: "BG", is_customer: false, is_tenant: true },
      pick: (response) => response.data.data.company_create,
    });

    expect(created).to.have.property("success", true);
    expect(created.data.id).to.be.a("string");
    this.testData.companyId = created.data.id;
  });

  it("Can edit the company's address and subscription > company_update", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);
    const auth = await helpers.login.admin();

    const updated = await helpers.hasura.request({
      name: "company_update",
      headers: auth,
      vars: {
        companyId: this.testData.companyId,
        address: "1 Vitosha Blvd",
        city: "Sofia",
        subscription_status: "active",
        subscription_valid_until: "2027-01-01T00:00:00.000Z",
      },
      pick: (response) => response.data.data.company_update,
    });

    expect(updated).to.have.property("success", true);
  });

  it("The edit (including the subscription change) shows up in query-db > companies_by_eik", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const rows = await helpers.hasura.repeat({
      name: "companies_by_eik",
      vars: { eik: this.testData.eik },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.companies,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && rows[0].city === "Sofia" && rows[0].subscription_status === "active",
    });

    expect(rows[0]).to.include({ address: "1 Vitosha Blvd", city: "Sofia", is_tenant: true, is_active: true });
  });

  it("Can upload a logo and claim it > upload_create + upload_complete + company_logo_update", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login", "rest"]);
    const auth = await helpers.login.admin();

    const created = await helpers.hasura.request({
      name: "upload_create",
      headers: auth,
      vars: { filename: "logo.png", mime_type: "image/png" },
      pick: (response) => response.data.data.upload_create.data,
    });
    this.testData.logoUploadId = created.upload_id;

    this.testData.logoContent = `tester logo content ${created.upload_id}`;
    const put = await helpers.rest.request({
      url: created.url,
      method: "PUT",
      body: Buffer.from(this.testData.logoContent),
      headers: { "content-type": "image/png" },
    });
    expect(put.status).to.equal(200);

    const completed = await helpers.hasura.request({
      name: "upload_complete",
      headers: auth,
      vars: { uploadId: this.testData.logoUploadId },
      pick: (response) => response.data.data.upload_complete,
    });
    expect(completed).to.have.property("success", true);

    const claimed = await helpers.hasura.request({
      name: "company_logo_update",
      headers: auth,
      vars: { companyId: this.testData.companyId, upload_id: this.testData.logoUploadId, extension: ".png" },
      pick: (response) => response.data.data.company_logo_update,
    });
    expect(claimed).to.have.property("success", true);
  });

  it("The logo is a real, fetchable file, and it's synced into query-db > company_logo_url + companies_by_eik", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login", "rest"]);
    const auth = await helpers.login.admin();

    const gotUrl = await helpers.hasura.request({
      name: "company_logo_url",
      headers: auth,
      vars: { companyId: this.testData.companyId },
      pick: (response) => response.data.data.company_logo_url,
    });
    expect(gotUrl).to.have.property("success", true);

    const fetched = await helpers.rest.request({ url: gotUrl.data.url, method: "GET" });
    expect(fetched.status).to.equal(200);
    expect(fetched.data.toString()).to.equal(this.testData.logoContent);

    const rows = await helpers.hasura.repeat({
      name: "companies_by_eik",
      vars: { eik: this.testData.eik },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.companies,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && Boolean(rows[0].logo),
    });
    expect(rows[0].logo).to.be.a("string").that.is.not.empty;
  });

  it("Can remove the logo, and the removal syncs into query-db > company_logo_remove", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);
    const auth = await helpers.login.admin();

    const removed = await helpers.hasura.request({
      name: "company_logo_remove",
      headers: auth,
      vars: { companyId: this.testData.companyId },
      pick: (response) => response.data.data.company_logo_remove,
    });
    expect(removed).to.have.property("success", true);

    const rows = await helpers.hasura.repeat({
      name: "companies_by_eik",
      vars: { eik: this.testData.eik },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.companies,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && !rows[0].logo,
    });
    expect(rows[0].logo).to.not.be.ok;
  });

  it("Can deactivate the company > company_deactivate", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);
    const auth = await helpers.login.admin();

    const response = await helpers.hasura.request({
      name: "company_deactivate",
      headers: auth,
      vars: { companyId: this.testData.companyId },
      pick: (response) => response.data.data.company_deactivate,
    });

    expect(response).to.have.property("success", true);
  });

  it("The deactivation syncs into query-db > companies_by_eik", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const companies = await helpers.hasura.repeat({
      name: "companies_by_eik",
      vars: { eik: this.testData.eik },
      headers: config.hasura.adminHeaders,
      pick: (response) => response.data.data.companies,
      retry: 20,
      delay: 300,
      validator: (rows) => rows.length === 1 && rows[0].is_active === false,
    });
    expect(companies[0]).to.have.property("is_active", false);
  });

  it("vat-check reports a real error for a company with no VAT number set > company_vat_check", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura", "login"]);
    const auth = await helpers.login.admin();

    const response = await helpers.hasura.request({
      name: "company_vat_check",
      headers: auth,
      vars: { companyId: this.testData.companyId },
      pick: (response) => response.data,
    });

    expect(response.errors?.[0]?.extensions?.[0]).to.include({ code: "MISSING_VAT_NUMBER" });
  });
});
