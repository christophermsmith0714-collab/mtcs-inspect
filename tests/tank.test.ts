import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { emptyTankDetails, tankChecklistComplete, tankDetailsSchema } from "../shared/tank";
import { tankQuestions } from "../shared/tank-checklist";

let storage: typeof import("../server/storage").storage;
let ensureTankTemplate: typeof import("../server/storage").ensureTankTemplate;
let app: express.Express;
let token: string, otherToken: string, templateId: number, inspectionId: number;
let questions: { id: number; section: string; questionText: string; recommendResponse?: string | null }[];
const details = { ...emptyTankDetails(), tankId: "T-101", reportReference: "IT-TEST-2026", product: "Diesel", capacity: "10,000 gallons", limitations: "Underside not accessible" };

beforeAll(async () => {
  process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "mtcs-tank-test-")), "test.db");
  process.env.RESEND_API_KEY = "re_local_test_only";
  // Model an existing installation, with an inspection saved before this feature.
  const legacy = new Database(process.env.DB_PATH);
  legacy.exec(`CREATE TABLE inspection_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT);
    INSERT INTO inspection_templates VALUES (1, 'Existing custom checklist', 'custom', 'Keep this');
    CREATE TABLE inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, template_id INTEGER NOT NULL, facility_name TEXT NOT NULL, facility_address TEXT, inspector_name TEXT NOT NULL, inspection_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', general_comments TEXT, created_at TEXT NOT NULL, completed_at TEXT);
    INSERT INTO inspections (user_id, template_id, facility_name, inspector_name, inspection_date, created_at) VALUES (1, 1, 'Legacy facility', 'Inspector', '2025-01-01', '2025-01-01');`);
  legacy.close();
  ({ storage, ensureTankTemplate } = await import("../server/storage"));
  ensureTankTemplate();
  const admin = await storage.createUser({ name: "Test admin", email: "test-admin@example.test", password: "local-test-only", role: "admin" });
  const other = await storage.createUser({ name: "Other client", email: "other@example.test", password: "local-test-only", role: "client" });
  token = storage.createToken(admin.id, "admin").token;
  otherToken = storage.createToken(other.id, "client").token;
  templateId = storage.getTemplates().find(t => t.type === "tank")!.id;
  questions = storage.getQuestionsByTemplate(templateId);
  app = express(); app.use(express.json({ limit: "50mb" }));
  const { extractAuth } = await import("../server/middleware");
  app.use(extractAuth);
  (app as any).__loginLimiter = (_req: unknown, _res: unknown, next: () => void) => next();
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(createServer(app), app);
});

describe("Tank checklist persistence and access", () => {
  it("migrates existing inspections without modifying their content", () => {
    expect(storage.getInspection(1)?.facilityName).toBe("Legacy facility");
    expect(storage.getInspection(1)?.tankDetails).toBeNull();
    expect(storage.getTemplate(1)?.name).toBe("Existing custom checklist");
  });
  it("seeds once and preserves administrator edits on restart", () => {
    const first = questions[0];
    storage.updateQuestion(first.id, { questionText: "Locally customized tank question" });
    ensureTankTemplate(); ensureTankTemplate();
    expect(storage.getTemplates().filter(t => t.type === "tank")).toHaveLength(1);
    expect(storage.getQuestionsByTemplate(templateId)).toHaveLength(tankQuestions.length);
    expect(storage.getQuestionsByTemplate(templateId)[0].questionText).toBe("Locally customized tank question");
    storage.updateQuestion(first.id, { questionText: first.questionText });
  });
  it("saves and reloads tank metadata and corrective actions", async () => {
    details.correctiveActions[String(questions[0].id)] = { action: "Reconcile tank nameplate", owner: "Test owner", dueDate: "2026-10-20", completedDate: "" };
    const created = await request(app).post("/api/inspections").set("Authorization", `Bearer ${token}`).send({
      userId: 1, templateId, facilityName: "Example facility", inspectorName: "Test inspector", inspectionDate: "2026-10-06", tankDetails: details,
    });
    expect(created.status).toBe(201); inspectionId = created.body.id;
    expect(created.body.tankDetails).toEqual(details);
    const loaded = await request(app).get(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`);
    expect(loaded.body.tankDetails.correctiveActions[String(questions[0].id)].owner).toBe("Test owner");
    const list = await request(app).get("/api/inspections?includeAnswers=true").set("Authorization", `Bearer ${token}`);
    expect(list.body.find((i: any) => i.id === inspectionId).tankDetails).toEqual(details);
  });
  it("rejects invalid dates and oversized fields without overwriting saved data", async () => {
    for (const invalid of [{ ...details, nextInspectionDate: "2026-02-30" }, { ...details, tankId: "X".repeat(101) }]) {
      const result = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ tankDetails: invalid });
      expect(result.status).toBe(400);
    }
    expect(storage.getInspection(inspectionId)?.tankDetails?.tankId).toBe("T-101");
  });
  it("requires authentication and preserves ownership restrictions", async () => {
    expect((await request(app).get(`/api/inspections/${inspectionId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${otherToken}`).send({ tankDetails: details })).status).toBe(403);
  });
  it("keeps incomplete checklists from being marked complete", async () => {
    const result = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ status: "completed" });
    expect(result.status).toBe(400);
    expect(storage.getInspection(inspectionId)?.status).toBe("in_progress");
  });
  it("persists N/A and observations, then allows a fully recorded checklist to complete", async () => {
    const answers = questions.map((q, i) => ({ questionId: q.id, answer: i === 0 ? "no" : i === 1 ? "n/a" : "yes", comments: i === 0 ? "Tank label does not match report." : i === 1 ? "Not applicable to this example configuration." : "", photos: [] }));
    const saved = await request(app).post(`/api/inspections/${inspectionId}/answers`).set("Authorization", `Bearer ${token}`).send({ answers });
    expect(saved.status).toBe(200);
    expect(storage.getAnswersByInspection(inspectionId)[1].answer).toBe("n/a");
    const completed = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ status: "completed" });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });
  it("exports both tank and existing custom reports through the authenticated PDF endpoint", async () => {
    for (const type of ["tank", "custom"]) {
      const response = await request(app).post("/api/generate-pdf").set("Authorization", `Bearer ${token}`).send({
        facility: "Example facility", inspector: "Test inspector", date: "2026-10-06", templateName: "Example checklist", templateType: type,
        tankDetails: type === "tank" ? details : undefined, questions: questions.slice(0, 3),
        answers: [{ questionId: questions[0].id, answer: "n/a", comments: "Not applicable", photos: [] }],
      });
      expect(response.status).toBe(200);
      expect(Buffer.from(response.body.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");
      expect(response.body.emailSent).toBe(false);
    }
  });
  it("does not allow clearing tank details while marking a checklist complete", async () => {
    const result = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ tankDetails: null, status: "completed" });
    expect(result.status).toBe(400);
    expect(storage.getInspection(inspectionId)?.tankDetails?.tankId).toBe("T-101");
  });
  it("returns a completed checklist to draft when answers change", async () => {
    const result = await request(app).post(`/api/inspections/${inspectionId}/answers`).set("Authorization", `Bearer ${token}`).send({ answers: [{ questionId: questions[0].id, answer: "", comments: "", photos: [] }] });
    expect(result.status).toBe(200);
    expect(storage.getInspection(inspectionId)?.status).toBe("in_progress");
    expect(storage.getInspection(inspectionId)?.completedAt).toBeNull();
  });
});

describe("Tank completion rules", () => {
  const qs = [{ id: 1 }, { id: 2 }];
  it("does not count a missing response or empty checklist as completed", () => {
    expect(tankChecklistComplete(qs, [{ questionId: 1, answer: "yes" }], details)).toBe(false);
    expect(tankChecklistComplete([], [], details)).toBe(false);
  });
  it("requires comments for NO / N/A and a report reference", () => {
    const answers = [{ questionId: 1, answer: "yes" }, { questionId: 2, answer: "n/a", comments: "" }];
    expect(tankChecklistComplete(qs, answers, details)).toBe(false);
    answers[1].comments = "No interstitial space";
    expect(tankChecklistComplete(qs, answers, details)).toBe(true);
    expect(tankChecklistComplete(qs, answers, { ...details, reportReference: "" })).toBe(false);
  });
  it("rejects malformed corrective-action dates", () => {
    expect(tankDetailsSchema.safeParse({ correctiveActions: { "1": { dueDate: "soon" } } }).success).toBe(false);
  });
});
