import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { tankChecklistComplete } from "../shared/tank";
import { tankQuestions } from "../shared/tank-checklist";

let storage: typeof import("../server/storage").storage;
let ensureTankTemplate: typeof import("../server/storage").ensureTankTemplate;
let app: express.Express;
let token: string, otherToken: string, templateId: number, inspectionId: number;
let questions: { id: number; section: string; questionText: string; recommendResponse?: string | null }[];

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
  it("preserves existing inspections and templates", () => {
    expect(storage.getInspection(1)?.facilityName).toBe("Legacy facility");
    expect(storage.getTemplate(1)?.name).toBe("Existing custom checklist");
  });
  it("seeds the supplied 32 questions once and preserves administrator edits", () => {
    expect(questions).toHaveLength(32);
    expect([...new Set(questions.map(q => q.section))]).toEqual([
      "Administrative Requirements", "Tank Foundation/Supports", "Tank Shells, Heads and Roof",
      "Tank Manway, Piping & Equipment", "Tank Equipment", "Tank/Piping Release Detection", "Other Equipment",
    ]);
    const first = questions[0];
    storage.updateQuestion(first.id, { questionText: "Locally customized tank question" });
    ensureTankTemplate(); ensureTankTemplate();
    expect(storage.getTemplates().filter(t => t.type === "tank")).toHaveLength(1);
    expect(storage.getQuestionsByTemplate(templateId)).toHaveLength(tankQuestions.length);
    expect(storage.getQuestionsByTemplate(templateId)[0].questionText).toBe("Locally customized tank question");
    storage.updateQuestion(first.id, { questionText: first.questionText });
  });
  it("creates a checklist using only the existing inspection fields", async () => {
    const created = await request(app).post("/api/inspections").set("Authorization", `Bearer ${token}`).send({
      userId: 1, templateId, facilityName: "Example facility", inspectorName: "Test inspector",
      inspectionDate: "2026-10-06", inspectionName: "Tank 1", status: "completed",
    });
    expect(created.status).toBe(201); inspectionId = created.body.id;
    expect(created.body.status).toBe("in_progress");
    const loaded = await request(app).get(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`);
    expect(loaded.body.inspectionName).toBe("Tank 1");
  });
  it("requires authentication and preserves ownership restrictions", async () => {
    expect((await request(app).get(`/api/inspections/${inspectionId}`)).status).toBe(401);
    expect((await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${otherToken}`).send({ generalComments: "Change" })).status).toBe(403);
  });
  it("keeps an unanswered checklist from being marked complete", async () => {
    const result = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ status: "completed" });
    expect(result.status).toBe(400);
    expect(storage.getInspection(inspectionId)?.status).toBe("in_progress");
  });
  it("persists YES/NO responses and optional notes without requiring extra fields", async () => {
    const answers = questions.map((q, i) => ({
      questionId: q.id, answer: i === 0 ? "no" : "yes", comments: i === 1 ? "Optional note." : "", photos: [],
    }));
    const saved = await request(app).post(`/api/inspections/${inspectionId}/answers`).set("Authorization", `Bearer ${token}`).send({ answers });
    expect(saved.status).toBe(200);
    const list = await request(app).get("/api/inspections?includeAnswers=true").set("Authorization", `Bearer ${token}`);
    const record = list.body.find((i: any) => i.id === inspectionId);
    expect(record.answers).toHaveLength(32);
    expect(record.answers.find((a: any) => a.questionId === questions[0].id).answer).toBe("no");
    expect(record.answers.find((a: any) => a.questionId === questions[1].id).comments).toBe("Optional note.");
    const completed = await request(app).patch(`/api/inspections/${inspectionId}`).set("Authorization", `Bearer ${token}`).send({ status: "completed" });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });
  it("exports tank and existing custom reports through the authenticated endpoint", async () => {
    for (const type of ["tank", "custom"]) {
      const response = await request(app).post("/api/generate-pdf").set("Authorization", `Bearer ${token}`).send({
        facility: "Example facility", inspector: "Test inspector", date: "2026-10-06",
        templateName: "Example checklist", templateType: type, questions,
        answers: [{ questionId: questions[0].id, answer: "no", comments: "Optional note", photos: [] }],
      });
      expect(response.status).toBe(200);
      expect(Buffer.from(response.body.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");
      expect(response.body.emailSent).toBe(false);
    }
  });
  it("returns a completed checklist to draft when answers change", async () => {
    const result = await request(app).post(`/api/inspections/${inspectionId}/answers`).set("Authorization", `Bearer ${token}`).send({
      answers: [{ questionId: questions[0].id, answer: "", comments: "", photos: [] }],
    });
    expect(result.status).toBe(200);
    expect(storage.getInspection(inspectionId)?.status).toBe("in_progress");
    expect(storage.getInspection(inspectionId)?.completedAt).toBeNull();
  });
});

describe("Tank completion rules", () => {
  const qs = [{ id: 1 }, { id: 2 }];
  it("does not count missing responses, N/A, or an empty checklist as complete", () => {
    expect(tankChecklistComplete(qs, [{ questionId: 1, answer: "yes" }])).toBe(false);
    expect(tankChecklistComplete(qs, [{ questionId: 1, answer: "yes" }, { questionId: 2, answer: "n/a" }])).toBe(false);
    expect(tankChecklistComplete([], [])).toBe(false);
  });
  it("accepts YES and NO without requiring comments or tank metadata", () => {
    expect(tankChecklistComplete(qs, [{ questionId: 1, answer: "yes" }, { questionId: 2, answer: "no" }])).toBe(true);
  });
});
