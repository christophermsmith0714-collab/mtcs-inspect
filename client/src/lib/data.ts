// ─── All app data lives here — no backend needed ───────────────────────────

export type User = {
  id: number;
  name: string;
  email: string;
  password: string;
  company: string;
  role: "admin" | "client";
  subscriptionStatus: "active" | "inactive";
  assignedTemplates: number[]; // template IDs the client can access
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

// ─── Seed users ────────────────────────────────────────────────────────────
export const SEED_USERS: User[] = [
  {
    id: 1,
    name: "Chris Smith",
    email: "admin@mtcs.com",
    password: "admin123",
    company: "Midwest Training and Consulting Services",
    role: "admin",
    subscriptionStatus: "active",
    assignedTemplates: [1, 2],
  },
];

// ─── Templates ────────────────────────────────────────────────────────────
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

// ─── Questions ────────────────────────────────────────────────────────────
export const QUESTIONS: Question[] = [
  // SPCC
  { id: 1,  templateId: 1, section: "Oil Storage Containers",           order: 1,  questionText: "Are all aboveground oil storage containers free of visible leaks, cracks, or damage?" },
  { id: 2,  templateId: 1, section: "Oil Storage Containers",           order: 2,  questionText: "Are tank levels within normal operating range?" },
  { id: 3,  templateId: 1, section: "Oil Storage Containers",           order: 3,  questionText: "Are all container labels and markings legible and accurate?" },
  { id: 4,  templateId: 1, section: "Oil Storage Containers",           order: 4,  questionText: "Is secondary containment intact, clean, and free of oil accumulation?" },
  { id: 5,  templateId: 1, section: "Oil Storage Containers",           order: 5,  questionText: "Are containment drain valves in the closed/sealed position?" },
  { id: 6,  templateId: 1, section: "Transfer Operations & Piping",     order: 6,  questionText: "Are all oil transfer hoses and piping free of visible leaks?" },
  { id: 7,  templateId: 1, section: "Transfer Operations & Piping",     order: 7,  questionText: "Are transfer connections and fittings in good condition?" },
  { id: 8,  templateId: 1, section: "Transfer Operations & Piping",     order: 8,  questionText: "Are flow valves functioning properly and labeled?" },
  { id: 9,  templateId: 1, section: "Spill Response Equipment",         order: 9,  questionText: "Are spill response materials (absorbents, pads, booms) readily accessible and adequately stocked?" },
  { id: 10, templateId: 1, section: "Spill Response Equipment",         order: 10, questionText: "Are spill kits clearly marked and in designated locations?" },
  { id: 11, templateId: 1, section: "Spill Response Equipment",         order: 11, questionText: "Has any spill response equipment been used and needs restocking?" },
  { id: 12, templateId: 1, section: "Drainage & Stormwater Controls",   order: 12, questionText: "Are drainage pathways clear and unobstructed?" },
  { id: 13, templateId: 1, section: "Drainage & Stormwater Controls",   order: 13, questionText: "Are floor drains, catch basins, and oil-water separators functioning properly?" },
  { id: 14, templateId: 1, section: "Drainage & Stormwater Controls",   order: 14, questionText: "Is there evidence of oil sheening in drainage areas or nearby waterways?" },
  { id: 15, templateId: 1, section: "Recordkeeping & Training",         order: 15, questionText: "Are the most recent inspection records on file and up to date?" },
  { id: 16, templateId: 1, section: "Recordkeeping & Training",         order: 16, questionText: "Have all required personnel completed current-year SPCC training?" },
  { id: 17, templateId: 1, section: "Recordkeeping & Training",         order: 17, questionText: "Are emergency contact numbers posted and current?" },

  // Stormwater
  { id: 18, templateId: 2, section: "Best Management Practices (BMPs)", order: 1,  questionText: "Are all structural BMPs (berms, curbing, diversion ditches) in good condition?" },
  { id: 19, templateId: 2, section: "Best Management Practices (BMPs)", order: 2,  questionText: "Are sediment controls (silt fences, inlet protection) intact and functional?" },
  { id: 20, templateId: 2, section: "Best Management Practices (BMPs)", order: 3,  questionText: "Have any BMPs been damaged and require repair?" },
  { id: 21, templateId: 2, section: "Material Storage Areas",           order: 4,  questionText: "Are all bulk materials stored away from stormwater drainage paths?" },
  { id: 22, templateId: 2, section: "Material Storage Areas",           order: 5,  questionText: "Are covered storage areas being used for materials that must be kept dry?" },
  { id: 23, templateId: 2, section: "Material Storage Areas",           order: 6,  questionText: "Are material storage areas free of spills or residue?" },
  { id: 24, templateId: 2, section: "Vehicle & Equipment Areas",        order: 7,  questionText: "Are vehicle maintenance areas protected from stormwater (roofed or bermed)?" },
  { id: 25, templateId: 2, section: "Vehicle & Equipment Areas",        order: 8,  questionText: "Is the vehicle/equipment washdown area contained and draining to treatment?" },
  { id: 26, templateId: 2, section: "Vehicle & Equipment Areas",        order: 9,  questionText: "Are fueling areas free of spills or staining?" },
  { id: 27, templateId: 2, section: "Outfalls & Receiving Waters",      order: 10, questionText: "Have all stormwater outfalls been inspected and are they free of illicit discharges?" },
  { id: 28, templateId: 2, section: "Outfalls & Receiving Waters",      order: 11, questionText: "Is there any evidence of pollutants (oil sheen, discoloration, foam, odor) at outfalls?" },
  { id: 29, templateId: 2, section: "Outfalls & Receiving Waters",      order: 12, questionText: "Are outfall structures (pipes, channels, rip-rap) intact with no erosion or damage?" },
  { id: 30, templateId: 2, section: "Housekeeping",                     order: 13, questionText: "Are all waste materials stored in covered containers or designated areas?" },
  { id: 31, templateId: 2, section: "Housekeeping",                     order: 14, questionText: "Is the facility grounds free of litter and loose materials that could enter stormwater?" },
  { id: 32, templateId: 2, section: "Housekeeping",                     order: 15, questionText: "Are chemical storage areas clearly labeled and in good order?" },
  { id: 33, templateId: 2, section: "SWPPP & Recordkeeping",            order: 16, questionText: "Is the current SWPPP on site and accessible to employees?" },
  { id: 34, templateId: 2, section: "SWPPP & Recordkeeping",            order: 17, questionText: "Are all required monitoring and sampling records current?" },
  { id: 35, templateId: 2, section: "SWPPP & Recordkeeping",            order: 18, questionText: "Have corrective actions from previous inspections been completed?" },
];

export function getQuestions(templateId: number): Question[] {
  return QUESTIONS.filter(q => q.templateId === templateId).sort((a, b) => a.order - b.order);
}

export function getTemplate(id: number): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplates(): Template[] {
  return TEMPLATES;
}
