import { z } from "zod/v4";

const dateOrBlank = z.union([z.literal(""), z.iso.date()]);
export const correctiveActionSchema = z.object({
  action: z.string().max(2000).default(""),
  owner: z.string().max(150).default(""),
  dueDate: dateOrBlank.default(""),
  completedDate: dateOrBlank.default(""),
});

export const tankDetailsSchema = z.object({
  tankId: z.string().max(100).default(""),
  reportReference: z.string().max(300).default(""),
  product: z.string().max(150).default(""),
  capacity: z.string().max(100).default(""),
  construction: z.string().max(200).default(""),
  manufacturerSerial: z.string().max(200).default(""),
  yearBuilt: z.string().max(40).default(""),
  designStandard: z.string().max(150).default(""),
  inspectionBasis: z.string().max(300).default(""),
  lastIntegrityDate: dateOrBlank.default(""),
  nextInspectionDate: dateOrBlank.default(""),
  limitations: z.string().max(2000).default(""),
  correctiveActions: z.record(z.string().regex(/^\d+$/), correctiveActionSchema)
    .refine(actions => Object.keys(actions).length <= 200, "Too many corrective actions").default({}),
});
export type TankDetails = z.infer<typeof tankDetailsSchema>;
export type CorrectiveAction = z.infer<typeof correctiveActionSchema>;
export const emptyTankDetails = (): TankDetails => tankDetailsSchema.parse({});

export const tankFields = [
  ["tankId", "Tank ID / number", "e.g. Tank 1"],
  ["reportReference", "Integrity report reference", "Report title or number"],
  ["product", "Stored product", "e.g. Diesel"],
  ["capacity", "Capacity (include units)", "e.g. 10,000 gallons"],
  ["construction", "Tank construction / configuration", "e.g. Horizontal, single-wall steel"],
  ["manufacturerSerial", "Manufacturer / serial number", "Record nameplate details or Unknown"],
  ["yearBuilt", "Year built / installed", "Year or Unknown"],
  ["designStandard", "Design standard / listing", "As documented on nameplate or records"],
  ["inspectionBasis", "Inspection basis / scope", "Applicable standard, edition and inspection type"],
  ["lastIntegrityDate", "Last integrity test date", ""],
  ["nextInspectionDate", "Next inspection due (per tank records)", ""],
] as const;

export const TANK_SCOPE = "Visual condition checklist accompanying the referenced integrity testing report. Record one tank per checklist. It does not establish tank suitability, test acceptance limits, or an inspection interval.";

export function tankChecklistComplete(questions: { id: number }[], answers: { questionId: number; answer?: string | null; comments?: string | null }[], details?: TankDetails | null) {
  const byId = new Map(answers.map(a => [a.questionId, a]));
  return !!details?.tankId.trim() && !!details.reportReference.trim() && questions.length > 0 && questions.every(q => {
    const a = byId.get(q.id);
    return a?.answer === "yes" || ((a?.answer === "no" || a?.answer === "n/a") && !!a.comments?.trim());
  });
}
