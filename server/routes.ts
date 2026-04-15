import "dotenv/config";
import type { Express } from "express";
import { type Server } from "http";
import express from "express";
import { Resend } from "resend";
import { spawn } from "child_process";
import path from "path";
import { z } from "zod";
import { storage } from "./storage";
import { insertUserSchema, insertInspectionSchema } from "@shared/schema";
import { requireAuth, requireAdmin } from "./middleware";

// ── Resend from env — never hardcoded ────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Health check (used by Railway) ───────────────────────────────────────────
export function registerHealthCheck(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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

  // POST /api/auth/login
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

    // Set session — this is what all requireAuth checks validate
    req.session.userId = user.id;
    req.session.userRole = user.role as "admin" | "client";

    return res.json({ user: safeUser(user) });
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // GET /api/auth/me — returns logged-in user's own record
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(safeUser(user));
  });

  // NOTE: /api/auth/register endpoint REMOVED — only admin can create clients (Finding 4)

  // ═══════════════════════════════════════════════════════════════════════════
  // USERS — admin only
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/users — admin only (Finding 5)
  app.get("/api/users", requireAuth, requireAdmin, (_req, res) => {
    const all = storage.getAllUsers().map(safeUser);
    res.json(all);
  });

  // PATCH /api/users/:id — admin only, with field whitelisting (Finding 7)
  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });

    // Whitelist allowed fields — prevent role escalation via this route
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
  // CLIENTS — admin only (create / update)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/clients — create a new client (admin only) (Finding 9)
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
      password,  // storage.createUser will hash it
      company: company ? String(company).substring(0, 200) : "",
      role: "client",  // forced — cannot be overridden
      subscriptionStatus: "active",
      subscriptionStartDate: new Date().toISOString(),
      assignedTemplates: JSON.stringify(assignedTemplates || []),
    });

    // Welcome email — password NOT included (Finding 10)
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
                <tr><td style="padding:10px 16px;color:#6b7280;width:100px;">Login URL</td><td style="padding:10px 16px;color:#111827;font-weight:600;"><a href="https://www.perplexity.ai/computer/a/midwest-training-and-consultin-JaHYeBw9T1aGc2JbL69pUw" style="color:#15803d;">Click here to open the app</a></td></tr>
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

  // PATCH /api/clients/:id — admin only (Finding 9)
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
      updates.password = password; // storage.updateUser will hash it
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

  // ═══════════════════════════════════════════════════════════════════════════
  // INSPECTIONS — authenticated, ownership enforced
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/inspections — role determined from SESSION, not query params (Finding 6)
  app.get("/api/inspections", requireAuth, (req, res) => {
    if (req.session.userRole === "admin") {
      return res.json(storage.getAllInspections());
    }
    return res.json(storage.getInspections(req.session.userId!));
  });

  app.get("/api/inspections/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    // Only owner or admin can view
    if (req.session.userRole !== "admin" && inspection.userId !== req.session.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(inspection);
  });

  app.post("/api/inspections", requireAuth, (req, res) => {
    try {
      const body = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
      // Force userId to match session — clients cannot create inspections for others
      if (req.session.userRole !== "admin") {
        body.userId = req.session.userId;
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
    // Only owner or admin can edit
    if (req.session.userRole !== "admin" && inspection.userId !== req.session.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updated = storage.updateInspection(id, req.body);
    res.json(updated);
  });

  // DELETE — only owner or admin, with existence check (Finding 8)
  app.delete("/api/inspections/:id", requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ error: "Not found" });
    if (req.session.userRole !== "admin" && inspection.userId !== req.session.userId) {
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
    if (req.session.userRole !== "admin" && inspection.userId !== req.session.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const raw = storage.getAnswersByInspection(id);
    const mapped = raw.map(a => ({
      ...a,
      photos: (() => { try { return JSON.parse(a.photoUrls || "[]"); } catch { return []; } })(),
    }));
    res.json(mapped);
  });

  // Larger body limit for answers (photos) — 20MB, max 10 photos per answer (Finding 13)
  app.post("/api/inspections/:id/answers",
    express.json({ limit: "20mb" }),
    requireAuth,
    (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid inspection ID" });
      const inspection = storage.getInspection(id);
      if (!inspection) return res.status(404).json({ error: "Not found" });
      if (req.session.userRole !== "admin" && inspection.userId !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const answers = req.body.answers;
      if (!Array.isArray(answers) || answers.length > 200) {
        return res.status(400).json({ error: "Invalid answers payload" });
      }
      // Validate photo limits
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
  // PDF GENERATION + EMAIL — authenticated, validated (Finding 11)
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
    (req, res) => {
      // Validate and whitelist all fields before passing to Python
      const validation = pdfSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid PDF request data" });
      }
      const safeData = validation.data;

      // In production, pdf_generator.py is copied to dist/ alongside index.cjs
      const pyPath = path.join(__dirname, "pdf_generator.py");
      const py = spawn("python3", [pyPath], { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = Buffer.alloc(0);
      let stderr = "";

      py.stdout.on("data", (chunk: Buffer) => { stdout = Buffer.concat([stdout, chunk]); });
      py.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      py.on("close", async (code: number) => {
        if (code !== 0) {
          console.error("PDF generator error:", stderr);
          return res.status(500).json({ error: "PDF generation failed" });
        }

        const base64 = stdout.toString("utf8").trim();
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
      });

      py.on("error", (err: Error) => {
        console.error("Failed to start pdf_generator.py:", err);
        res.status(500).json({ error: "Failed to start PDF generator" });
      });

      py.stdin.write(JSON.stringify(safeData));
      py.stdin.end();
    }
  );

  return httpServer;
}
