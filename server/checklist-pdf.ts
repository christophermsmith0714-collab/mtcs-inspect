import { MtcsReport, reportColors } from "./mtcs-pdf";

export interface ChecklistPdfData {
  inspectionName?: string;
  facility: string;
  address?: string;
  inspector: string;
  date: string;
  generalComments?: string;
  questions: { id: number; section: string; questionText: string; recommendResponse?: string }[];
  answers: { questionId: number; answer: string; comments?: string; photos?: string[] }[];
}

interface ChecklistPdfOptions {
  title: string;
  eyebrow?: string;
  draft?: boolean;
  recommendation?: (question: ChecklistPdfData["questions"][number]) => { cfr?: string; recommendation: string };
}

export async function generateChecklistPDF(data: ChecklistPdfData, options: ChecklistPdfOptions): Promise<Buffer> {
  const report = new MtcsReport(data.inspectionName || options.title);
  const byId = new Map(data.answers.map(a => [a.questionId, a]));
  const questions = data.questions.filter(q => ["yes", "no"].includes(byId.get(q.id)?.answer || ""));
  report.header(options.title, options.eyebrow);
  if (data.inspectionName) report.paragraph(data.inspectionName, true);
  report.paragraph(data.facility + (data.address ? " | " + data.address : ""));
  report.paragraph("Inspector: " + data.inspector + "     Inspection date: " + data.date, false, reportColors.muted);
  if (options.draft) report.paragraph("DRAFT - Includes answered items only.", true, reportColors.blue, 8);
  report.y += 5;

  const sections = [...new Set(data.questions.map(q => q.section))];
  for (const [index, section] of sections.entries()) {
    const sectionQuestions = questions.filter(q => q.section === section);
    if (!sectionQuestions.length) continue;
    report.rows(section, index + 1, sectionQuestions.map(q => ({
      text: q.questionText + (byId.get(q.id)?.photos?.length ? "  [Photo attached]" : ""),
      answer: byId.get(q.id)?.answer,
      number: data.questions.indexOf(q) + 1,
    })));
  }

  const notes = questions.filter(q => byId.get(q.id)?.comments?.trim());
  const photos = questions.filter(q => byId.get(q.id)?.photos?.length);
  if (notes.length || data.generalComments?.trim() || photos.length) {
    report.newPage();
    report.paragraph("Inspection Notes & Photos", true, reportColors.blue, 16);
    for (const q of notes) {
      const label = "Item " + (data.questions.indexOf(q) + 1) + ": " + q.questionText;
      report.ensure(Math.min(report.measure(label, report.width, true) + 50, 100));
      report.paragraph(label, true);
      report.paragraph(byId.get(q.id)!.comments!);
    }
    if (data.generalComments?.trim()) {
      report.ensure(55);
      report.paragraph("General comments", true, reportColors.blue);
      report.paragraph(data.generalComments);
    }
    for (const q of photos) {
      for (const [i, photo] of byId.get(q.id)!.photos!.entries()) {
        const caption = "Item " + (data.questions.indexOf(q) + 1) + " - Photo " + (i + 1) + ": " + q.questionText;
        report.ensure(Math.min(report.measure(caption, report.width, true) + 240, report.bottom - 36));
        report.paragraph(caption, true);
        report.ensure(226);
        try {
          const bytes = Buffer.from(photo.includes(",") ? photo.split(",")[1] : photo, "base64");
          report.doc.image(bytes, report.x, report.y, { fit: [report.width, 210] });
          report.y += 226;
        } catch { report.paragraph("Photo could not be rendered. Review the original inspection record."); }
      }
    }
  }

  const noAnswers = questions.filter(q => byId.get(q.id)?.answer === "no");
  if (options.recommendation && noAnswers.length) {
    report.newPage();
    report.paragraph("Corrective Action Recommendations", true, reportColors.blue, 18);
    report.paragraph(noAnswers.length + " item(s) answered NO | " + data.date, false, reportColors.muted);
    for (const q of noAnswers) {
      const rec = options.recommendation(q);
      report.ensure(90);
      report.paragraph("Item " + (data.questions.indexOf(q) + 1) + ": " + q.questionText, true);
      if (rec.cfr) report.paragraph(rec.cfr, false, reportColors.muted, 8);
      report.paragraph(rec.recommendation);
      report.rule(); report.y += 10;
    }
  }
  return report.finish();
}
