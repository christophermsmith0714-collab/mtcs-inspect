import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  blankRecord, blankRow, dispositionColumns, operationalRecordSchema, recordCompletionErrors,
  recordSections, recordTemplates, recordFacilityName, quarterlySummary, transferColumns, visibleInspectionTemplates, type RecordType,
} from "../shared/operational-records";

let storage: typeof import("../server/storage").storage;
let ensureRecordTemplates: typeof import("../server/storage").ensureRecordTemplates;
let app: express.Express;
let token: string, otherToken: string, ownerId: number;

function completedRecord(kind: RecordType) {
  const record = blankRecord(kind);
  for (const field of recordSections[kind].flatMap(section => section.fields)) {
    record.fields[field.key] = field.type === "date" ? "2026-10-26" : field.type === "time" ? "12:30" : field.type === "yesno" ? "yes" : "Test value";
  }
  if (kind === "transfer_log") record.rows = [{
    date: "2026-10-26", tankId: "Tank 1", initials: "AB", gaugeReading: "4 ft", initialVolume: "100",
    receivingContainer: "Receiver 2", receivingCapacity: "50", addedRemoved: "-20.5", comments: "Test transfer",
  }];
  if (kind === "controlled_drainage") record.rows = [{ location: "Portable tank", method: "Collected for disposal", date: "2026-10-26" }];
  record.checks = record.checks.map((check, index) => ({ ...check, ...(kind === "american_concrete_quarterly" ? { deficiency: index === 0 ? "Debris at outfall" : "", correctiveAction: index === 0 ? "Remove debris" : "", closeoutDate: "" } : {}), answer: index === 0 ? "no" : index === 1 ? "n/a" : "yes", comments: index === 0 ? "Corrected before transfer" : "" }));
  return record;
}

beforeAll(async () => {
  process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "mtcs-record-test-")), "test.db");
  process.env.RESEND_API_KEY = "re_local_test_only";
  const legacy = new Database(process.env.DB_PATH);
  legacy.exec(`CREATE TABLE inspection_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT);
    INSERT INTO inspection_templates VALUES (1, 'Existing SPCC', 'spcc', 'Keep this');
    CREATE TABLE inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, template_id INTEGER NOT NULL, facility_name TEXT NOT NULL, facility_address TEXT, inspector_name TEXT NOT NULL, inspection_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', general_comments TEXT, created_at TEXT NOT NULL, completed_at TEXT);
    INSERT INTO inspections (user_id, template_id, facility_name, inspector_name, inspection_date, created_at) VALUES (1, 1, 'Legacy location', 'Inspector', '2025-01-01', '2025-01-01');`);
  legacy.close();
  ({ storage, ensureRecordTemplates } = await import("../server/storage"));
  ensureRecordTemplates();
  const owner = await storage.createUser({ name: "Owner", email: "owner@example.test", password: "local-test-only", role: "client", assignedTemplates: "[1]" });
  ownerId = owner.id;
  const other = await storage.createUser({ name: "Other", email: "other@example.test", password: "local-test-only", role: "client" });
  token = storage.createToken(owner.id, "client").token;
  otherToken = storage.createToken(other.id, "client").token;
  app = express(); app.use(express.json());
  const { extractAuth } = await import("../server/middleware"); app.use(extractAuth);
  (app as any).__loginLimiter = (_req: unknown, _res: unknown, next: () => void) => next();
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(createServer(app), app);
});

describe("SPCC operational records", () => {
  it("migrates existing databases and seeds once without overwriting templates", () => {
    expect(storage.getInspection(1)?.facilityName).toBe("Legacy location");
    expect(storage.getInspection(1)?.recordData).toBeNull();
    const template = storage.getTemplates().find(item => item.type === "transfer_log")!;
    storage.updateTemplate(template.id, { name: "Customized transfer log" });
    ensureRecordTemplates(); ensureRecordTemplates();
    expect(storage.getTemplate(template.id)?.name).toBe("Customized transfer log");
    for (const template of recordTemplates) expect(storage.getTemplates().filter(item => item.type === template.type)).toHaveLength(1);
  });

  it("includes the three forms for clients assigned SPCC, without exposing other templates", () => {
    const all = storage.getTemplates();
    const visible = visibleInspectionTemplates(all, { role: "client", assignedTemplates: [1] });
    expect(visible.map(item => item.type).sort()).toEqual(["controlled_drainage", "spcc", "transfer_checklist", "transfer_log"]);
    expect(visibleInspectionTemplates(all, { role: "client", assignedTemplates: [] })).toEqual([]);
  });

  for (const { type } of recordTemplates) it(`saves, reloads, completes, exports, and reopens ${type} with the correct site metadata`, async () => {
    const templateId = storage.getTemplates().find(template => template.type === type)!.id;
    const created = await request(app).post("/api/inspections").set("Authorization", `Bearer ${token}`).send({
      templateId, inspectorName: "Test inspector", inspectionDate: "2026-10-26", recordData: blankRecord(type),
      facilityName: "Must not be stored", facilityAddress: "Must not be stored",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body.userId).toBe(ownerId);
    expect(created.body.facilityName).toBe(recordFacilityName(type)); expect(created.body.facilityAddress).toBe("");
    expect((await request(app).patch(`/api/inspections/${id}`).set("Authorization", `Bearer ${token}`).send({ status: "completed" })).status).toBe(400);
    const complete = completedRecord(type);
    const saved = await request(app).patch(`/api/inspections/${id}`).set("Authorization", `Bearer ${token}`).send({ recordData: complete, status: "completed" });
    expect(saved.status).toBe(200); expect(saved.body.status).toBe("completed"); expect(saved.body.completedAt).toBeTruthy();
    const loaded = await request(app).get(`/api/inspections/${id}`).set("Authorization", `Bearer ${token}`);
    expect(loaded.body.recordData).toEqual(complete);
    const list = await request(app).get("/api/inspections?includeAnswers=true").set("Authorization", `Bearer ${token}`);
    expect(list.body.find((item: any) => item.id === id).recordData).toEqual(complete);
    const pdf = await request(app).get(`/api/inspections/${id}/record-pdf`).set("Authorization", `Bearer ${token}`);
    expect(pdf.status).toBe(200); expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await request(app).get(`/api/inspections/${id}/record-pdf`)).status).toBe(401);
    expect((await request(app).get(`/api/inspections/${id}/record-pdf`).set("Authorization", `Bearer ${otherToken}`)).status).toBe(403);
    expect((await request(app).patch(`/api/inspections/${id}`).set("Authorization", `Bearer ${otherToken}`).send({ recordData: complete })).status).toBe(403);
    const reopened = await request(app).patch(`/api/inspections/${id}`).set("Authorization", `Bearer ${token}`).send({ recordData: blankRecord(type) });
    expect(reopened.body.status).toBe("in_progress"); expect(reopened.body.completedAt).toBeNull();
    expect((await request(app).patch(`/api/inspections/${id}`).set("Authorization", `Bearer ${token}`).send({ recordData: { ...complete, kind: "wrong" } })).status).toBe(400);
  });

  it("still requires facility details for existing SPCC inspections", async () => {
    const result = await request(app).post("/api/inspections").set("Authorization", `Bearer ${token}`).send({ templateId: 1, inspectorName: "Inspector", inspectionDate: "2026-10-26", facilityName: "" });
    expect(result.status).toBe(400);
  });
});

describe("record input and completion rules", () => {
  it("validates dates and quantities, allowing zero volume and signed removal quantities", () => {
    const record = completedRecord("transfer_log"); record.rows[0].initialVolume = "0";
    expect(operationalRecordSchema.safeParse(record).success).toBe(true);
    expect(recordCompletionErrors(record)).toEqual([]);
    for (const [key, value] of [["date", "2026-02-30"], ["receivingCapacity", "-1"], ["addedRemoved", "NaN"]]) {
      expect(operationalRecordSchema.safeParse({ ...record, rows: [{ ...record.rows[0], [key]: value }] }).success).toBe(false);
    }
    record.rows.push(blankRow(transferColumns)); expect(recordCompletionErrors(record).length).toBeGreaterThan(0);
  });
  it("requires all 14 checks, accepts N/A, and preserves comments", () => {
    const record = completedRecord("transfer_checklist");
    expect(record.checks).toHaveLength(14); expect(recordCompletionErrors(record)).toEqual([]);
    record.checks[4].answer = ""; expect(recordCompletionErrors(record)).toContain("Check 5");
    expect(operationalRecordSchema.safeParse({ ...record, checks: [] }).success).toBe(false);
  });
  it("keeps disposition optional but requires each added entry to be completed", () => {
    const record = completedRecord("controlled_drainage"); record.rows = [];
    expect(recordCompletionErrors(record)).toEqual([]);
    record.rows.push(blankRow(dispositionColumns)); expect(recordCompletionErrors(record).length).toBe(3);
    expect(operationalRecordSchema.safeParse({ ...record, fields: { ...record.fields, facilityName: "Unexpected" } }).success).toBe(false);
  });
});


describe("American Concrete quarterly stormwater checklist", () => {
  it("keeps the site checklist separately assigned from SPCC forms", () => {
    const all = storage.getTemplates();
    const quarterly = all.find(item => item.type === "american_concrete_quarterly")!;
    expect(visibleInspectionTemplates(all, { role: "client", assignedTemplates: [quarterly.id] })).toEqual([quarterly]);
    expect(visibleInspectionTemplates(all, { role: "admin" })).toContainEqual(quarterly);
  });
  it("allows skipped and N/A checks with open deficiencies, but requires a corrective action for NO", () => {
    const record = completedRecord("american_concrete_quarterly");
    record.checks[2].answer = "";
    expect(record.checks).toHaveLength(71);
    expect(recordCompletionErrors(record)).toEqual([]);
    expect(quarterlySummary(record)).toEqual({ count: 1, openNumbers: [1], allClosed: false });
    record.checks[0].correctiveAction = "";
    expect(recordCompletionErrors(record)).toContain("Check 1: Corrective action");
    record.checks[0].correctiveAction = "Debris removed";
    record.checks[0].closeoutDate = "2026-10-30";
    expect(quarterlySummary(record).allClosed).toBe(true);
    expect(operationalRecordSchema.safeParse(record).success).toBe(true);
    record.checks[0].closeoutDate = "2026-02-30";
    expect(operationalRecordSchema.safeParse(record).success).toBe(false);
    expect(operationalRecordSchema.safeParse({ ...record, checks: [] }).success).toBe(false);
  });
  it("requires sign-off and details for an identified SWPPP change", () => {
    const record = completedRecord("american_concrete_quarterly");
    record.fields.swpppDetails = "";
    record.fields.reviewSignature = "";
    expect(recordCompletionErrors(record)).toContain("SWPPP change details");
    expect(recordCompletionErrors(record)).toContain("Reviewer signature (typed name)");
  });
});
