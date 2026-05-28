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
    recommend_response TEXT DEFAULT '',
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

// Safe migrations — add columns if missing
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN assigned_templates TEXT NOT NULL DEFAULT '[]'`);
} catch (_) { /* already exists */ }
try {
  sqlite.exec(`ALTER TABLE inspection_questions ADD COLUMN recommend_response TEXT DEFAULT ''`);
} catch (_) { /* already exists */ }
try {
  sqlite.exec(`ALTER TABLE inspections ADD COLUMN inspection_name TEXT DEFAULT NULL`);
} catch (_) { /* already exists */ }

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
  createTemplate(data: InsertTemplate): InspectionTemplate;
  updateTemplate(id: number, data: Partial<InsertTemplate>): InspectionTemplate | undefined;
  deleteTemplate(id: number): void;
  replaceQuestions(templateId: number, questions: InsertQuestion[]): InspectionQuestion[];

  // Questions
  getQuestionsByTemplate(templateId: number): InspectionQuestion[];
  createQuestion(data: InsertQuestion): InspectionQuestion;
  updateQuestion(id: number, data: Partial<InsertQuestion>): InspectionQuestion | undefined;
  deleteQuestion(id: number): void;
  deleteQuestionsByTemplate(templateId: number): void;

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

  createTemplate(data: InsertTemplate): InspectionTemplate {
    return db.insert(inspectionTemplates).values(data).returning().get();
  }

  updateTemplate(id: number, data: Partial<InsertTemplate>): InspectionTemplate | undefined {
    return db.update(inspectionTemplates).set(data).where(eq(inspectionTemplates.id, id)).returning().get();
  }

  deleteTemplate(id: number): void {
    db.delete(inspectionTemplates).where(eq(inspectionTemplates.id, id)).run();
  }

  replaceQuestions(templateId: number, questions: InsertQuestion[]): InspectionQuestion[] {
    db.delete(inspectionQuestions).where(eq(inspectionQuestions.templateId, templateId)).run();
    return questions.map(q => db.insert(inspectionQuestions).values(q).returning().get());
  }

  // ── Questions ──────────────────────────────────────────────────────────────
  getQuestionsByTemplate(templateId: number): InspectionQuestion[] {
    return db.select().from(inspectionQuestions)
      .where(eq(inspectionQuestions.templateId, templateId)).all();
  }

  createQuestion(data: InsertQuestion): InspectionQuestion {
    return db.insert(inspectionQuestions).values(data).returning().get();
  }

  updateQuestion(id: number, data: Partial<InsertQuestion>): InspectionQuestion | undefined {
    return db.update(inspectionQuestions).set(data).where(eq(inspectionQuestions.id, id)).returning().get();
  }

  deleteQuestion(id: number): void {
    db.delete(inspectionQuestions).where(eq(inspectionQuestions.id, id)).run();
  }

  deleteQuestionsByTemplate(templateId: number): void {
    db.delete(inspectionQuestions).where(eq(inspectionQuestions.templateId, templateId)).run();
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

// ── Re-seed SPCC questions (replaces old questions with CFR-based checklist) ──
function reseedSPCC() {
  const templates = storage.getTemplates();
  const spccTemplate = templates.find(t => t.type === "spcc");
  if (!spccTemplate) return; // will be created during full seed

  // Check if already on new question set (>17 questions means updated)
  const existing = storage.getQuestionsByTemplate(spccTemplate.id);
  if (existing.length > 17) return; // already updated

  // Wipe old SPCC questions and replace with CFR-based set
  db.delete(inspectionQuestions).where(eq(inspectionQuestions.templateId, spccTemplate.id)).run();

  const newQuestions = getSPCCQuestions(spccTemplate.id);
  for (const q of newQuestions) {
    db.insert(inspectionQuestions).values({ ...q, required: true }).run();
  }
  console.log(`[seed] Replaced SPCC questions with ${newQuestions.length} CFR-based questions`);
}

function getSPCCQuestions(templateId: number) {
  return [
    { templateId, section: "Above Ground Containers", questionText: "Are the tanks on a regular schedule for inspections for integrity? 40 CFR 112.8(c)", recommendResponse: "Schedule tanks for integrity inspections [Reference CFR 40 CFR 112.8(c)]", order: 1 },
    { templateId, section: "Above Ground Containers", questionText: "Are inspections documented? 40 CFR 112.8(c)", recommendResponse: "Maintain inspections documents [Reference CFR 40 CFR 112.8(c)]", order: 2 },
    { templateId, section: "Above Ground Containers", questionText: "Are comparison records of aboveground container integrity testing are maintained? 40 CFR 112.8(c)", recommendResponse: "Obtain comparison records of aboveground container integrity testing [Reference CFR 40 CFR 112.8(c)]", order: 3 },
    { templateId, section: "Bulk Storage Containers", questionText: "Area atop and around tank free of combustible materials, debris and stains?", recommendResponse: "Tanks need to be free of combustible materials and free of debris to prevent accidental ignition of the tanks. Stains should also be removed to prevent rust and show that there is not a continuing leak.", order: 4 },
    { templateId, section: "Bulk Storage Containers", questionText: "The ground and/or concrete around tank is free of oil?", recommendResponse: "Tanks need to be free of mechanical defects on the piping, joints, fill ports, etc. If there is noticeable oil on the ground, it is required that the source of that oil be found and addressed.", order: 5 },
    { templateId, section: "Bulk Storage Containers", questionText: "Container supports are free of dents, cracks or shifting?", recommendResponse: "If tank supports show signs of wear, cracks, visible dents, or if the tank is made to be unstable, the tank needs to be taken out of service immediately and the supports need to be addressed.", order: 6 },
    { templateId, section: "Bulk Storage Containers", questionText: "Is the fluid gauge working properly / tested periodically?", recommendResponse: "Tank fluid gauges need to be functional and tested periodically. Fluid gauges that are not working need to be replaced immediately.", order: 7 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are Containers free of drip marks? 40 CFR 112.8(c)", recommendResponse: "Investigate reason for container drip marks [Reference CFR 40 CFR 112.8(c)]", order: 8 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are containers free of discoloration of containers? 40 CFR 112.8(c)", recommendResponse: "Investigate reason for container discoloration [Reference CFR 40 CFR 112.8(c)]", order: 9 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are containers free of puddles, spilled or leaked materials? 40 CFR 112.8(c)", recommendResponse: "Repair or replace leaking containers [Reference CFR 40 CFR 112.8(c)]", order: 10 },
    { templateId, section: "Bulk Storage Containers", questionText: "Tank is free from visible cracks or corrosion on tank, fittings, joints or seals? 40 CFR 112.8(c)", recommendResponse: "Tanks need to be free of cracks, corrosion, or visible defects on the tanks, fittings, joints, and seals. If cracks are found on the tank, the tank needs to be pulled immediately from service and a spill prevention plan must be in place [Reference CFR 40 CFR 112.8(c)]", order: 11 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are containers free of raised spots, dents or cracks? 40 CFR 112.8(c)", recommendResponse: "Tanks need to be free of raised spots, dents, and cracks. If any of these are present, then an inspection of the tank and its integrity need to be performed immediately. [Reference CFR 40 CFR 112.8(c)]", order: 12 },
    { templateId, section: "Bulk Storage Containers", questionText: "Do containers have localized dry/dead vegetation? 40 CFR 112.8(c)", recommendResponse: "Remove excessive vegetation around bulk tank storage areas. This prevents accidental fires of dried vegetation which could ignite the nearby bulk storage tank. [Reference CFR 40 CFR 112.8(c)]", order: 13 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are containers marked properly? Visible to emergency responders - Warning, Product label, NFPA/DOT labeling? 40 CFR 112.8(c)", recommendResponse: "Tanks need to be marked properly and accordingly to what is being stored inside of them. [Reference CFR 40 CFR 112.8(c)]", order: 14 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are container tops and surroundings free of combustible materials, debris, and stains? 40 CFR 112.8(c)", recommendResponse: "Ensure container tops and surroundings are free of combustible materials, debris, and stains [Reference CFR 40 CFR 112.8(c)]", order: 15 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are test liquid sensing devices regularly checked? 40 CFR 112.8(c)", recommendResponse: "Liquid sensing devices need to be tested frequently to ensure that they are in good working order. If the sensing devices fail, then those need to be replaced immediately. [Reference CFR 40 CFR 112.8(c)]", order: 16 },
    { templateId, section: "Bulk Storage Containers", questionText: "Are tank vents clear so they may properly operate? 40 CFR 112.8(c)", recommendResponse: "Air vents need to be cleared off and free from debris so they can properly displace hazardous fumes and build up of pressure. [Reference CFR 40 CFR 112.8(c)]", order: 17 },
    { templateId, section: "Bulk Storage Containers", questionText: "Is possible leakage from defective internal heating coils monitored by steam return and exhaust? 40 CFR 112.8(c)(7)", recommendResponse: "Ensure no leakage by monitoring steam return and exhaust lines [Reference CFR 40 CFR 112.8(c)]", order: 18 },
    { templateId, section: "Containment Requirements", questionText: "Do all bulk storage containers have adequate secondary containment? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment for all containers 55 gallons or above. [Reference CFR 40 CFR 112.7(c)]", order: 19 },
    { templateId, section: "Containment Requirements", questionText: "Do all mobile/portable containers have adequate secondary containment or diverting equipment? 40 CFR 112.7(c)", recommendResponse: "Provide general secondary containment methods for portable containers. [Reference CFR 40 CFR 112.7(c)]", order: 20 },
    { templateId, section: "Containment Requirements", questionText: "Do all oil filled operational equipment (OFOE) have adequate secondary containment or alternative measures? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment or alternative measures [Reference CFR 40 CFR 112.7(c)]", order: 21 },
    { templateId, section: "Containment Requirements", questionText: "Does the facility have procedures for inspections/monitoring program to detect equipment failure and/or a discharge? 40 CFR 112.7(k)", recommendResponse: "Provide procedures for inspections and monitoring program [Reference CFR 40 CFR 112.7(k)]", order: 22 },
    { templateId, section: "Containment Requirements", questionText: "Do all oil filled electrical equipment (OFEE) have adequate secondary containment or alternative measure described? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment or alternative measures [Reference CFR 40 CFR 112.7(c)]", order: 23 },
    { templateId, section: "Containment Requirements", questionText: "Does the facility have procedures for inspections/monitoring program to detect equipment failure? 40 CFR 112.7(k)", recommendResponse: "Provide procedures for inspections and monitoring program [Reference CFR 40 CFR 112.7(k)]", order: 24 },
    { templateId, section: "Containment Requirements", questionText: "Do all piping and related appurtenances have adequate secondary containment or diverting equipment? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment or diverting equipment [Reference CFR 40 CFR 112.7(c)]", order: 25 },
    { templateId, section: "Containment Requirements", questionText: "Do all mobile refuelers or non-transportation-related tank cars have adequate secondary containment or diverting equipment? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment or diverting equipment [Reference CFR 40 CFR 112.7(c)]", order: 26 },
    { templateId, section: "Containment Requirements", questionText: "Do all transfer areas, equipment and activities have adequate secondary containment or diverting equipment? 40 CFR 112.7(c)", recommendResponse: "Provide secondary containment or diverting equipment [Reference CFR 40 CFR 112.7(c)]", order: 27 },
    { templateId, section: "Facility Drainage", questionText: "Is drainage from diked storage areas restrained by valves? 40 CFR 112.8(b)", recommendResponse: "Valves should be closed to prevent accidental release of fluid from the dike containment. If valves are leaking while closed, then those valves need to be replaced immediately. [Reference CFR 40 CFR 112.8(b)]", order: 28 },
    { templateId, section: "Facility Drainage", questionText: "Manually activated pumps or ejectors are inspected prior to draining dike? 40 CFR 112.8(b)", recommendResponse: "Inspections must be conducted for manually activated pumps [Reference CFR 40 CFR 112.8(b)]", order: 29 },
    { templateId, section: "Facility Drainage", questionText: "Is stormwater drainage inspected before discharge if released? 40 CFR 112.8(b)", recommendResponse: "Replace containment bypass valves if they are not sealing closed when not draining rainwater. Look for faulty alarms as well during this time. [Reference CFR 40 CFR 112.8(b)]", order: 30 },
    { templateId, section: "Facility Drainage", questionText: "Is capacity level adequate? 40 CFR 112.8(b)", recommendResponse: "Make modifications to facility drainage to ensure it is adequate [Reference CFR 40 CFR 112.8(b)]", order: 31 },
    { templateId, section: "Facility Drainage", questionText: "Is the dike or berm floor impermeable? 40 CFR 112.8(b)", recommendResponse: "Make modifications to dike or berm floor. [Reference CFR 40 CFR 112.8(b)]", order: 32 },
    { templateId, section: "Facility Drainage", questionText: "Is the diked area free of debris? 40 CFR 112.8(b)", recommendResponse: "Clean up the diked area of debris [Reference CFR 40 CFR 112.8(b)]", order: 33 },
    { templateId, section: "Facility Drainage", questionText: "Is the diked area free of erosion? 40 CFR 112.8(b)", recommendResponse: "Repair the areas of erosion that affect the diked area [Reference CFR 40 CFR 112.8(b)]", order: 34 },
    { templateId, section: "Facility Drainage", questionText: "Is the diked area free from presence of oil discharges? 40 CFR 112.8(b)", recommendResponse: "Leaks in diked areas need to be sealed up and the dikes need to be able to contain the spill it was designed for. If the dikes are not able to contain the spill, then rebuilding of those dikes need to be performed. [Reference CFR 40 CFR 112.8(b)]", order: 35 },
    { templateId, section: "Facility Drainage", questionText: "Is drainage from undiked areas free from potential to flow into ponds? 40 CFR 112.8(b)", recommendResponse: "Restrict drainage from flowing into ponds [Reference CFR 40 CFR 112.8(b)]", order: 36 },
    { templateId, section: "Facility Drainage", questionText: "Is catchment basin located away from flood areas? 40 CFR 112.8(b)", recommendResponse: "Make adjustments to catchment basin to not flow into flood areas [Reference CFR 40 CFR 112.8(b)]", order: 37 },
    { templateId, section: "Facility Drainage", questionText: "Is the undiked area free of erosion paths? 40 CFR 112.8(b)", recommendResponse: "Repair or modify property to remove erosion paths [Reference CFR 40 CFR 112.8(b)]", order: 38 },
    { templateId, section: "Facility Drainage", questionText: "The undiked area has availability and capacity to contain a release? 40 CFR 112.8(b)", recommendResponse: "Improve the undiked area so that it has availability and capacity to contain a release [Reference CFR 40 CFR 112.8(b)]", order: 39 },
    { templateId, section: "Facility Drainage", questionText: "Is the undiked area free of spilled/leaked materials? 40 CFR 112.8(b)", recommendResponse: "Clean the undiked area from spilled materials. [Reference CFR 40 CFR 112.8(b)]", order: 40 },
    { templateId, section: "Facility Drainage", questionText: "Is the undiked area free of debris materials? 40 CFR 112.8(b)", recommendResponse: "Clean the undiked area from debris materials [Reference CFR 40 CFR 112.8(b)]", order: 41 },
    { templateId, section: "Facility Drainage", questionText: "Is the undiked area free of stressed vegetation? 40 CFR 112.8(b)", recommendResponse: "Investigate why there is stressed vegetation and make correction to current or past leaks [Reference CFR 40 CFR 112.8(b)]", order: 42 },
    { templateId, section: "Facility Transfer Operations", questionText: "Aboveground valves, piping and appurtenances inspected regularly?", recommendResponse: "Above ground valves, piping, and appurtenances should be inspected regularly to find deficiencies or other problems. Those inspections should be documented as well as issues fixed.", order: 43 },
    { templateId, section: "Facility Transfer Operations", questionText: "Does buried piping installed or replaced on or after August 16, 2002 have protective wrapping or coating? 40 CFR 112.8(d)", recommendResponse: "Assure buried piping installed or replaced on or after August 16, 2002 has protective wrapping or coating [Reference CFR 40 CFR 112.8(d)]", order: 44 },
    { templateId, section: "Facility Transfer Operations", questionText: "Is buried piping exposed for any reason inspected for deterioration, corrosion damage and flagged for corrective action? 40 CFR 112.8(d)", recommendResponse: "Buried piping should also be tested every 5 years for leaks. [Reference CFR 40 CFR 112.8(d)]", order: 45 },
    { templateId, section: "Facility Transfer Operations", questionText: "Are pipe supports properly designed to minimize abrasion and corrosion, and allow for expansion and contraction? 40 CFR 112.8(d)", recommendResponse: "Ensure pipe supports are properly designed to minimize abrasion and corrosion [Reference CFR 40 CFR 112.8(d)]", order: 46 },
    { templateId, section: "Facility Transfer Operations", questionText: "Are aboveground valves, piping, and appurtenances inspected regularly to assess their general condition?", recommendResponse: "Regularly inspect all aboveground valves, piping, and appurtenances to assess their general condition", order: 47 },
    { templateId, section: "Facility Transfer Operations", questionText: "Is integrity and leak testing conducted on buried piping at time of installation, modification, construction, relocation or replacement? 40 CFR 112.8", recommendResponse: "Ensure integrity and leak testing has been conducted on buried piping at time of installation, modification, construction, relocation, or replacement", order: 48 },
    { templateId, section: "Facility Transfer Operations", questionText: "Are vehicles warned so that no vehicle endangers aboveground piping and other oil transfer operations? 40 CFR 112.8(d)", recommendResponse: "Vehicles entering and exiting the area during a transferring process should be warned sufficiently, especially when above ground piping and other transfer operations are in process. [Reference CFR 40 CFR 112.8(d)]", order: 49 },
    { templateId, section: "Facility Transfer Operations", questionText: "Are interlocks, warning light or physical barrier, wheel chocks or vehicle brake available and working? 40 CFR 112.8(d)", recommendResponse: "Put equipment in service - Interlocks, warning light or physical barrier, wheel chocks or vehicle brake [Reference CFR 40 CFR 112.8(d)]", order: 50 },
    { templateId, section: "Facility Transfer Operations", questionText: "Are discharges cleaned up (if applicable)? 40 CFR 112.8(d)", recommendResponse: "Clean up past spills or releases of oil products [Reference CFR 40 CFR 112.8(d)]", order: 51 },
    { templateId, section: "Foundation", questionText: "Is the foundation free of cracks? 40 CFR 112.8(c)", recommendResponse: "Repair foundation to ensure it is sealed from possible releases [Reference CFR 40 CFR 112.8(c)]", order: 52 },
    { templateId, section: "Foundation", questionText: "Is the foundation free of discoloration from past releases? 40 CFR 112.8(c)", recommendResponse: "Clean up past release in foundation [Reference CFR 40 CFR 112.8(c)]", order: 53 },
    { templateId, section: "Foundation", questionText: "Is the foundation level with no evident settling? 40 CFR 112.8(c)", recommendResponse: "Tanks need to be on a firm, secure surface. If the structure or foundation is sinking or becoming unlevel, then that tank needs to be taken out of service and the foundation needs to be fixed. [Reference CFR 40 CFR 112.8(c)]", order: 54 },
    { templateId, section: "Foundation", questionText: "Is the foundation free of gaps between tank and foundation? 40 CFR 112.8(c)", recommendResponse: "Repair the foundation where there are gaps [Reference CFR 40 CFR 112.8(c)]", order: 55 },
    { templateId, section: "Foundation", questionText: "Is the foundation free of damage caused by vegetation roots? 40 CFR 112.8(c)", recommendResponse: "Repair damage to foundation caused by vegetation [Reference CFR 40 CFR 112.8(c)]", order: 56 },
    { templateId, section: "Inspection Requirements", questionText: "Was the monthly facility inspection conducted last month? 40 CFR 112.7(e)", recommendResponse: "Review why the inspection did not occur and correct findings [Reference CFR 40 CFR 112.7(e)]", order: 57 },
    { templateId, section: "Inspection Requirements", questionText: "Are 3 years' worth of records available on request? 40 CFR 112.7(e)", recommendResponse: "Establish a records system for inspections and ensure they are maintained for 3 years [Reference CFR 40 CFR 112.7(e)]", order: 58 },
    { templateId, section: "Loading and Unloading Rack", questionText: "Does loading/unloading rack drainage flow to catch or treat discharges? 40 CFR 112.7(h)", recommendResponse: "Provide secondary containment for loading and unloading rack [Reference CFR 40 CFR 112.7(h)]", order: 59 },
    { templateId, section: "Loading and Unloading Rack", questionText: "Containment system holds at least the capacity of the largest single compartment? 40 CFR 112.8(d)", recommendResponse: "Ensure containment is adequate [Reference CFR 40 CFR 112.8(d)]", order: 60 },
    { templateId, section: "Loading and Unloading Rack", questionText: "An interlocked warning light or physical barriers, warning signs, wheel chocks, or vehicle brake system available? 40 CFR 112.8(d)", recommendResponse: "Provide physical barriers, warning signs, wheel chocks, or other devices at loading/unloading rack [Reference CFR 40 CFR 112.8(d)]", order: 61 },
    { templateId, section: "Loading and Unloading Rack", questionText: "Employees inspecting for discharges the lowermost drain and outlets? 40 CFR 112.8(d)", recommendResponse: "Inspecting must be conducted for discharges at the lowermost drain and outlets [Reference CFR 40 CFR 112.8(d)]", order: 62 },
    { templateId, section: "Out of Service Containers", questionText: "All fluids removed, all openings closed (piping, gauges closed off), and container marked \"NOT IN SERVICE\"?", recommendResponse: "Properly place bulk container out of service", order: 63 },
    { templateId, section: "Personnel Training", questionText: "Training of oil-handling personnel in operation and maintenance of equipment to prevent discharges? 40 CFR 112.7(f)", recommendResponse: "Provide employees training on how to prevent discharges [Reference CFR 40 CFR 112.7(f)]", order: 64 },
    { templateId, section: "Personnel Training", questionText: "Training of oil-handling personnel in operation and maintenance of discharge procedure protocols? 40 CFR 112.7(f)", recommendResponse: "Provide training on discharge procedure protocols [Reference CFR 40 CFR 112.7(f)]", order: 65 },
    { templateId, section: "Personnel Training", questionText: "Are 3 years' worth of training records available on request? 40 CFR 112.7(f)", recommendResponse: "Review why the training records are not available [Reference CFR 40 CFR 112.7(f)]", order: 66 },
    { templateId, section: "Piping and Equipment", questionText: "Are aboveground piping, hoses, fittings or valves in good working condition?", recommendResponse: "Above ground piping, hoses, valves, and fittings need to be in good working order. If components are not in good working order, then they need to be replaced immediately.", order: 67 },
    { templateId, section: "Piping and Equipment", questionText: "Are piping, hoses, valves, or fittings free of evidence of oil residue? 40 CFR 112.8(d)", recommendResponse: "Piping, hoses, valves, or fittings that are leaking or have evidence of oil residue need to have those components checked, tightened, or replaced immediately. [Reference CFR 40 CFR 112.8(d)]", order: 68 },
    { templateId, section: "Piping and Equipment", questionText: "Are pipes free of discoloration? 40 CFR 112.8(d)", recommendResponse: "Investigate the discoloration to determine releases from pipes [Reference CFR 40 CFR 112.8(d)]", order: 69 },
    { templateId, section: "Piping and Equipment", questionText: "Are pipes free of corrosion? 40 CFR 112.8(d)", recommendResponse: "Evaluate the depth of rust, clean and recoat pipes [Reference CFR 40 CFR 112.8(d)]", order: 70 },
    { templateId, section: "Piping and Equipment", questionText: "Are spans of pipe between supports free from bowing? 40 CFR 112.8(d)", recommendResponse: "Provide additional pipe supports to reduce bowing [Reference CFR 40 CFR 112.8(d)]", order: 71 },
    { templateId, section: "Piping and Equipment", questionText: "Are valves or seals free of evidence of stored material seepage? 40 CFR 112.8(d)", recommendResponse: "Assure there is no evidence of stored material seepage from valves or seals, note and correct if this is observed [Reference CFR 40 CFR 112.8(d)]", order: 72 },
    { templateId, section: "Piping and Equipment", questionText: "Is the area free of localized dead vegetation? 40 CFR 112.8(d)", recommendResponse: "Investigate the cause of the dead vegetation and fix equipment and clean up past release [Reference CFR 40 CFR 112.8(d)]", order: 73 },
    { templateId, section: "Releases from Diked Containment", questionText: "Are records of release documented? 40 CFR 112.8(b)", recommendResponse: "Records of release must be kept [Reference CFR 40 CFR 112.8(b)]", order: 74 },
    { templateId, section: "Security Measures", questionText: "Are oil handling, processing and storage areas secure, or have controlled access? 40 CFR 112.7(g)", recommendResponse: "Secure all oil handling, processing and storage areas [Reference CFR 40 CFR 112.7(g)]", order: 75 },
    { templateId, section: "Security Measures", questionText: "Are master flow and drain valves secured in closed position when in a non-operating or standby status? 40 CFR 112.7(g)", recommendResponse: "Master flow and drain valves should be secured and closed when not in use to prevent accidental release of liquid from bulk tanks. [Reference CFR 40 CFR 112.7(g)]", order: 76 },
    { templateId, section: "Security Measures", questionText: "Starter controls on oil pumps prevented from unauthorized access? 40 CFR 112.7(g)", recommendResponse: "Start controls should be locked, if applicable, during non-operational hours to prevent accidental releases of fluids. This would also prevent theft or vandalism of fluids during non-working hours. [Reference CFR 40 CFR 112.7(g)]", order: 77 },
    { templateId, section: "Security Measures", questionText: "Are out-of-service and loading/unloading connections of oil pipelines secured with caps or blanks? 40 CFR 112.7(g)", recommendResponse: "Loading and unloading connections should be capped and/or blank-flanged when not in service to prevent foreign materials into service pumps or tanks. [Reference CFR 40 CFR 112.7(g)]", order: 78 },
    { templateId, section: "Security Measures", questionText: "Are lights working properly to detect a spill at night? 40 CFR 112.7(g)", recommendResponse: "Lights should be in positions where spills can be detected quickly at night. This includes bulk storage areas, fuel filling stations, and other storage systems that could result in leaks, spills, or excessive amounts of liquid. [Reference CFR 40 CFR 112.7(g)]", order: 79 },
    { templateId, section: "Security Measures", questionText: "Are all warning signs properly posted and readable? 40 CFR 112.7(g)", recommendResponse: "Warning signs need to be posted properly and readable. Signs that are not readable or properly posted per NFPA regulations need to be replaced. [Reference CFR 40 CFR 112.7(g)]", order: 80 },
    { templateId, section: "Security Measures", questionText: "Are spill kits easily accessible, protected from the weather, complete, and replenished if necessary? 40 CFR 112.7", recommendResponse: "Spill kits must be maintained and in good condition in case of use. Kits that need to be restocked should be done so in a timely manner in the event of a spill. Spill containment kits should also be weather resistant. [Reference CFR 40 CFR 112.7]", order: 81 },
    { templateId, section: "Security Measures", questionText: "Are vehicle guard posts (bollards) properly secured?", recommendResponse: "Guards that are in place to prevent vehicles from running into bulk storage tanks accidentally must be in good working condition or must be replaced immediately.", order: 82 },
  ];
}

// ── Seed default templates and admin account ─────────────────────────────────
async function seedDatabase() {
  const existing = storage.getTemplates();
  if (existing.length > 0) {
    // DB already seeded — but check if SPCC questions need updating
    reseedSPCC();
    return;
  }

  // SPCC Template
  const spcc = db.insert(inspectionTemplates).values({
    name: "SPCC Monthly Inspection",
    type: "spcc",
    description: "Spill Prevention, Control, and Countermeasure monthly facility inspection per 40 CFR Part 112"
  }).returning().get();

  const spccQuestions = getSPCCQuestions(spcc.id);
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
