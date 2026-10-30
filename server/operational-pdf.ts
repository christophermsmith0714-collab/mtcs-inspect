import { quarterlyGuidance, quarterlySections } from "@shared/quarterly-stormwater";
import type { OperationalRecord, RecordField } from "@shared/operational-records";
import { dispositionColumns, recordCategory, quarterlySummary, recordSections, recordTemplates, transferChecks, transferColumns, ullageGuidance } from "@shared/operational-records";
import { MtcsReport, reportDate, reportColors } from "./mtcs-pdf";

export async function generateOperationalPDF(data: {
  inspectionName?: string | null; inspectorName: string; inspectionDate: string;
  status: string; recordData: OperationalRecord;
}) {
  const record = data.recordData;
  const title = recordTemplates.find(template => template.type === record.kind)!.name;
  const report = new MtcsReport(title);
  report.header(title, `MTCS  /  ${recordCategory(record.kind).toUpperCase()}`);
  report.paragraph(data.status === "completed" ? "COMPLETED RECORD" : "DRAFT - INCOMPLETE RECORD", true, reportColors.muted);
  if (data.inspectionName && data.inspectionName !== title) report.field("Record name", data.inspectionName);
  report.paragraph(`${record.kind === "controlled_drainage" ? "Completed by" : "Inspector"}: ${data.inspectorName}    |    ${record.kind === "controlled_drainage" ? "Discharge date" : "Date"}: ${reportDate(data.inspectionDate)}`);
  let number = 0;
  const fieldGrid = (heading: string, fields: RecordField[], values: Record<string, string>) => {
    const groups: RecordField[][] = [];
    for (const field of fields) {
      const last = groups[groups.length - 1];
      if (field.type !== "textarea" && last?.length === 1 && last[0].type !== "textarea") last.push(field);
      else groups.push([field]);
    }
    const display = (field: RecordField) => {
      const value = values[field.key] || "";
      return (field.type === "yesno" ? value.toUpperCase() : field.type === "date" ? reportDate(value) : value) || "Not recorded";
    };
    const width = (group: RecordField[]) => group.length === 1 ? report.width : (report.width - 20) / 2;
    const height = (group: RecordField[]) => Math.max(...group.map(field =>
      report.measure(field.label, width(group), true, 8) + report.measure(display(field), width(group)) + 10));
    const total = report.sectionHeight(heading) + groups.reduce((sum, group) => sum + height(group), 0);
    report.ensure(total <= report.bottom - 36 ? total : report.sectionHeight(heading) + height(groups[0]));
    const sectionNumber = ++number;
    report.section(heading, sectionNumber);
    for (const group of groups) {
      const rowHeight = height(group);
      if (report.y + rowHeight > report.bottom) { report.newPage(); report.section(heading + " (continued)", sectionNumber); }
      group.forEach((field, index) => {
        const x = report.x + index * (width(group) + 20);
        const labelHeight = report.measure(field.label, width(group), true, 8);
        report.doc.font("Helvetica-Bold").fontSize(8).fillColor(reportColors.muted).text(field.label, x, report.y + 4, { width: width(group), lineGap: 1 });
        report.doc.font("Helvetica").fontSize(9).fillColor(reportColors.navy).text(display(field), x, report.y + labelHeight + 8, { width: width(group), lineGap: 1 });
      });
      report.y += rowHeight;
    }
    report.y += 4;
  };
  const section = (index: number) => {
    const item = recordSections[record.kind][index];
    if (item.description) {
      report.ensure(report.sectionHeight(item.title) + report.measure(item.description) + 80);
      report.paragraph(item.description);
    }
    fieldGrid(item.title, item.fields, record.fields);
  };
  const rows = () => {
    const columns = record.kind === "transfer_log" ? transferColumns : dispositionColumns;
    if (!record.rows.length) { report.section("Contaminated water disposition", ++number); report.paragraph("No entries recorded."); }
    record.rows.forEach((row, index) => {
      fieldGrid(`${record.kind === "transfer_log" ? "Transfer" : "Contaminated water disposition"} entry ${index + 1}`, columns, row);
    });
  };
  if (record.kind === "transfer_log") { report.paragraph(ullageGuidance); rows(); }
  if (record.kind === "transfer_checklist") {
    section(0);
    report.rows("Transfer procedure checks", ++number, transferChecks.map((question, index) => ({
      number: index + 1, text: question + (record.checks[index].comments ? `\nComments / correction: ${record.checks[index].comments}` : ""), answer: record.checks[index].answer,
    })), true);
    section(1);
  }
  if (record.kind === "controlled_drainage") { section(0); section(1); rows(); section(2); section(3); }
  if (record.kind === "american_concrete_quarterly") {
    report.paragraph("Routine Quarterly Inspection Checklist", true);
    report.paragraph(quarterlyGuidance);
    report.paragraph("SKIPPED means no response was recorded. N/A means the inspector marked the item not applicable.", false, reportColors.muted);
    for (const group of quarterlySections) {
      report.rows(group.title, ++number, group.checks.map(question => {
        const check = record.checks[question.number - 1];
        const details: string[] = check.comments ? [`Comments / supporting details: ${check.comments}`] : [];
        if (check.answer === "no" || check.deficiency || check.correctiveAction || check.closeoutDate) {
          details.push(`Deficiency found: ${check.deficiency || "Not recorded"}`);
          details.push(`Corrective action: ${check.correctiveAction || "Not recorded"}`);
          details.push(`Closeout date: ${check.closeoutDate ? reportDate(check.closeoutDate) : "Not recorded / open"}`);
        }
        return { number: question.number, text: [question.text, ...details].join("\n"), answer: check.answer || "skipped" };
      }), true);
    }
    const summary = quarterlySummary(record);
    report.section("Quarterly closeout summary", ++number);
    report.paragraph(`Deficiencies (NO items): ${summary.count}`);
    report.paragraph(summary.count === 0 ? "No deficiencies recorded." : summary.allClosed ? "All deficiencies have a corrective action and closeout date." : `Still open: checks ${summary.openNumbers.join(", ")}`);
    report.paragraph(`${record.checks.filter(check => check.answer === "n/a").length} marked N/A; ${record.checks.filter(check => !check.answer).length} skipped / unanswered.`);
    section(0); section(1); section(2);
  }
  return report.finish(false);
}
