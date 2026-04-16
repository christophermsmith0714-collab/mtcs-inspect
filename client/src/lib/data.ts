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
  type: "spcc" | "stormwater";
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

// ─── Static template list (templates don't change) ──────────────────────────
export const TEMPLATES: Template[] = [
  {
    id: 1,
    name: "SPCC Monthly Inspection",
    type: "spcc",
    description: "40 CFR Part 112 compliant monthly facility inspection",
  },
  {
    id: 2,
    name: "Stormwater Monthly Inspection",
    type: "stormwater",
    description: "MSGP / SWPPP monthly inspection documentation",
  },
];

export function getTemplate(id: number): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplates(): Template[] {
  return TEMPLATES;
}

// ─── Questions are loaded from the API — no hardcoded list ──────────────────
// Use the useQuestions() hook in components instead of getQuestions()
