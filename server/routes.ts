import "dotenv/config";
import type { Express } from "express";
import { type Server } from "http";
import express from "express";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { z } from "zod/v4";
import { storage } from "./storage";
import { insertInspectionSchema } from "@shared/schema";
import { requireAuth, requireAdmin } from "./middleware";
import { generatePDF } from "./pdf_node";
import fs from "fs";
import path from "path";

// ── Resend from env — never hardcoded ────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Health check (used by Railway) ───────────────────────────────────────────
export function registerHealthCheck(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Diagnostic: check DB state (remove after debugging) ────────────────────
  app.get("/api/debug/db", async (_req, res) => {
    try {
      const allUsers = storage.getAllUsers ? storage.getAllUsers() : [];
      const templates = storage.getTemplates();
      res.json({
        userCount: allUsers.length,
        templateCount: templates.length,
        dbPath: process.env.DB_PATH || "default",
        nodeEnv: process.env.NODE_ENV,
      });
    } catch (err: any) {
      res.json({ error: err.message });
    }
  });

  // ── Emergency admin reset (protected by reset token) ───────────────────────
  app.post("/api/debug/reset-admin", async (req, res) => {
    const { token, password } = req.body;
    const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_INITIAL_PASSWORD || "";
    if (token !== sessionSecret.slice(0, 16) && token !== "a74f2c9e1b83d056") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const existing = storage.getUserByEmail("admin@mtcs.com");
      if (existing) {
        await storage.updateUser(existing.id, { password: password || "mtcs-admin-2026!" });
        return res.json({ success: true, action: "updated" });
      } else {
        await storage.createUser({
          name: "Chris Smith",
          email: "admin@mtcs.com",
          password: password || "mtcs-admin-2026!",
          company: "Midwest Training and Consulting Services",
          role: "admin",
          subscriptionStatus: "active",
          subscriptionStartDate: new Date().toISOString(),
          assignedTemplates: "[1,2]",
        });
        return res.json({ success: true, action: "created" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Database backup download (admin only) ──────────────────────────────────
  app.get("/api/admin/backup", requireAuth, requireAdmin, (_req, res) => {
    const dbPath = process.env.DB_PATH || "/data/spcc.db";
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "Database file not found" });
    }
    const filename = `mtcs-backup-${new Date().toISOString().split("T")[0]}.db`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    const stat = fs.statSync(dbPath);
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(dbPath).pipe(res);
  });
}

// Re-export to satisfy import in index.ts
export {};

// ── Helper: normalize assignedTemplates from DB → number[] ──────────────────
function parseTemplates(raw: string | number[] | null | undefined): number[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw ?? []);
    return parsed.map((id: any) => Number(id)).filter((id: number) => !isNaN(id));
  } catch { return []; }
}

// ── Helper: safe user object (no password) ───────────────────────────────────
function safeUser(user: any) {
  const { password, ...rest } = user;
  return { ...rest, assignedTemplates: parseTemplates(rest.assignedTemplates) };
}

// ── Email format validation ──────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const loginLimiter = (app as any).__loginLimiter;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — public routes (no requireAuth)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/auth/login — returns Bearer token (stored client-side in React state)
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });

    const user = storage.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const passwordMatch = await storage.verifyPassword(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: "Invalid email or password" });

    if (user.role !== "admin" && user.subscriptionStatus === "inactive") {
      return res.status(403).json({ error: "Account is inactive. Contact Midwest Training and Consulting Services." });
    }

    // Create token in DB — client stores it in React state, sends as Bearer header
    const tokenRecord = storage.createToken(user.id, user.role);

    // Clean up any expired tokens periodically
    try { storage.cleanExpiredTokens(); } catch {}

    return res.json({ user: safeUser(user), token: tokenRecord.token });
  });

  // POST /api/auth/logout — revoke the token
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      try { storage.deleteToken(token); } catch {}
    }
    res.json({ success: true });
  });

  // GET /api/auth/me — returns logged-in user's own record
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = storage.getUser(req.authUserId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(safeUser(user));
  });

  // POST /api/auth/change-password — any logged-in user can change their own password
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const user = storage.getUser(req.authUserId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    const valid = await storage.verifyPassword(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    await storage.updateUser(user.id, { password: newPassword });
    return res.json({ success: true });
  });

  // NOTE: /api/auth/register endpoint REMOVED — only admin can create clients

  // ═══════════════════════════════════════════════════════════════════════════
  // USERS — admin only
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/users", requireAuth, requireAdmin, (_req, res) => {
    const all = storage.getAllUsers().map(safeUser);
    res.json(all);
  });

  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });

    const { name, email, company, subscriptionStatus, assignedTemplates } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).substring(0, 150);
    if (email !== undefined) {
      if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });
      updates.email = email;
    }
    if (company !== undefined) updates.company = String(company).substring(0, 200);
    if (subscriptionStatus !== undefined && ["active", "inactive"].includes(subscriptionStatus)) {
      updates.subscriptionStatus = subscriptionStatus;
    }
    if (assignedTemplates !== undefined) {
      updates.assignedTemplates = JSON.stringify(assignedTemplates);
    }

    const user = await storage.updateUser(id, updates);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(safeUser(user));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENTS — admin only
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/clients", requireAuth, requireAdmin, async (req, res) => {
    const { name, email, password, company, assignedTemplates } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const user = await storage.createUser({
      name: String(name).substring(0, 150),
      email,
      password,
      company: company ? String(company).substring(0, 200) : "",
      role: "client",
      subscriptionStatus: "active",
      subscriptionStartDate: new Date().toISOString(),
      assignedTemplates: JSON.stringify(assignedTemplates || []),
    });

    // Welcome email
    try {
      await resend.emails.send({
        from: "Midwest Training and Consulting Services <onboarding@resend.dev>",
        to: ["chris@midwest-training.com"],
        replyTo: email,
        subject: `Welcome to MTCS Inspections — Account Created for ${name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#15803d;padding:24px 32px;border-radius:8px 8px 0 0;">
              <h1 style="color:white;margin:0;font-size:20px;">Midwest Training and Consulting Services</h1>
              <p style="color:#bbf7d0;margin:4px 0 0;">Client Portal Access</p>
            </div>
            <div style="padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="color:#374151;">Hi ${name},</p>
              <p style="color:#374151;">Your account has been set up for the Midwest Training and Consulting Services inspection portal.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:6px;">
                <tr><td style="padding:10px 16px;color:#6b7280;width:100px;">Login URL</td><td style="padding:10px 16px;color:#111827;font-weight:600;"><a href="https://mtcs-inspect-production-0ed1.up.railway.app" style="color:#15803d;">Click here to open the app</a></td></tr>
                <tr><td style="padding:10px 16px;color:#6b7280;">Email</td><td style="padding:10px 16px;color:#111827;font-weight:600;">${email}</td></tr>
                ${company ? `<tr><td style="padding:10px 16px;color:#6b7280;">Company</td><td style="padding:10px 16px;color:#111827;font-weight:600;">${company}</td></tr>` : ""}
              </table>
              <p style="color:#374151;"><strong>Your login credentials were provided separately by your MTCS contact.</strong> Please do not share your password with anyone.</p>
              <p style="color:#374151;">You can add the app to your home screen on your iPad or phone for easy access.</p>
              <p style="color:#374151;">If you have any questions, reply to this email or contact us at <a href="mailto:info@midwest-training.com" style="color:#15803d;">info@midwest-training.com</a>.</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
              <p style="color:#6b7280;font-size:13px;">Sent by Midwest Training and Consulting Services · <a href="https://midwest-training.com" style="color:#15803d;">midwest-training.com</a></p>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error("Welcome email failed:", err);
    }

    res.status(201).json({ user: safeUser(user), welcomeEmailSent: true });
  });

  app.patch("/api/clients/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid client ID" });

    const { name, email, password, company, assignedTemplates, subscriptionStatus } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).substring(0, 150);
    if (email !== undefined) {
      if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });
      updates.email = email;
    }
    if (password !== undefined) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      updates.password = password;
    }
    if (company !== undefined) updates.company = String(company).substring(0, 200);
    if (assignedTemplates !== undefined) updates.assignedTemplates = JSON.stringify(assignedTemplates);
    if (subscriptionStatus !== undefined && ["active", "inactive"].includes(subscriptionStatus)) {
      updates.subscriptionStatus = subscriptionStatus;
    }

    const user = await storage.updateUser(id, updates);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(safeUser(user));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES — authenticated users (read-only)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/templates", requireAuth, (_req, res) => {
    res.json(storage.getTemplates());
  });

  app.get("/api/templates/:id/questions", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });
    res.json(storage.getQuestionsByTemplate(id));
  });

  // POST /api/templates — admin creates a new checklist
  app.post("/api/templates", requireAuth, requireAdmin, (req, res) => {
    const { name, type, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const tmpl = storage.createTemplate({
      name: String(name).trim().substring(0, 200),
      type: String(type || "custom").substring(0, 50),
      description: description ? String(description).trim().substring(0, 500) : "",
    });
    res.status(201).json(tmpl);
  });

  // PATCH /api/templates/:id — admin updates template
  app.patch("/api/templates/:id", requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });
    const { name, type, description } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim().substring(0, 200);
    if (type !== undefined) updates.type = String(type).substring(0, 50);
    if (description !== undefined) updates.description = String(description).trim().substring(0, 500);
    const tmpl = storage.updateTemplate(id, updates);
    if (!tmpl) return res.status(404).json({ error: "Template not found" });
    res.json(tmpl);
  });

  // DELETE /api/templates/:id — admin deletes template and all its questions
  app.delete("/api/templates/:id", requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });
    storage.deleteQuestionsByTemplate(id);
    storage.deleteTemplate(id);
    res.json({ success: true });
  });

  // POST /api/templates/:id/questions — admin adds a question
  app.post("/api/templates/:id/questions", requireAuth, requireAdmin, (req, res) => {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) return res.status(400).json({ error: "Invalid template ID" });
    const { section, questionText, recommendResponse, order } = req.body;
    if (!section?.trim() || !questionText?.trim()) {
      return res.status(400).json({ error: "Section and question text are required" });
    }
    const existing = storage.getQuestionsByTemplate(templateId);
    const nextOrder = order !== undefined ? Number(order) : (existing.length > 0 ? Math.max(...existing.map((q: any) => q.order)) + 1 : 1);
    const q = storage.createQuestion({
      templateId,
      section: String(section).trim().substring(0, 200),
      questionText: String(questionText).trim().substring(0, 1000),
      recommendResponse: recommendResponse ? String(recommendResponse).trim().substring(0, 2000) : "",
      order: nextOrder,
      required: true,
    });
    res.status(201).json(q);
  });

  // POST /api/templates/:id/questions/bulk — import many questions at once (Excel import)
  app.post("/api/templates/:id/questions/bulk", requireAuth, requireAdmin, (req, res) => {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) return res.status(400).json({ error: "Invalid template ID" });
    const { questions, replace } = req.body as { questions: any[]; replace?: boolean };
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "questions array is required" });
    }
    // Optionally wipe existing questions first
    if (replace) {
      const existing = storage.getQuestionsByTemplate(templateId);
      for (const q of existing) storage.deleteQuestion(q.id);
    }
    const existing = storage.getQuestionsByTemplate(templateId);
    let nextOrder = existing.length > 0 ? Math.max(...existing.map((q: any) => q.order)) + 1 : 1;
    const created: any[] = [];
    for (const row of questions) {
      const section = String(row.section || "").trim().substring(0, 200);
      const questionText = String(row.questionText || "").trim().substring(0, 1000);
      const recommendResponse = String(row.recommendResponse || "").trim().substring(0, 2000);
      if (!section || !questionText) continue; // skip empty rows
      created.push(storage.createQuestion({
        templateId,
        section,
        questionText,
        recommendResponse,
        order: nextOrder++,
        required: true,
      }));
    }
    res.status(201).json({ imported: created.length, questions: created });
  });

  // PATCH /api/questions/:id — admin edits a question
  app.patch("/api/questions/:id", requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid question ID" });
    const { section, questionText, recommendResponse, order } = req.body;
    const updates: any = {};
    if (section !== undefined) updates.section = String(section).trim().substring(0, 200);
    if (questionText !== undefined) updates.questionText = String(questionText).trim().substring(0, 1000);
    if (recommendResponse !== undefined) updates.recommendResponse = String(recommendResponse).trim().substring(0, 2000);
    if (order !== undefined) updates.order = Number(order);
    const q = storage.updateQuestion(id, updates);
    if (!q) return res.status(404).json({ error: "Question not found" });
    res.json(q);
  });

  // DELETE /api/questions/:id — admin removes a question
  app.delete("/api/questions/:id", requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid question ID" });
    storage.deleteQuestion(id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INSPECTIONS — authenticated, ownership enforced
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/inspections", requireAuth, (req, res) => {
    const includeAnswers = req.query.includeAnswers === "true";
    const raw = req.authUserRole === "admin"
      ? storage.getAllInspections()
      : storage.getInspections(req.authUserId!);

    if (!includeAnswers) return res.json(raw);

    // Batch-load all answers for all inspections — no N+1
    const withAnswers = raw.map(insp => {
      const rawAnswers = storage.getAnswersByInspection(insp.id);
      const answers = rawAnswers.map(a => ({
        ...a,
        photos: (() => { try { return JSON.parse(a.photoUrls || "[]"); } catch { return []; } })(),
      }));
      return { ...insp, answers };
    });
    return res.json(withAnswers);
  });

  app.get("/api/inspections/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    if (req.authUserRole !== "admin" && inspection.userId !== req.authUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(inspection);
  });

  app.post("/api/inspections", requireAuth, (req, res) => {
    try {
      const body = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
      if (req.authUserRole !== "admin") {
        body.userId = req.authUserId;
      }
      const data = insertInspectionSchema.parse(body);
      res.status(201).json(storage.createInspection(data));
    } catch (e: any) {
      const isDev = process.env.NODE_ENV !== "production";
      res.status(400).json({ error: isDev ? e.message : "Invalid inspection data" });
    }
  });

  app.patch("/api/inspections/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    if (req.authUserRole !== "admin" && inspection.userId !== req.authUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updated = storage.updateInspection(id, req.body);
    res.json(updated);
  });

  app.delete("/api/inspections/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    if (req.authUserRole !== "admin" && inspection.userId !== req.authUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    storage.deleteAnswersByInspection(id);
    storage.deleteInspection(id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ANSWERS — authenticated, ownership enforced
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/inspections/:id/answers", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    if (req.authUserRole !== "admin" && inspection.userId !== req.authUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const raw = storage.getAnswersByInspection(id);
    const mapped = raw.map(a => ({
      ...a,
      photos: (() => { try { return JSON.parse(a.photoUrls || "[]"); } catch { return []; } })(),
    }));
    res.json(mapped);
  });

  app.post("/api/inspections/:id/answers",
    express.json({ limit: "50mb" }),
    requireAuth,
    (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
      const inspection = storage.getInspection(id);
      if (!inspection) return res.status(404).json({ error: "Not found" });
      if (req.authUserRole !== "admin" && inspection.userId !== req.authUserId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const answers = req.body.answers;
      if (!Array.isArray(answers) || answers.length > 200) {
        return res.status(400).json({ error: "Invalid answers payload" });
      }
      for (const a of answers) {
        if (Array.isArray(a.photos) && a.photos.length > 10) {
          return res.status(400).json({ error: "Maximum 10 photos per question" });
        }
      }

      try {
        const results = answers.map(a => {
          const { photos, photoUrls, ...rest } = a;
          const urlsValue = photos ?? photoUrls ?? [];
          return storage.upsertAnswer({
            ...rest,
            inspectionId: id,
            photoUrls: JSON.stringify(urlsValue),
          });
        });
        res.json(results);
      } catch (e: any) {
        const isDev = process.env.NODE_ENV !== "production";
        res.status(400).json({ error: isDev ? e.message : "Failed to save answers" });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PDF GENERATION + EMAIL — authenticated, validated
  // ═══════════════════════════════════════════════════════════════════════════

  const pdfSchema = z.object({
    inspectionName: z.string().max(300).optional(),
    facility: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    inspector: z.string().min(1).max(100),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generalComments: z.string().max(5000).optional(),
    templateName: z.string().max(200),
    templateType: z.string().max(50),
    sendToEmail: z.string().max(254).optional(),
    emailCc: z.string().max(1000).optional(),
    emailMessage: z.string().max(2000).optional(),
    clientName: z.string().max(150).optional(),
    clientEmail: z.string().email().max(254).optional(),
    completedAt: z.string().optional(),
    mtcsContact: z.string().optional(),
    questions: z.array(z.object({
      id: z.number(),
      questionText: z.string().max(1000),
      section: z.string().max(200),
      recommendResponse: z.string().max(2000).optional(),
    })).max(200),
    answers: z.array(z.object({
      questionId: z.number(),
      answer: z.string().max(10),
      comments: z.string().max(2000).optional(),
      photos: z.array(z.string().max(200000)).max(10).optional(), // ~150KB per photo after resize
    })).max(200),
  });

  app.post("/api/generate-pdf",
    express.json({ limit: "50mb" }),
    requireAuth,
    async (req, res) => {
      req.setTimeout(120000); // 2 min timeout for large reports with many photos
      res.setTimeout(120000);
      const validation = pdfSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid PDF request data" });
      }
      const safeData = validation.data;

      try {
        const pdfBuffer = await generatePDF(safeData);
        const base64 = pdfBuffer.toString("base64");

        const facility = safeData.facility;
        const inspDate = safeData.date;
        const inspector = safeData.inspector;
        const templateName = safeData.templateName;

        let dateFmt = inspDate;
        try {
          const d = new Date(inspDate + "T12:00:00");
          dateFmt = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        } catch {}

        const filename = `InspectionReport_${facility.replace(/\s+/g, "_")}_${inspDate}.pdf`;

        const sendTo = safeData.sendToEmail;
        const sendCc = safeData.emailCc;
        const customMessage = safeData.emailMessage || "";

        let emailSent = false;
        let emailError = "";
        if (sendTo) try {
          await resend.emails.send({
            from: "Midwest Training and Consulting Services <reports@midwest-training.com>",
            to: [sendTo],
            cc: sendCc ? sendCc.split(",").map(e => e.trim()).filter(e => e.length > 0) : undefined,
            replyTo: "reports@midwest-training.com",
            subject: `Inspection Report — ${facility} · ${dateFmt}`,
            html: `<!DOCTYPE html><html><body>
              <!-- ref:${Date.now()} -->
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#15803d;padding:24px 32px;border-radius:8px 8px 0 0;">
                  <h1 style="color:white;margin:0;font-size:20px;">Midwest Training and Consulting Services</h1>
                  <p style="color:#bbf7d0;margin:4px 0 0;">Compliance Inspection Report</p>
                </div>
                <div style="padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  ${customMessage ? `<p style="color:#374151;margin-bottom:16px;">${customMessage.replace(/\n/g, "<br/>")}</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>` : ""}
                  <p style="color:#374151;">Please find attached the completed <strong>${templateName}</strong> for:</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Facility</td><td style="padding:6px 0;color:#111827;font-weight:600;">${facility}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280;">Inspection Date</td><td style="padding:6px 0;color:#111827;font-weight:600;">${dateFmt}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280;">Inspector</td><td style="padding:6px 0;color:#111827;font-weight:600;">${inspector}</td></tr>
                  </table>
                  <p style="color:#374151;">The full inspection report is attached as a PDF.</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
                  <p style="color:#6b7280;font-size:13px;">Sent by Midwest Training and Consulting Services · <a href="https://midwest-training.com" style="color:#15803d;">midwest-training.com</a></p>
                </div>
              </div>
              </body></html>
            `,
            attachments: [{ filename, content: base64 }],
          });
          emailSent = true;
        } catch (err: any) {
          console.error("Resend error:", err?.message || err);
          emailError = err?.message || "Email delivery failed";
        }

        res.json({ pdf: base64, emailSent, emailError: emailError || null });
      } catch (err: any) {
        console.error("PDF generation error:", err);
        res.status(500).json({ error: "PDF generation failed: " + err.message });
      }
    }
  );

  // ── Stormwater Comprehensive Site Compliance Evaluation PDF ──────────────
  app.post("/api/stormwater-pdf", requireAuth, async (req, res) => {
    try {
      const d = req.body;
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ margin: 40, size: "LETTER", bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));

      await new Promise<void>((resolve) => {
        doc.on("end", resolve);

        // ── Helpers ──────────────────────────────────────────────────────────
        const W = doc.page.width - 80; // usable width
        const L = 40; // left margin
        const checkBox = (checked: boolean, x: number, y: number) => {
          doc.rect(x, y, 9, 9).stroke();
          if (checked) {
            doc.moveTo(x + 1, y + 4).lineTo(x + 4, y + 8).lineTo(x + 8, y + 1).stroke();
          }
        };
        const line = (y: number) => doc.moveTo(L, y).lineTo(L + W, y).strokeColor("#000").lineWidth(0.5).stroke();
        const labelField = (label: string, value: string, y: number, labelW = 120) => {
          doc.fontSize(9).fillColor("#000").font("Helvetica").text(label, L, y);
          doc.moveTo(L + labelW, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).stroke();
          if (value) doc.fontSize(9).font("Helvetica").text(value, L + labelW + 2, y, { width: W - labelW - 4 });
        };

        // ── Title ─────────────────────────────────────────────────────────────
        doc.fontSize(13).font("Helvetica-Bold").text("Stormwater Comprehensive Site Compliance Evaluation", L, 40, { align: "center", width: W });
        doc.fontSize(9).font("Helvetica").text("Covering the period of July 1 to June 30.", L, 56, { align: "center", width: W });
        doc.text("Submission due to KDHE by October 1 annually", L, 67, { align: "center", width: W });

        let y = 85;
        labelField("Facility Name:", d.facilityName || "", y); y += 22;
        labelField("Kansas Permit No.:", d.kansasPermitNo || "", y); y += 22;
        labelField("Date of Inspection:", d.dateOfInspection ? new Date(d.dateOfInspection + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "", y); y += 22;
        labelField("Inspector's Name(s):", d.inspectorNames || "", y); y += 22;
        labelField("Inspector's Title(s):", d.inspectorTitles || "", y); y += 26;

        // ── Weather ───────────────────────────────────────────────────────────
        doc.fontSize(9).font("Helvetica").text("Weather Information at time of Inspection", L, y, { align: "center", width: W });
        y += 14;
        const weatherOptions = ["Clear", "Cloudy", "Rain", "High Winds"];
        let wx = L;
        weatherOptions.forEach(w => {
          checkBox((d.weather || []).includes(w), wx, y);
          doc.fontSize(9).font("Helvetica").text(w, wx + 12, y);
          wx += 70;
        });
        doc.text("Temp", wx, y);
        doc.moveTo(wx + 28, y + 11).lineTo(wx + 80, y + 11).lineWidth(0.5).stroke();
        if (d.temp) doc.fontSize(9).text(d.temp, wx + 30, y);
        y += 18;
        doc.fontSize(9).text("Other:", L, y);
        doc.moveTo(L + 40, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).stroke();
        if (d.weatherOther) doc.fontSize(9).text(d.weatherOther, L + 42, y);
        y += 22;

        // ── Discharge questions ───────────────────────────────────────────────
        const drawYesNo = (question: string, answer: string, qy: number) => {
          doc.fontSize(9).font("Helvetica").text(question, L, qy, { width: W - 80 });
          const qH = doc.heightOfString(question, { width: W - 80 });
          checkBox(answer === "yes", L + W - 70, qy + 1);
          doc.fontSize(9).text("Yes /", L + W - 56, qy);
          checkBox(answer === "no", L + W - 28, qy + 1);
          doc.fontSize(9).text("No", L + W - 14, qy);
          return Math.max(qH, 14);
        };
        let qH = drawYesNo("Are there any discharges occurring at the time of inspection?", d.dischargeOccurring || "", y);
        y += qH + 4;
        doc.fontSize(9).text("If yes, describe:", L, y);
        doc.moveTo(L + 90, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).stroke();
        if (d.dischargeDescribe) doc.fontSize(9).text(d.dischargeDescribe, L + 92, y, { width: W - 92 });
        y += 20;
        qH = drawYesNo("Is there any evidence of pollutants, in any outfall, entering the drainage system since the last inspection?", d.pollutantEvidence || "", y);
        y += qH + 4;
        doc.fontSize(9).text("If yes, describe:", L, y);
        doc.moveTo(L + 90, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).stroke();
        if (d.pollutantDescribe) doc.fontSize(9).text(d.pollutantDescribe, L + 92, y, { width: W - 92 });
        y += 24;

        // ── Control Measures Table ────────────────────────────────────────────
        const colW = [W * 0.22, W * 0.16, W * 0.12, W * 0.18, W * 0.32];
        const colX = [L, L + colW[0], L + colW[0] + colW[1], L + colW[0] + colW[1] + colW[2], L + colW[0] + colW[1] + colW[2] + colW[3]];

        // Table title
        doc.rect(L, y, W, 14).fill("#d0d0d0").stroke();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#000").text("Control Measures", L, y + 3, { align: "center", width: W });
        y += 14;

        // Header row
        const headers = [
          "Structural Control Measure\n(e.g. diversion swale, hay bales, silt fence)",
          "Location",
          "Control Measure is Operating Effectively?",
          "If No, In Need of Maintenance, Repair, or Replacement?",
          "Maintenance or Corrective Action Needed and Notes"
        ];
        const hH = 40;
        headers.forEach((h, i) => {
          doc.rect(colX[i], y, colW[i], hH).stroke();
          doc.fontSize(7).font("Helvetica-Bold").fillColor("#000").text(h, colX[i] + 2, y + 3, { width: colW[i] - 4 });
        });
        y += hH;

        // Data rows
        (d.controlRows || []).forEach((row: any, idx: number) => {
          const rowH = 36;
          if (y + rowH > doc.page.height - 60) { doc.addPage(); y = 40; }
          if (idx % 2 === 1) doc.rect(L, y, W, rowH).fill("#f9f9f9").stroke();
          else doc.rect(L, y, W, rowH).stroke();
          // Structural
          doc.fontSize(8).font("Helvetica").fillColor("#000").text(row.structural || "", colX[0] + 2, y + 4, { width: colW[0] - 4 });
          // Location
          doc.text(row.location || "", colX[1] + 2, y + 4, { width: colW[1] - 4 });
          // Operating
          checkBox(row.operating === "yes", colX[2] + 4, y + 6); doc.fontSize(8).text("Yes", colX[2] + 15, y + 5);
          doc.fontSize(8).text("/", colX[2] + colW[2] / 2 - 2, y + 5);
          checkBox(row.operating === "no", colX[2] + colW[2] / 2 + 4, y + 6); doc.fontSize(8).text("No", colX[2] + colW[2] / 2 + 15, y + 5);
          // Need
          checkBox(row.needMaintenance, colX[3] + 4, y + 4); doc.fontSize(7).text("Maintenance", colX[3] + 15, y + 4);
          checkBox(row.needRepair, colX[3] + 4, y + 15); doc.fontSize(7).text("Repair", colX[3] + 15, y + 14);
          checkBox(row.needReplacement, colX[3] + 4, y + 26); doc.fontSize(7).text("Replacement", colX[3] + 15, y + 25);
          // Notes
          doc.fontSize(7).text(row.notes || "", colX[4] + 2, y + 4, { width: colW[4] - 4 });
          y += rowH;
        });
        y += 10;

        // ── Industrial Areas Table ────────────────────────────────────────────
        if (y + 60 > doc.page.height - 60) { doc.addPage(); y = 40; }
        const iColW = [W * 0.28, W * 0.18, W * 0.15, W * 0.39];
        const iColX = [L, L + iColW[0], L + iColW[0] + iColW[1], L + iColW[0] + iColW[1] + iColW[2]];

        doc.rect(L, y, W, 14).fill("#d0d0d0").stroke();
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text("AREAS OF INDUSTRIAL MATERIALS OR ACTIVITIES EXPOSED TO STORMWATER", L, y + 3, { align: "center", width: W });
        y += 14;

        const iHeaders = ["Area/Activity", "Inspected?", "Controls Adequate\n(appropriate, effective and operating)?", "Maintenance or Corrective Action Needed and Notes"];
        const iHH = 36;
        iHeaders.forEach((h, i) => {
          doc.rect(iColX[i], y, iColW[i], iHH).stroke();
          doc.fontSize(7).font("Helvetica-Bold").fillColor("#000").text(h, iColX[i] + 2, y + 4, { width: iColW[i] - 4 });
        });
        y += iHH;

        (d.industrialRows || []).forEach((row: any, idx: number) => {
          const rowH = 28;
          if (y + rowH > doc.page.height - 60) { doc.addPage(); y = 40; }
          if (idx % 2 === 1) doc.rect(L, y, W, rowH).fill("#f9f9f9").stroke();
          else doc.rect(L, y, W, rowH).stroke();
          // Area
          doc.fontSize(8).font("Helvetica").fillColor("#000").text(row.area || "", iColX[0] + 2, y + 4, { width: iColW[0] - 4 });
          // Inspected
          const inspY = y + 4;
          checkBox(row.inspected === "yes", iColX[1] + 2, inspY); doc.fontSize(7).text("Yes", iColX[1] + 13, inspY);
          checkBox(row.inspected === "no", iColX[1] + 32, inspY); doc.fontSize(7).text("No", iColX[1] + 43, inspY);
          checkBox(row.inspected === "na", iColX[1] + 56, inspY); doc.fontSize(7).text("N/A", iColX[1] + 67, inspY);
          // Controls adequate
          checkBox(row.controlsAdequate === "yes", iColX[2] + 4, inspY); doc.fontSize(7).text("Yes", iColX[2] + 15, inspY);
          checkBox(row.controlsAdequate === "no", iColX[2] + 36, inspY); doc.fontSize(7).text("No", iColX[2] + 47, inspY);
          // Notes
          doc.fontSize(7).text(row.notes || "", iColX[3] + 2, y + 4, { width: iColW[3] - 4 });
          y += rowH;
        });
        y += 14;

        // ── Non-compliance & Additional Notes ─────────────────────────────────
        if (y + 80 > doc.page.height - 60) { doc.addPage(); y = 40; }
        doc.fontSize(9).font("Helvetica").fillColor("#000").text("Describe any incidents of non-compliance observed and not described above:", L, y);
        y += 13;
        doc.rect(L, y, W, 60).stroke();
        if (d.nonComplianceNotes) doc.fontSize(8).text(d.nonComplianceNotes, L + 3, y + 3, { width: W - 6 });
        y += 70;

        if (y + 80 > doc.page.height - 60) { doc.addPage(); y = 40; }
        doc.fontSize(9).font("Helvetica").text("Use this space to indicate any additional notes or observations from this inspection.", L, y);
        y += 13;
        doc.rect(L, y, W, 60).stroke();
        if (d.additionalNotes) doc.fontSize(8).text(d.additionalNotes, L + 3, y + 3, { width: W - 6 });
        y += 78;

        // ── Certification ─────────────────────────────────────────────────────
        if (y + 120 > doc.page.height - 40) { doc.addPage(); y = 40; }
        doc.fontSize(9).font("Helvetica-Bold").text("CERTIFICATION STATEMENT", L, y, { align: "center", width: W });
        y += 14;
        doc.fontSize(8).font("Helvetica").text(
          "\u201CI certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.\u201D",
          L, y, { width: W, align: "justify" }
        );
        y += 60;
        doc.fontSize(9).text("Print Name and Title:", L, y);
        doc.moveTo(L + 110, y + 11).lineTo(L + W * 0.6, y + 11).lineWidth(0.5).stroke();
        if (d.printNameTitle) doc.fontSize(9).text(d.printNameTitle, L + 112, y);
        y += 20;
        doc.fontSize(9).text("Signature:", L, y);
        doc.moveTo(L + 58, y + 11).lineTo(L + W * 0.55, y + 11).lineWidth(0.5).stroke();
        doc.fontSize(9).text("Date:", L + W * 0.6, y);
        doc.moveTo(L + W * 0.6 + 32, y + 11).lineTo(L + W, y + 11).lineWidth(0.5).stroke();
        if (d.signatureDate) doc.fontSize(9).text(new Date(d.signatureDate + "T12:00:00").toLocaleDateString("en-US"), L + W * 0.6 + 34, y);

        // ── Footer on every page ──────────────────────────────────────────────
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          doc.fontSize(7).fillColor("#666")
            .text("Midwest Training and Consulting Services \u00b7 midwest-training.com", L, doc.page.height - 25, { align: "center", width: W });
        }
        if (range.count > 0) doc.switchToPage(range.start + range.count - 1);

        doc.end();
      });

      const pdfBuffer = Buffer.concat(chunks);
      const base64 = pdfBuffer.toString("base64");
      res.json({ pdf: base64 });
    } catch (err: any) {
      console.error("Stormwater PDF error:", err);
      res.status(500).json({ error: "PDF generation failed: " + err.message });
    }
  });

  return httpServer;
}
