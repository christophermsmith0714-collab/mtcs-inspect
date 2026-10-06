import { MtcsReport, reportColors, reportDate } from "./mtcs-pdf";

export interface StormwaterPdfData {
  facilityName?: string; kansasPermitNo?: string; dateOfInspection?: string;
  inspectorNames?: string; inspectorTitles?: string;
  weather?: string[]; temp?: string; weatherOther?: string;
  dischargeOccurring?: string; dischargeDescribe?: string;
  pollutantEvidence?: string; pollutantDescribe?: string;
  controlRows?: {
    structural?: string; location?: string; operating?: string;
    needMaintenance?: boolean; needRepair?: boolean; needReplacement?: boolean; notes?: string;
  }[];
  industrialRows?: { area?: string; inspected?: string; controlsAdequate?: string; notes?: string }[];
  nonComplianceNotes?: string; additionalNotes?: string; printNameTitle?: string; signatureDate?: string;
}

export const STORMWATER_CERTIFICATION = "\u201cI certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.\u201d";

export function generateStormwaterPDF(data: StormwaterPdfData): Promise<Buffer> {
  const report = new MtcsReport("Stormwater Comprehensive Site Compliance Evaluation");
  const value = (text?: string) => text?.trim() || "Not recorded";
  report.header("Stormwater Comprehensive Site Compliance Evaluation", "MTCS  /  ANNUAL STORMWATER EVALUATION");
  report.paragraph("Covering the period of July 1 to June 30.", false, reportColors.muted);
  report.paragraph("Submission due to KDHE by October 1 annually", false, reportColors.muted);

  report.section("Facility Information", 1);
  report.paragraph("Facility Name: " + value(data.facilityName), true);
  report.paragraph("Kansas Permit No.: " + value(data.kansasPermitNo));
  report.paragraph("Date of Inspection: " + value(reportDate(data.dateOfInspection || "")));
  report.paragraph("Inspector's Name(s): " + value(data.inspectorNames));
  report.paragraph("Inspector's Title(s): " + value(data.inspectorTitles));

  report.ensure(90);
  report.section("Weather Information at Time of Inspection", 2);
  report.paragraph("Conditions: " + (data.weather?.length ? data.weather.join(", ") : "Not recorded") + "     Temp: " + value(data.temp));
  report.paragraph("Other: " + value(data.weatherOther));

  report.rows("Discharges & Pollutant Evidence", 3, [
    { text: "Are there any discharges occurring at the time of inspection?\nIf yes, describe: " + value(data.dischargeDescribe), answer: data.dischargeOccurring, neutral: true },
    { text: "Is there any evidence of pollutants, in any outfall, entering the drainage system since the last inspection?\nIf yes, describe: " + value(data.pollutantDescribe), answer: data.pollutantEvidence, neutral: true },
  ]);

  report.rows("Control Measures", 4, (data.controlRows || []).map((row, index) => ({
    number: index + 1,
    text: "Structural Control Measure: " + value(row.structural) + "\nLocation: " + value(row.location)
      + "\nControl Measure is Operating Effectively?"
      + "\nIf No, in need of: " + ([row.needMaintenance && "Maintenance", row.needRepair && "Repair", row.needReplacement && "Replacement"].filter(Boolean).join(", ") || "None selected")
      + "\nMaintenance or Corrective Action Needed and Notes: " + value(row.notes),
    answer: row.operating,
  })));

  report.rows("Areas of Industrial Materials or Activities Exposed to Stormwater", 5,
    (data.industrialRows || []).flatMap((row, index) => [
      { number: index + 1, text: "Area/Activity: " + value(row.area) + "\nInspected?", answer: row.inspected, neutral: true },
      { text: "Controls Adequate (appropriate, effective and operating)?\nMaintenance or Corrective Action Needed and Notes: " + value(row.notes), answer: row.controlsAdequate },
    ]));

  report.ensure(100);
  report.section("Inspection Notes", 6);
  report.field("Describe any incidents of non-compliance observed and not described above:", data.nonComplianceNotes);
  report.field("Use this space to indicate any additional notes or observations from this inspection.", data.additionalNotes);

  report.ensure(220);
  report.section("Certification Statement", 7);
  report.paragraph(STORMWATER_CERTIFICATION, false, reportColors.navy, 8);
  report.field("Print Name and Title:", data.printNameTitle);
  report.ensure(55);
  report.paragraph("Signature: ___________________________________________________");
  report.paragraph("Date: " + value(reportDate(data.signatureDate || "")));
  return report.finish();
}
