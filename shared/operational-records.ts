import { z } from "zod/v4";
import { quarterlyChecks, quarterlyInspectorStatement, quarterlyReviewStatement } from "./quarterly-stormwater";

export const recordTemplates = [
  { type: "american_concrete_quarterly", name: "American Concrete Quarterly Inspection", description: "71 site-specific quarterly stormwater checks, corrective actions, closeout dates, and sign-offs." },
  { type: "transfer_log", name: "Tank Level and Fluid Transfer Log", description: "Record tank levels, receiving capacity, and quantities added or removed." },
  { type: "transfer_checklist", name: "Transfer Procedure Checklist", description: "14 transfer checks with YES, NO, N/A, comments, and inspector sign-off." },
  { type: "controlled_drainage", name: "Controlled Drainage Record", description: "Document drainage, water inspection, disposition, and drain closure." },
] as const;
export type RecordType = typeof recordTemplates[number]["type"];
export function isRecordType(type?: string): type is RecordType {
  return recordTemplates.some(template => template.type === type);
}

export function isSpccRecordType(type?: string) {
  return isRecordType(type) && type !== "american_concrete_quarterly";
}
export function recordCategory(type: RecordType) {
  return type === "american_concrete_quarterly" ? "Stormwater Inspections" : "SPCC Inspections";
}
export function recordFacilityName(type: RecordType) {
  return type === "american_concrete_quarterly" ? "American Concrete" : "";
}

export function visibleInspectionTemplates<T extends { id: number; type: string }>(templates: T[], user: { role: string; assignedTemplates?: number[] }) {
  const assigned = user.assignedTemplates ?? [];
  const hasSpcc = templates.some(template => template.type === "spcc" && assigned.includes(template.id));
  return templates.filter(template => user.role === "admin" || assigned.includes(template.id) || (hasSpcc && isSpccRecordType(template.type)));
}

export const ullageGuidance = "Ullage is the available space below the verified safe fill limit. Record quantities added or removed, identify the actual receiving container, and verify available receiving capacity before transfer. Do not infer a safe fill limit from shell capacity alone.";

export const transferChecks = [
  "Product, source, receiver, available receiving capacity and authorized quantity verified?",
  "Hoses, valves, connections and gauges checked; emergency shutdown available?",
  "Brake set and vehicle secured against movement?",
  "Compatible drip/release containment and response equipment in place?",
  "Correct valve lineup confirmed, including required overflow/equalizing paths?",
  "Required vapor control and static protection connected per approved procedure?",
  "Qualified attendant assigned and able to stop transfer?",
  "Transfer monitored for leaks, abnormal pressure and receiving level?",
  "Transfer stopped at the authorized quantity or verified safe fill limit?",
  "Source isolated and pressure/contents recovered before disconnection?",
  "Connections capped, equipment secured and lowermost drains/outlets checked?",
  "Final levels and quantities added/removed entered in the Tank Level and Fluid Transfer Log?",
  "Deficiencies corrected or transfer stopped; spill notifications made if required?",
  "Driver released only after all hoses and equipment were safely disconnected?",
] as const;

export interface RecordField { key: string; label: string; type?: "date" | "time" | "number" | "textarea" | "yesno"; required?: boolean; signed?: boolean }
export interface RecordSection { title: string; description?: string; fields: RecordField[] }
export const recordSections: Record<RecordType, RecordSection[]> = {
  american_concrete_quarterly: [
    { title: "Deficiencies and SWPPP review", description: "A No requires corrective action. Record the completion date for each deficiency. Revise the SWPPP within 90 days if BMPs are not working.", fields: [
      { key: "stillOpen", label: "Still-open deficiencies / follow-up notes", type: "textarea" },
      { key: "swpppChange", label: "SWPPP change needed?", type: "yesno", required: true },
      { key: "swpppDetails", label: "If yes, what needs to change?", type: "textarea" },
    ] },
    { title: "Inspector sign-off", description: quarterlyInspectorStatement, fields: [
      { key: "inspectorPrintName", label: "Inspector printed name", required: true },
      { key: "signature", label: "Inspector signature (typed name)", required: true },
      { key: "signatureDate", label: "Inspector signature date", type: "date", required: true },
    ] },
    { title: "Allen Beneke (or designee) review", description: quarterlyReviewStatement, fields: [
      { key: "reviewSignature", label: "Reviewer signature (typed name)", required: true },
      { key: "reviewDate", label: "Review date", type: "date", required: true },
    ] },
  ],
  transfer_log: [],
  transfer_checklist: [
    { title: "Transfer details", fields: [
      { key: "tank", label: "Tank", required: true },
      { key: "representative", label: "Representative", required: true },
      { key: "supplier", label: "Supplier" },
    ] },
    { title: "Inspector sign-off", fields: [
      { key: "signature", label: "Inspector signature (typed name)", required: true },
      { key: "signatureDate", label: "Signature date", type: "date", required: true },
    ] },
  ],
  controlled_drainage: [
    { title: "General information", fields: [{ key: "position", label: "Position" }] },
    { title: "Release documentation", fields: [
      { key: "startTime", label: "Start time", type: "time", required: true },
      { key: "endTime", label: "End time", type: "time", required: true },
      { key: "releaseLocation", label: "Release location", required: true },
      { key: "estimatedQuantity", label: "Estimated quantity (include units)", required: true },
      { key: "waterInspected", label: "Water inspected?", type: "yesno", required: true },
      { key: "drainSecured", label: "Drain secured?", type: "yesno", required: true },
    ] },
    { title: "Observations and additional comments", fields: [
      { key: "observations", label: "Issues encountered or general observations", type: "textarea" },
      { key: "findings", label: "Inspection findings / oil removal", type: "textarea" },
      { key: "releaseDestination", label: "Release destination" },
    ] },
    { title: "Authorization and drain closure", fields: [
      { key: "authorizedBy", label: "Authorized and supervised by (typed signature)", required: true },
      { key: "authorizationDate", label: "Authorization date", type: "date", required: true },
      { key: "drainClosedAt", label: "Drain closed / resealed at", type: "time", required: true },
      { key: "verifiedBy", label: "Verified by", required: true },
    ] },
  ],
};

export const transferColumns: RecordField[] = [
  { key: "date", label: "Date", type: "date", required: true },
  { key: "tankId", label: "Tank ID", required: true },
  { key: "initials", label: "Initials", required: true },
  { key: "gaugeReading", label: "Gauge reading", required: true },
  { key: "initialVolume", label: "Initial volume (gal)", type: "number", required: true },
  { key: "receivingContainer", label: "Actual receiving container", required: true },
  { key: "receivingCapacity", label: "Available receiving capacity (gal)", type: "number", required: true },
  { key: "addedRemoved", label: "Added / removed (gal; + added, - removed)", type: "number", signed: true, required: true },
  { key: "comments", label: "Comments", type: "textarea" },
];
export const dispositionColumns: RecordField[] = [
  { key: "location", label: "Storage / release location", required: true },
  { key: "method", label: "Disposition method", required: true },
  { key: "date", label: "Date", type: "date", required: true },
];

const text = z.string().max(2000);
function fieldSchema(field: RecordField) {
  if (field.type === "date") return z.union([z.literal(""), z.iso.date()]);
  if (field.type === "time") return z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/);
  if (field.type === "yesno") return z.enum(["", "yes", "no"]);
  if (field.type === "number") return z.string().max(30).refine(value => value === "" ||
    (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value)) && (field.signed || Number(value) >= 0)), "Enter a valid quantity");
  return text;
}
function fieldsSchema(fields: RecordField[]) {
  return z.object(Object.fromEntries(fields.map(field => [field.key, fieldSchema(field)]))).strict();
}
function recordSchema<T extends RecordType>(kind: T) {
  const quarterly = kind === "american_concrete_quarterly";
  return z.object({
    kind: z.literal(kind),
    fields: fieldsSchema(recordSections[kind].flatMap(section => section.fields)),
    rows: z.array(fieldsSchema(kind === "transfer_log" ? transferColumns : kind === "controlled_drainage" ? dispositionColumns : [])).max(kind === "transfer_checklist" || quarterly ? 0 : 100),
    checks: z.array(z.object({
      answer: z.enum(["", "yes", "no", "n/a"]), comments: text,
      deficiency: text.optional(), correctiveAction: text.optional(), closeoutDate: z.union([z.literal(""), z.iso.date()]).optional(),
    }).strict().superRefine((check, context) => {
      for (const key of ["deficiency", "correctiveAction", "closeoutDate"] as const) {
        if (quarterly ? check[key] === undefined : check[key] !== undefined)
          context.addIssue({ code: "custom", path: [key], message: quarterly ? "Required quarterly field" : "Unexpected field" });
      }
    })).length(quarterly ? quarterlyChecks.length : kind === "transfer_checklist" ? transferChecks.length : 0),
  }).strict();
}
export const operationalRecordSchema = z.discriminatedUnion("kind", [
  recordSchema("american_concrete_quarterly"), recordSchema("transfer_log"), recordSchema("transfer_checklist"), recordSchema("controlled_drainage"),
]);
export type OperationalRecord = z.infer<typeof operationalRecordSchema>;

export function blankRow(fields: RecordField[]): Record<string, string> {
  return Object.fromEntries(fields.map(field => [field.key, ""]));
}
export function blankRecord(kind: RecordType): OperationalRecord {
  return {
    kind, fields: blankRow(recordSections[kind].flatMap(section => section.fields)),
    rows: kind === "transfer_log" ? [blankRow(transferColumns)] : [],
    checks: kind === "american_concrete_quarterly" ? quarterlyChecks.map(() => ({ answer: "" as const, comments: "", deficiency: "", correctiveAction: "", closeoutDate: "" })) : kind === "transfer_checklist" ? transferChecks.map(() => ({ answer: "" as const, comments: "" })) : [],
  };
}

export function recordCompletionErrors(record: OperationalRecord): string[] {
  const errors: string[] = [];
  for (const field of recordSections[record.kind].flatMap(section => section.fields)) {
    if (field.required && !record.fields[field.key]?.trim()) errors.push(field.label);
  }
  if (record.kind === "transfer_log" && record.rows.length === 0) errors.push("At least one transfer entry");
  const columns = record.kind === "transfer_log" ? transferColumns : dispositionColumns;
  record.rows.forEach((row, index) => {
    for (const field of columns) if (field.required && !row[field.key]?.trim()) errors.push(`Entry ${index + 1}: ${field.label}`);
  });
  if (record.kind === "transfer_checklist") {
    record.checks.forEach((check, index) => { if (!check.answer) errors.push(`Check ${index + 1}`); });
  }
  if (record.kind === "american_concrete_quarterly") {
    record.checks.forEach((check, index) => {
      if (check.answer !== "no") return;
      if (!check.deficiency?.trim()) errors.push(`Check ${index + 1}: Deficiency found`);
      if (!check.correctiveAction?.trim()) errors.push(`Check ${index + 1}: Corrective action`);
    });
    if (record.fields.swpppChange === "yes" && !record.fields.swpppDetails?.trim()) errors.push("SWPPP change details");
  }
  return errors;
}

export function quarterlySummary(record: OperationalRecord) {
  const deficiencies = record.checks.flatMap((check, index) => check.answer === "no" ? [{ ...check, number: index + 1 }] : []);
  const open = deficiencies.filter(check => !check.correctiveAction?.trim() || !check.closeoutDate);
  return { count: deficiencies.length, openNumbers: open.map(check => check.number), allClosed: open.length === 0 };
}
