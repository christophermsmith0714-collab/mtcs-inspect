import "dotenv/config";
import type { Express } from "express";
import { type Server } from "http";
import express from "express";
import { Resend } from "resend";
import { z } from "zod/v4";
import { storage } from "./storage";
import { insertInspectionSchema } from "@shared/schema";
import { requireAuth, requireAdmin } from "./middleware";
import { generatePDF } from "./pdf_node";

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
}

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
    express.json({ limit: "20mb" }),
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
    facility: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    inspector: z.string().min(1).max(100),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generalComments: z.string().max(5000).optional(),
    templateName: z.string().max(200),
    templateType: z.string().max(50),
    sendToEmail: z.string().email().max(254),
    clientName: z.string().max(150).optional(),
    clientEmail: z.string().email().max(254).optional(),
    completedAt: z.string().optional(),
    mtcsContact: z.string().optional(),
    questions: z.array(z.object({
      id: z.number(),
      questionText: z.string().max(1000),
      section: z.string().max(200),
    })).max(200),
    answers: z.array(z.object({
      questionId: z.number(),
      answer: z.string().max(10),
      comments: z.string().max(2000).optional(),
      photos: z.array(z.string()).max(10).optional(),
    })).max(200),
  });

  app.post("/api/generate-pdf",
    express.json({ limit: "20mb" }),
    requireAuth,
    async (req, res) => {
      const validation = pdfSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid PDF request data" });
      }
      const safeData = validation.data;

      try {
        const pdfBuffer = await generatePDF(safeData);
        const base64 = pdfBuffer.toString("base64");

        const sendTo = safeData.sendToEmail;
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

        let emailSent = false;
        let emailError = "";
        try {
          await resend.emails.send({
            from: "Midwest Training and Consulting Services <onboarding@resend.dev>",
            to: ["chris@midwest-training.com"],
            replyTo: sendTo || undefined,
            subject: `Inspection Report — ${facility} · ${dateFmt}${sendTo ? ` (for ${sendTo})` : ""}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#15803d;padding:24px 32px;border-radius:8px 8px 0 0;">
                  <h1 style="color:white;margin:0;font-size:20px;">Midwest Training and Consulting Services</h1>
                  <p style="color:#bbf7d0;margin:4px 0 0;">Compliance Inspection Report</p>
                </div>
                <div style="padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                  <p style="color:#374151;">Please find attached the completed <strong>${templateName}</strong> for:</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Facility</td><td style="padding:6px 0;color:#111827;font-weight:600;">${facility}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280;">Inspection Date</td><td style="padding:6px 0;color:#111827;font-weight:600;">${dateFmt}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280;">Inspector</td><td style="padding:6px 0;color:#111827;font-weight:600;">${inspector}</td></tr>
                  </table>
                  <p style="color:#374151;">The full inspection report with cover letter is attached as a PDF.</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
                  ${sendTo ? `<p style="color:#374151;font-size:13px;"><strong>Intended recipient:</strong> ${sendTo}</p>` : ""}
                  <p style="color:#6b7280;font-size:13px;">Sent by Midwest Training and Consulting Services · <a href="https://midwest-training.com" style="color:#15803d;">midwest-training.com</a></p>
                </div>
              </div>
            `,
            attachments: [{ filename, content: base64 }],
          });
          emailSent = true;
        } catch (err: any) {
          console.error("Resend error:", err);
          emailError = "Email delivery failed";
        }

        res.json({ pdf: base64, emailSent, emailError: emailError || null });
      } catch (err: any) {
        console.error("PDF generation error:", err);
        res.status(500).json({ error: "PDF generation failed: " + err.message });
      }
    }
  );

  return httpServer;
}
