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
  const detail = (label: string, text?: string) => text?.trim() ? "\n" + label + ": " + text : "";
  report.header("Stormwater Comprehensive Site Compliance Evaluation", "MTCS  /  ANNUAL STORMWATER EVALUATION");
  report.paragraph("Covering the period of July 1 to June 30.", false, reportColors.muted);
  report.paragraph("Submission due to KDHE by October 1 annually", false, reportColors.muted);

  report.section("Facility Information", 1);
  report.paragraph("Facility Name: " + value(data.facilityName), true);
  report.paragraph("Kansas Permit No.: " + value(data.kansasPermitNo));
  report.paragraph("Date of Inspection: " + value(reportDate(data.dateOfInspection || "")));
  report.paragraph("Inspector's Name(s): " + value(data.inspectorNames));
  report.paragraph("Inspector's Title(s): " + value(data.inspectorTitles));

  if (data.weather?.length || data.temp?.trim() || data.weatherOther?.trim()) {
    report.ensure(90);
    report.section("Weather Information at Time of Inspection", 2);
    if (data.weather?.length) report.paragraph("Conditions: " + data.weather.join(", "));
    if (data.temp?.trim()) report.paragraph("Temp: " + data.temp);
    if (data.weatherOther?.trim()) report.paragraph("Other: " + data.weatherOther);
  }

  report.rows("Discharges & Pollutant Evidence", 3, [
    { text: "Are there any discharges occurring at the time of inspection?" + detail("If yes, describe", data.dischargeDescribe), answer: data.dischargeOccurring, neutral: true },
    { text: "Is there any evidence of pollutants, in any outfall, entering the drainage system since the last inspection?" + detail("If yes, describe", data.pollutantDescribe), answer: data.pollutantEvidence, neutral: true },
  ]);

  report.rows("Control Measures", 4, (data.controlRows || []).map((row, index) => ({
    number: index + 1,
    text: "Structural Control Measure: " + value(row.structural) + "\nLocation: " + value(row.location)
      + "\nControl Measure is Operating Effectively?"
      + "\nIf No, in need of: " + ([row.needMaintenance && "Maintenance", row.needRepair && "Repair", row.needReplacement && "Replacement"].filter(Boolean).join(", ") || "None selected")
      + detail("Maintenance or Corrective Action Needed and Notes", row.notes),
    answer: row.operating,
  })));

  report.rows("Areas of Industrial Materials or Activities Exposed to Stormwater", 5,
    (data.industrialRows || []).flatMap((row, index) => {
      const inspected = ["yes", "no", "na", "n/a"].includes(row.inspected || "");
      const adequate = ["yes", "no"].includes(row.controlsAdequate || "");
      const area = "Area/Activity: " + value(row.area) + "\n";
      const notes = detail("Maintenance or Corrective Action Needed and Notes", row.notes);
      return [
        { number: index + 1, text: area + "Inspected?" + (adequate ? "" : notes), answer: row.inspected, neutral: true },
        { number: inspected ? undefined : index + 1, text: (inspected ? "" : area) + "Controls Adequate (appropriate, effective and operating)?" + notes, answer: row.controlsAdequate },
      ];
    }));

  if (data.nonComplianceNotes?.trim() || data.additionalNotes?.trim()) {
    report.ensure(100);
    report.section("Inspection Notes", 6);
    if (data.nonComplianceNotes?.trim()) report.field("Describe any incidents of non-compliance observed and not described above:", data.nonComplianceNotes);
    if (data.additionalNotes?.trim()) report.field("Use this space to indicate any additional notes or observations from this inspection.", data.additionalNotes);
  }

  report.ensure(220);
  report.section("Certification Statement", 7);
  report.paragraph(STORMWATER_CERTIFICATION, false, reportColors.navy, 8);
  report.field("Print Name and Title:", data.printNameTitle);
  report.ensure(55);
  report.paragraph("Signature: ___________________________________________________");
  report.paragraph("Date: " + value(reportDate(data.signatureDate || "")));
  return report.finish();
}
