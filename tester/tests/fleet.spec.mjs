import { expect } from "chai";
import tester from "tester";

// Integration test for fleet-service, through Hasura's fleet_* actions —
// covers Etaps 2-6 (vehicles/trailers, combinations, documents, odometer,
// damage reports) and the request/reject half of Etap 8's recognition
// contract, against the real running stack. Kept as a permanent
// regression file, same rule as company-membership.spec.mjs.
//
// NOT covered here, and why — a pre-existing, already-documented gap
// (see PROJECT-CONTEXT.md's fleet-service section), not an oversight:
//   - anything requiring a `drivers` row (driver profile, vehicle_drivers,
//     driver-subject documents, driver-hinted extractions) — company-
//     service's driver-invite flow doesn't exist yet, so there is no real
//     way for company_role='driver' to ever reach fleet_db.drivers.
//
// The confirm half of the recognition contract (fleet_extraction_confirm)
// still needs a real doc.extraction.completed event to reach `proposed`
// first — doc-service doesn't exist yet (SPEC-doc-service.md), so that
// path isn't covered here either; request/reject don't need it.
describe("#Integration Fleet (fleet-service + query-service) — fleet.spec.mjs", function () {
  this.timeout(120000);

  const owner = { name: "Fleet Owner", email: `fleet-owner-${Date.now()}@transport.local`, password: "Passw0rd!" };
  const testData = { ownerToken: null, companyId: null, vehicleId: null, vehicleVersion: null, trailerId: null, combinationId: null, documentId: null };

  // fleet-service's VIN alphabet excludes I/O/Q (easily confused with
  // 1/0), same rule as the real ISO 3779 standard — see
  // fleet-service/src/fleet/lib/normalize.mts.
  const VIN_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  function randomVin() {
    let vin = "";
    for (let i = 0; i < 17; i += 1) vin += VIN_ALPHABET[Math.floor(Math.random() * VIN_ALPHABET.length)];
    return vin;
  }

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

  function authHeaders() {
    return { authorization: `Bearer ${testData.ownerToken}`, "x-company-id": testData.companyId };
  }

  it("signs up an owner and creates a company", async function () {
    const config = this.config;
    const helpers = await tester.helpers(config, ["hasura"]);

    const ownerAuth = await signupActivateLogin(helpers, config, owner);
    testData.ownerToken = ownerAuth.token;

    const created = await helpers.hasura.request({
      name: "company_create",
      headers: { authorization: `Bearer ${testData.ownerToken}` },
      vars: { name: "Fleet Co", eik: `fleet-eik-${Date.now()}`, country: "BG", is_customer: false, is_tenant: true },
      pick: (response) => response.data.data.company_create,
    });
    expect(created).to.have.property("success", true);
    testData.companyId = created.data.id;

    // fleet-service mirrors companies/plans from company.created/plan.
    // upserted — give the consumer a moment before the first fleet_*
    // write, same pattern as sync.spec.mjs uses for cross-service waits.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  describe("vehicles", function () {
    it("creates a vehicle > fleet_vehicle_create", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const result = await helpers.hasura.request({
        name: "fleet_vehicle_create",
        headers: authHeaders(),
        vars: { kind: "tractor_unit", registration_number: `CA${Date.now() % 10000}XX`, registration_country: "BG", vin: randomVin(), make: "Volvo" },
        pick: (response) => response.data.data.fleet_vehicle_create,
      });
      expect(result).to.have.property("success", true);
      expect(result.data).to.have.property("version", 1);
      testData.vehicleId = result.data.id;
      testData.vehicleVersion = result.data.version;
    });

    it("rejects a duplicate VIN > fleet_vehicle_create", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const vin = randomVin();

      const first = await helpers.hasura.request({
        name: "fleet_vehicle_create",
        headers: authHeaders(),
        vars: { kind: "van", registration_number: `CB${Date.now() % 10000}YY`, registration_country: "BG", vin, make: "Ford" },
        pick: (response) => response.data,
      });
      expect(first.data.fleet_vehicle_create.success).to.equal(true);

      const second = await helpers.hasura.request({
        name: "fleet_vehicle_create",
        headers: authHeaders(),
        vars: { kind: "van", registration_number: `CC${Date.now() % 10000}WW`, registration_country: "BG", vin, make: "Ford" },
        pick: (response) => response.data,
      });
      expect(second.errors?.[0]?.extensions?.[0]?.code).to.equal("FLEET_DUPLICATE_VIN");
    });

    it("updates a vehicle (optimistic locking) > fleet_vehicle_update", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);

      const stale = await helpers.hasura.request({
        name: "fleet_vehicle_update",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: 99, color: "red" },
        pick: (response) => response.data,
      });
      expect(stale.errors?.[0]?.extensions?.[0]?.code).to.equal("FLEET_VERSION_CONFLICT");

      const result = await helpers.hasura.request({
        name: "fleet_vehicle_update",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: testData.vehicleVersion, color: "red" },
        pick: (response) => response.data.data.fleet_vehicle_update,
      });
      expect(result).to.have.property("success", true);
      testData.vehicleVersion = result.data.version;
    });

    it("reflects the update in query_db > fleet_vehicles", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const rows = await helpers.hasura.request({
        name: "fleet_vehicles_by_id",
        headers: authHeaders(),
        vars: { id: testData.vehicleId },
        pick: (response) => response.data.data.fleet_vehicles,
      });
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].color).to.equal("red");
      expect(rows[0].version).to.equal(testData.vehicleVersion);
    });

    it("changes status and registration > fleet_vehicle_set_status / fleet_vehicle_registration_change", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);

      const statusResult = await helpers.hasura.request({
        name: "fleet_vehicle_set_status",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: testData.vehicleVersion, status: "in_workshop" },
        pick: (response) => response.data.data.fleet_vehicle_set_status,
      });
      expect(statusResult).to.have.property("success", true);
      testData.vehicleVersion = statusResult.data.version;

      const regResult = await helpers.hasura.request({
        name: "fleet_vehicle_registration_change",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: testData.vehicleVersion, registration_number: `CN${Date.now() % 10000}ZZ`, registration_country: "BG" },
        pick: (response) => response.data.data.fleet_vehicle_registration_change,
      });
      expect(regResult).to.have.property("success", true);
      testData.vehicleVersion = regResult.data.version;
    });

    it("soft-deletes then restores a vehicle > fleet_vehicle_delete / fleet_vehicle_restore", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);

      const deleted = await helpers.hasura.request({
        name: "fleet_vehicle_delete",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: testData.vehicleVersion },
        pick: (response) => response.data.data.fleet_vehicle_delete,
      });
      expect(deleted).to.have.property("success", true);
      testData.vehicleVersion = deleted.data.version;

      const restored = await helpers.hasura.request({
        name: "fleet_vehicle_restore",
        headers: authHeaders(),
        vars: { id: testData.vehicleId, expected_version: testData.vehicleVersion },
        pick: (response) => response.data.data.fleet_vehicle_restore,
      });
      expect(restored).to.have.property("success", true);
      testData.vehicleVersion = restored.data.version;
    });
  });

  describe("trailers and combinations", function () {
    it("creates a trailer > fleet_trailer_create", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const result = await helpers.hasura.request({
        name: "fleet_trailer_create",
        headers: authHeaders(),
        vars: {
          kind: "semi_trailer",
          body_type: "curtainsider",
          registration_number: `CT${Date.now() % 10000}TT`,
          registration_country: "BG",
          vin: randomVin(),
          make: "Schmitz",
        },
        pick: (response) => response.data.data.fleet_trailer_create,
      });
      expect(result).to.have.property("success", true);
      testData.trailerId = result.data.id;
    });

    it("attaches then detaches a combination > fleet_combination_attach / fleet_combination_detach", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);

      const attached = await helpers.hasura.request({
        name: "fleet_combination_attach",
        headers: authHeaders(),
        vars: { vehicle_id: testData.vehicleId, trailer_id: testData.trailerId },
        pick: (response) => response.data.data.fleet_combination_attach,
      });
      expect(attached).to.have.property("success", true);
      testData.combinationId = attached.data.id;

      const detached = await helpers.hasura.request({
        name: "fleet_combination_detach",
        headers: authHeaders(),
        vars: { id: testData.combinationId, expected_version: attached.data.version },
        pick: (response) => response.data.data.fleet_combination_detach,
      });
      expect(detached).to.have.property("success", true);
    });
  });

  describe("documents", function () {
    it("creates a document > fleet_document_create", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const result = await helpers.hasura.request({
        name: "fleet_document_create",
        headers: authHeaders(),
        vars: { document_type_code: "mtpl", vehicle_id: testData.vehicleId, document_number: "TESTER-MTPL-001", country: "BG" },
        pick: (response) => response.data.data.fleet_document_create,
      });
      expect(result).to.have.property("success", true);
      testData.documentId = result.data.id;
    });

    it("rejects a second current document of the same type for the same vehicle", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const response = await helpers.hasura.request({
        name: "fleet_document_create",
        headers: authHeaders(),
        vars: { document_type_code: "mtpl", vehicle_id: testData.vehicleId, document_number: "TESTER-MTPL-002", country: "BG" },
        pick: (response) => response.data,
      });
      expect(response.errors?.[0]?.extensions?.[0]?.code).to.equal("FLEET_DOCUMENT_ALREADY_CURRENT");
    });

    it("updates then renews the document > fleet_document_update / fleet_document_renew", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);

      const updated = await helpers.hasura.request({
        name: "fleet_document_update",
        headers: authHeaders(),
        vars: { id: testData.documentId, expected_version: 1, notes: "checked by tester" },
        pick: (response) => response.data.data.fleet_document_update,
      });
      expect(updated).to.have.property("success", true);

      const renewed = await helpers.hasura.request({
        name: "fleet_document_renew",
        headers: authHeaders(),
        vars: { id: testData.documentId, document_number: "TESTER-MTPL-001-RENEWED", valid_to: "2030-01-01" },
        pick: (response) => response.data.data.fleet_document_renew,
      });
      expect(renewed).to.have.property("success", true);
      expect(renewed.data.id).to.not.equal(testData.documentId);
    });
  });

  describe("odometer and damage reports", function () {
    it("records an odometer reading > fleet_odometer_record", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const result = await helpers.hasura.request({
        name: "fleet_odometer_record",
        headers: authHeaders(),
        vars: { vehicle_id: testData.vehicleId, value_km: 50000, read_at: new Date().toISOString(), origin: "manual" },
        pick: (response) => response.data.data.fleet_odometer_record,
      });
      expect(result).to.have.property("success", true);
    });

    it("reports a damage event > fleet_damage_report_create", async function () {
      const helpers = await tester.helpers(this.config, ["hasura"]);
      const result = await helpers.hasura.request({
        name: "fleet_damage_report_create",
        headers: authHeaders(),
        vars: { vehicle_id: testData.vehicleId, kind: "damage", occurred_at: new Date().toISOString(), description: "Tester-reported scratch" },
        pick: (response) => response.data.data.fleet_damage_report_create,
      });
      expect(result).to.have.property("success", true);
    });
  });

  describe("recognition — request/reject (SPEC-fleet-service.md §13)", function () {
    it("uploads a file, requests extraction, then rejects it", async function () {
      const helpers = await tester.helpers(this.config, ["hasura", "rest"]);

      const created = await helpers.hasura.request({
        name: "upload_create",
        headers: authHeaders(),
        vars: { filename: "talon.jpg", mime_type: "image/jpeg" },
        pick: (response) => response.data.data.upload_create.data,
      });

      const put = await helpers.rest.request({
        url: created.url,
        method: "PUT",
        body: Buffer.from("fake jpeg bytes"),
        headers: { "content-type": "image/jpeg" },
      });
      expect(put.status).to.equal(200);

      const completed = await helpers.hasura.request({
        name: "upload_complete",
        headers: authHeaders(),
        vars: { uploadId: created.upload_id },
        pick: (response) => response.data.data.upload_complete,
      });
      expect(completed).to.have.property("success", true);

      // upload.completed -> fleet-service's files consumer needs a moment.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const requested = await helpers.hasura.request({
        name: "fleet_extraction_request",
        headers: authHeaders(),
        vars: { file_id: created.upload_id },
        pick: (response) => response.data.data.fleet_extraction_request,
      });
      expect(requested).to.have.property("success", true);

      const rejected = await helpers.hasura.request({
        name: "fleet_extraction_reject",
        headers: authHeaders(),
        vars: { id: requested.data.id, reason: "tester cleanup" },
        pick: (response) => response.data.data.fleet_extraction_reject,
      });
      expect(rejected).to.have.property("success", true);
    });

    it("rejects a duplicate request for the same file > FLEET_EXTRACTION_ALREADY_REQUESTED", async function () {
      const helpers = await tester.helpers(this.config, ["hasura", "rest"]);

      const created = await helpers.hasura.request({
        name: "upload_create",
        headers: authHeaders(),
        vars: { filename: "talon2.jpg", mime_type: "image/jpeg" },
        pick: (response) => response.data.data.upload_create.data,
      });
      await helpers.rest.request({ url: created.url, method: "PUT", body: Buffer.from("fake jpeg bytes"), headers: { "content-type": "image/jpeg" } });
      await helpers.hasura.request({
        name: "upload_complete",
        headers: authHeaders(),
        vars: { uploadId: created.upload_id },
        pick: (response) => response.data,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const first = await helpers.hasura.request({
        name: "fleet_extraction_request",
        headers: authHeaders(),
        vars: { file_id: created.upload_id },
        pick: (response) => response.data.data.fleet_extraction_request,
      });
      expect(first).to.have.property("success", true);

      const second = await helpers.hasura.request({
        name: "fleet_extraction_request",
        headers: authHeaders(),
        vars: { file_id: created.upload_id },
        pick: (response) => response.data,
      });
      expect(second.errors?.[0]?.extensions?.[0]?.code).to.equal("FLEET_EXTRACTION_ALREADY_REQUESTED");
    });
  });
});
