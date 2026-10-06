import { tankChecklistComplete } from "@shared/tank";
import { generateChecklistPDF, type ChecklistPdfData } from "./checklist-pdf";

export type TankPdfData = ChecklistPdfData;

export function generateTankPDF(data: TankPdfData): Promise<Buffer> {
  return generateChecklistPDF(data, {
    title: "Tank Inspection Checklist",
    eyebrow: "MTCS  /  INTEGRITY REPORT COMPANION",
    draft: !tankChecklistComplete(data.questions, data.answers),
  });
}
