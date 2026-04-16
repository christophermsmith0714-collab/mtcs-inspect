import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
// Use zod/v4 — drizzle-zod@0.8.x uses zod v4 internally, so extend() requires v4 schemas
import { z } from "zod/v4";

// Users (clients)
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  company: text("company"),
  role: text("role").notNull().default("client"), // "client" | "admin"
  subscriptionStatus: text("subscription_status").notNull().default("active"), // "active" | "inactive"
  subscriptionStartDate: text("subscription_start_date"),
  assignedTemplates: text("assigned_templates").notNull().default("[]"), // JSON array of template IDs
});

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true })
  .extend({
    name: z.string().min(1).max(150),
    email: z.string().email().max(254),
    password: z.string().min(6).max(100),
    company: z.string().max(200).optional(),
    role: z.enum(["client", "admin"]).default("client"),
  });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Inspection templates
export const inspectionTemplates = sqliteTable("inspection_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "spcc" | "stormwater"
  description: text("description"),
});

export const insertTemplateSchema = createInsertSchema(inspectionTemplates).omit({ id: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type InspectionTemplate = typeof inspectionTemplates.$inferSelect;

// Inspection questions
export const inspectionQuestions = sqliteTable("inspection_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id").notNull(),
  section: text("section").notNull(),
  questionText: text("question_text").notNull(),
  recommendResponse: text("recommend_response").default(""),
  order: integer("order").notNull().default(0),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
});

export const insertQuestionSchema = createInsertSchema(inspectionQuestions).omit({ id: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type InspectionQuestion = typeof inspectionQuestions.$inferSelect;

// Inspection records
export const inspections = sqliteTable("inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  templateId: integer("template_id").notNull(),
  facilityName: text("facility_name").notNull(),
  facilityAddress: text("facility_address"),
  inspectorName: text("inspector_name").notNull(),
  inspectionDate: text("inspection_date").notNull(),
  status: text("status").notNull().default("in_progress"), // "in_progress" | "completed"
  generalComments: text("general_comments"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const insertInspectionSchema = createInsertSchema(inspections)
  .omit({ id: true })
  .extend({
    facilityName: z.string().min(1, "Facility name is required").max(200),
    facilityAddress: z.string().max(500).optional().nullable(),
    inspectorName: z.string().min(1, "Inspector name is required").max(100),
    inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    generalComments: z.string().max(5000).optional().nullable(),
    status: z.enum(["in_progress", "completed"]).default("in_progress"),
  });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspections.$inferSelect;

// Auth tokens (replaces cookie sessions — works reliably on Railway HTTPS)
export const authTokens = sqliteTable("auth_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  userRole: text("user_role").notNull(),
  expiresAt: text("expires_at").notNull(), // ISO string
  createdAt: text("created_at").notNull(),
});
export type AuthToken = typeof authTokens.$inferSelect;

// Inspection answers
export const inspectionAnswers = sqliteTable("inspection_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  questionId: integer("question_id").notNull(),
  answer: text("answer"), // "yes" | "no" | "n/a"
  comments: text("comments"),
  photoUrls: text("photo_urls"), // JSON array of base64 data URLs
});

export const insertAnswerSchema = createInsertSchema(inspectionAnswers)
  .omit({ id: true })
  .extend({
    answer: z.enum(["yes", "no", "n/a", ""]).optional(),
    comments: z.string().max(2000).optional().nullable(),
  });
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
export type InspectionAnswer = typeof inspectionAnswers.$inferSelect;
