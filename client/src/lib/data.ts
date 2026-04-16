// ─── Types ──────────────────────────────────────────────────────────────────

export type User = {
  id: number;
  name: string;
  email: string;
  password: string;
  company: string;
  role: "admin" | "client";
  subscriptionStatus: "active" | "inactive";
  assignedTemplates: number[];
};

export type Template = {
  id: number;
  name: string;
  type: string;
  description: string;
};

export type Question = {
  id: number;
  templateId: number;
  section: string;
  questionText: string;
  recommendResponse: string;
  order: number;
};

export type Answer = {
  questionId: number;
  answer: "yes" | "no" | "n/a" | "";
  comments: string;
  photos: string[]; // base64 data URLs
};

export type Inspection = {
  id: number;
  userId: number;
  templateId: number;
  facilityName: string;
  facilityAddress: string;
  inspectorName: string;
  inspectionDate: string;
  status: "in_progress" | "completed";
  generalComments: string;
  createdAt: string;
  completedAt?: string;
  answers: Answer[];
};

// ─── Templates are loaded from API — this cache is populated after login ──────
// Components should use useTemplates() hook (see store.tsx) instead of these.
// These are kept as fallbacks for components that haven't been migrated yet.
let _templateCache: Template[] = [];

export function setTemplateCache(templates: Template[]) {
  _templateCache = templates;
}

export function getTemplate(id: number): Template | undefined {
  return _templateCache.find(t => t.id === id);
}

export function getTemplates(): Template[] {
  return _templateCache;
}

// ─── Questions are loaded from the API — no hardcoded list ──────────────────
// Use useQuery with /api/templates/:id/questions in components
