import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";
import {
  users, inspectionTemplates, inspectionQuestions,
  inspections, inspectionAnswers, authTokens,
  type User, type InsertUser,
  type InspectionTemplate, type InsertTemplate,
  type InspectionQuestion, type InsertQuestion,
  type Inspection, type InsertInspection,
  type InspectionAnswer, type InsertAnswer,
  type AuthToken,
} from "@shared/schema";
import crypto from "crypto";

// ── DB path: from env or default to ./data/spcc.db ──────────────────────────
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), "data", "spcc.db");

// Ensure data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite);

// ── Create tables ────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    company TEXT,
    role TEXT NOT NULL DEFAULT 'client',
    subscription_status TEXT NOT NULL DEFAULT 'active',
    subscription_start_date TEXT,
    assigned_templates TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS inspection_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS inspection_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    question_text TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    required INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    facility_name TEXT NOT NULL,
    facility_address TEXT,
    inspector_name TEXT NOT NULL,
    inspection_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    general_comments TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS inspection_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    answer TEXT,
    comments TEXT,
    photo_urls TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    user_role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Safe migration: add assigned_templates if missing
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN assigned_templates TEXT NOT NULL DEFAULT '[]'`);
} catch (_) { /* column already exists */ }

// ── Storage Interface ────────────────────────────────────────────────────────
export interface IStorage {
  // Auth tokens
  createToken(userId: number, userRole: string): AuthToken;
  getToken(token: string): AuthToken | undefined;
  deleteToken(token: string): void;
  cleanExpiredTokens(): void;

  // Users — async due to bcrypt
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  verifyPassword(plaintext: string, hash: string): Promise<boolean>;

  // Templates
  getTemplates(): InspectionTemplate[];
  getTemplate(id: number): InspectionTemplate | undefined;

  // Questions
  getQuestionsByTemplate(templateId: number): InspectionQuestion[];

  // Inspections
  getInspections(userId: number): Inspection[];
  getAllInspections(): Inspection[];
  getInspection(id: number): Inspection | undefined;
  createInspection(data: InsertInspection): Inspection;
  updateInspection(id: number, data: Partial<InsertInspection>): Inspection | undefined;
  deleteInspection(id: number): void;

  // Answers
  getAnswersByInspection(inspectionId: number): InspectionAnswer[];
  upsertAnswer(data: InsertAnswer): InspectionAnswer;
  deleteAnswersByInspection(inspectionId: number): void;
}

export class SQLiteStorage implements IStorage {
  // ── Auth Tokens ────────────────────────────────────────────────────────────
  createToken(userId: number, userRole: string): AuthToken {
    const token = crypto.randomBytes(48).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours
    return db.insert(authTokens).values({
      token,
      userId,
      userRole,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    }).returning().get();
  }

  getToken(token: string): AuthToken | undefined {
    const record = db.select().from(authTokens).where(eq(authTokens.token, token)).get();
    if (!record) return undefined;
    // Check expiry
    if (new Date(record.expiresAt) < new Date()) {
      this.deleteToken(token);
      return undefined;
    }
    return record;
  }

  deleteToken(token: string): void {
    db.delete(authTokens).where(eq(authTokens.token, token)).run();
  }

  cleanExpiredTokens(): void {
    const now = new Date().toISOString();
    sqlite.exec(`DELETE FROM auth_tokens WHERE expires_at < '${now}'`);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).get();
  }

  getAllUsers(): User[] {
    return db.select().from(users).all();
  }

  async createUser(data: InsertUser): Promise<User> {
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const normalizedEmail = data.email.toLowerCase().trim();
    return db.insert(users).values({ ...data, password: hashedPassword, email: normalizedEmail }).returning().get();
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    // Hash password if it's being updated and isn't already a hash
    if (data.password && !data.password.startsWith("$2b$") && !data.password.startsWith("$2a$")) {
      data = { ...data, password: await bcrypt.hash(data.password, 12) };
    }
    if (data.email) {
      data = { ...data, email: data.email.toLowerCase().trim() };
    }
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }

  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  getTemplates(): InspectionTemplate[] {
    return db.select().from(inspectionTemplates).all();
  }

  getTemplate(id: number): InspectionTemplate | undefined {
    return db.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, id)).get();
  }

  // ── Questions ──────────────────────────────────────────────────────────────
  getQuestionsByTemplate(templateId: number): InspectionQuestion[] {
    return db.select().from(inspectionQuestions)
      .where(eq(inspectionQuestions.templateId, templateId)).all();
  }

  // ── Inspections ────────────────────────────────────────────────────────────
  getInspections(userId: number): Inspection[] {
    return db.select().from(inspections).where(eq(inspections.userId, userId)).all();
  }

  getAllInspections(): Inspection[] {
    return db.select().from(inspections).all();
  }

  getInspection(id: number): Inspection | undefined {
    return db.select().from(inspections).where(eq(inspections.id, id)).get();
  }

  createInspection(data: InsertInspection): Inspection {
    return db.insert(inspections).values(data).returning().get();
  }

  updateInspection(id: number, data: Partial<InsertInspection>): Inspection | undefined {
    return db.update(inspections).set(data).where(eq(inspections.id, id)).returning().get();
  }

  deleteInspection(id: number): void {
    db.delete(inspections).where(eq(inspections.id, id)).run();
  }

  // ── Answers ────────────────────────────────────────────────────────────────
  getAnswersByInspection(inspectionId: number): InspectionAnswer[] {
    return db.select().from(inspectionAnswers)
      .where(eq(inspectionAnswers.inspectionId, inspectionId)).all();
  }

  upsertAnswer(data: InsertAnswer): InspectionAnswer {
    const existing = db.select().from(inspectionAnswers)
      .where(eq(inspectionAnswers.inspectionId, data.inspectionId!))
      .all()
      .find(a => a.questionId === data.questionId);

    if (existing) {
      return db.update(inspectionAnswers).set(data)
        .where(eq(inspectionAnswers.id, existing.id)).returning().get();
    }
    return db.insert(inspectionAnswers).values(data).returning().get();
  }

  deleteAnswersByInspection(inspectionId: number): void {
    db.delete(inspectionAnswers).where(eq(inspectionAnswers.inspectionId, inspectionId)).run();
  }
}

export const storage = new SQLiteStorage();

// ── Seed default templates and admin account ─────────────────────────────────
async function seedDatabase() {
  const existing = storage.getTemplates();
  if (existing.length > 0) return;

  // SPCC Template
  const spcc = db.insert(inspectionTemplates).values({
    name: "SPCC Monthly Inspection",
    type: "spcc",
    description: "Spill Prevention, Control, and Countermeasure monthly facility inspection per 40 CFR Part 112"
  }).returning().get();

  const spccQuestions = [
    { templateId: spcc.id, section: "Oil Storage Containers", questionText: "Are all aboveground oil storage containers free of visible leaks, cracks, or damage?", order: 1 },
    { templateId: spcc.id, section: "Oil Storage Containers", questionText: "Are tank levels within normal operating range?", order: 2 },
    { templateId: spcc.id, section: "Oil Storage Containers", questionText: "Are all container labels and markings legible and accurate?", order: 3 },
    { templateId: spcc.id, section: "Oil Storage Containers", questionText: "Is secondary containment intact, clean, and free of oil accumulation?", order: 4 },
    { templateId: spcc.id, section: "Oil Storage Containers", questionText: "Are containment drain valves in the closed/sealed position?", order: 5 },
    { templateId: spcc.id, section: "Transfer Operations & Piping", questionText: "Are all oil transfer hoses and piping free of visible leaks?", order: 6 },
    { templateId: spcc.id, section: "Transfer Operations & Piping", questionText: "Are transfer connections and fittings in good condition?", order: 7 },
    { templateId: spcc.id, section: "Transfer Operations & Piping", questionText: "Are flow valves functioning properly and labeled?", order: 8 },
    { templateId: spcc.id, section: "Spill Response Equipment", questionText: "Are spill response materials (absorbents, pads, booms) readily accessible and adequately stocked?", order: 9 },
    { templateId: spcc.id, section: "Spill Response Equipment", questionText: "Are spill kits clearly marked and in designated locations?", order: 10 },
    { templateId: spcc.id, section: "Spill Response Equipment", questionText: "Has any spill response equipment been used and needs restocking?", order: 11 },
    { templateId: spcc.id, section: "Drainage & Stormwater Controls", questionText: "Are drainage pathways clear and unobstructed?", order: 12 },
    { templateId: spcc.id, section: "Drainage & Stormwater Controls", questionText: "Are floor drains, catch basins, and oil-water separators functioning properly?", order: 13 },
    { templateId: spcc.id, section: "Drainage & Stormwater Controls", questionText: "Is there evidence of oil sheening in drainage areas or nearby waterways?", order: 14 },
    { templateId: spcc.id, section: "Recordkeeping & Training", questionText: "Are the most recent inspection records on file and up to date?", order: 15 },
    { templateId: spcc.id, section: "Recordkeeping & Training", questionText: "Have all required personnel completed current-year SPCC training?", order: 16 },
    { templateId: spcc.id, section: "Recordkeeping & Training", questionText: "Are emergency contact numbers posted and current?", order: 17 },
  ];
  for (const q of spccQuestions) {
    db.insert(inspectionQuestions).values({ ...q, required: true }).run();
  }

  // Stormwater Template
  const sw = db.insert(inspectionTemplates).values({
    name: "Stormwater Monthly Inspection",
    type: "stormwater",
    description: "Industrial stormwater inspection per MSGP / facility SWPPP requirements"
  }).returning().get();

  const swQuestions = [
    { templateId: sw.id, section: "Best Management Practices (BMPs)", questionText: "Are all structural BMPs (berms, curbing, diversion ditches) in good condition?", order: 1 },
    { templateId: sw.id, section: "Best Management Practices (BMPs)", questionText: "Are sediment controls (silt fences, inlet protection) intact and functional?", order: 2 },
    { templateId: sw.id, section: "Best Management Practices (BMPs)", questionText: "Have any BMPs been damaged and require repair?", order: 3 },
    { templateId: sw.id, section: "Material Storage Areas", questionText: "Are all bulk materials (aggregates, chemicals, waste) stored away from stormwater drainage paths?", order: 4 },
    { templateId: sw.id, section: "Material Storage Areas", questionText: "Are covered storage areas being used for materials that must be kept dry?", order: 5 },
    { templateId: sw.id, section: "Material Storage Areas", questionText: "Are material storage areas free of spills or residue that could be carried off by stormwater?", order: 6 },
    { templateId: sw.id, section: "Vehicle & Equipment Areas", questionText: "Are vehicle maintenance areas protected from stormwater (roofed or bermed)?", order: 7 },
    { templateId: sw.id, section: "Vehicle & Equipment Areas", questionText: "Is the vehicle/equipment washdown area contained and draining to treatment?", order: 8 },
    { templateId: sw.id, section: "Vehicle & Equipment Areas", questionText: "Are fueling areas free of spills or staining?", order: 9 },
    { templateId: sw.id, section: "Outfalls & Receiving Waters", questionText: "Have all stormwater outfalls been inspected and are they free of illicit discharges?", order: 10 },
    { templateId: sw.id, section: "Outfalls & Receiving Waters", questionText: "Is there any evidence of pollutants (oil sheen, discoloration, foam, odor) at outfalls?", order: 11 },
    { templateId: sw.id, section: "Outfalls & Receiving Waters", questionText: "Are outfall structures (pipes, channels, rip-rap) intact with no erosion or damage?", order: 12 },
    { templateId: sw.id, section: "Housekeeping", questionText: "Are all waste materials (garbage, debris, scrap) being stored in covered containers or designated areas?", order: 13 },
    { templateId: sw.id, section: "Housekeeping", questionText: "Is the facility grounds free of litter and loose materials that could enter stormwater?", order: 14 },
    { templateId: sw.id, section: "Housekeeping", questionText: "Are chemical storage areas clearly labeled and in good order?", order: 15 },
    { templateId: sw.id, section: "SWPPP & Recordkeeping", questionText: "Is the current SWPPP on site and accessible to employees?", order: 16 },
    { templateId: sw.id, section: "SWPPP & Recordkeeping", questionText: "Are all required monitoring and sampling records current?", order: 17 },
    { templateId: sw.id, section: "SWPPP & Recordkeeping", questionText: "Have corrective actions from previous inspections been completed?", order: 18 },
  ];
  for (const q of swQuestions) {
    db.insert(inspectionQuestions).values({ ...q, required: true }).run();
  }

  // Seed admin account — password is hashed, never plaintext
  await storage.createUser({
    name: "Chris Smith",
    email: "admin@mtcs.com",
    password: process.env.ADMIN_INITIAL_PASSWORD || "mtcs-admin-2026!",
    company: "Midwest Training and Consulting Services",
    role: "admin",
    subscriptionStatus: "active",
    subscriptionStartDate: new Date().toISOString(),
    assignedTemplates: "[1,2]",
  });
}

seedDatabase().catch(console.error);
