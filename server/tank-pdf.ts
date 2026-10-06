import PDFDocument from "pdfkit";
import { tankFields, TANK_SCOPE, tankChecklistComplete, type TankDetails } from "@shared/tank";

export interface TankPdfData {
  inspectionName?: string;
  facility: string;
  address?: string;
  inspector: string;
  date: string;
  generalComments?: string;
  tankDetails?: TankDetails | null;
  questions: { id: number; section: string; questionText: string; recommendResponse?: string }[];
  answers: { questionId: number; answer: string; comments?: string; photos?: string[] }[];
}

export function generateTankPDF(data: TankPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 82, bottom: 62, left: 48, right: 48 }, bufferPages: true,
      info: { Title: `Tank inspection checklist - ${data.tankDetails?.tankId || "Unidentified tank"}`, Author: "Midwest Training and Consulting Services" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const green = "#14532d", ink = "#1f2937", muted = "#64748b";
    const width = 516, bottom = 718;
    const byId = new Map(data.answers.map(a => [a.questionId, a]));
    const complete = tankChecklistComplete(data.questions, data.answers, data.tankDetails);
    let textStyle = { font: "Helvetica", size: 9, color: ink };
    const header = () => {
      doc.rect(0, 0, 612, 64).fill(green);
      doc.fillColor("white").font("Helvetica-Bold").fontSize(17).text("TANK INSPECTION CHECKLIST", 48, 18, { width, lineBreak: false });
      doc.font("Helvetica").fontSize(9).text(`${complete ? "Completed checklist" : "DRAFT - incomplete checklist"}  |  Tank: ${data.tankDetails?.tankId || "Not recorded"}`, 48, 43, { width, height: 12, ellipsis: true });
      // PDFKit can add a page inside a long text block. Restore its style so
      // continued observations do not inherit the white header text.
      doc.font(textStyle.font).fontSize(textStyle.size).fillColor(textStyle.color);
      doc.x = 48; doc.y = 82;
    };
    header();
    doc.on("pageAdded", header);
    const ensure = (height: number) => { if (doc.y + height > bottom) doc.addPage(); };
    const paragraph = (text: string, options: { bold?: boolean; color?: string; size?: number } = {}) => {
      textStyle = { font: options.bold ? "Helvetica-Bold" : "Helvetica", size: options.size ?? 9, color: options.color ?? ink };
      doc.font(textStyle.font).fontSize(textStyle.size).fillColor(textStyle.color);
      const height = doc.heightOfString(text, { width, lineGap: 2 });
      // Keep a few lines together, then let PDFKit flow long observations.
      ensure(Math.min(height + 7, 70));
      doc.text(text, 48, doc.y, { width, lineGap: 2 });
      doc.y += 7;
    };
    const section = (text: string, followingHeight = 85) => {
      doc.font("Helvetica-Bold").fontSize(10);
      const height = doc.heightOfString(text, { width: width - 18 }) + 14;
      ensure(height + 9 + followingHeight);
      const y = doc.y;
      doc.rect(48, y, width, height).fill("#eaf3ed");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(green).text(text, 57, y + 7, { width: width - 18 });
      doc.y = y + height + 9;
    };
    paragraph(data.inspectionName || "Integrity testing report companion", { bold: true, size: 12 });
    paragraph(`${data.facility}${data.address ? " | " + data.address : ""}`, { bold: true });
    paragraph(`Inspector: ${data.inspector}  |  Inspection date: ${data.date}`);
    paragraph(TANK_SCOPE, { color: muted, size: 8 });
    section("Tank identification and report reference");
    for (const [key, label] of tankFields) paragraph(`${label}: ${data.tankDetails?.[key] || "Not recorded"}`);
    paragraph(`Inspection limitations: ${data.tankDetails?.limitations || "Not recorded"}`);

    const count = (answer: string) => data.questions.filter(q => byId.get(q.id)?.answer === answer).length;
    const unanswered = data.questions.filter(q => !["yes", "no", "n/a"].includes(byId.get(q.id)?.answer ?? "")).length;
    section("Response summary");
    paragraph(`YES: ${count("yes")}    NO: ${count("no")}    N/A: ${count("n/a")}    NOT CHECKED: ${unanswered}`, { bold: true });
    paragraph("YES = condition satisfactory / record verified. NO = finding requiring follow-up. N/A = not applicable; explain why. NOT CHECKED = no response recorded.", { color: muted, size: 8 });
    if (!complete) paragraph("Draft: complete tank identification, report reference, all responses, and notes for NO / N/A before finalizing.", { color: "#9a3412" });
    paragraph("Checklist completion records the inspection observations; it is not a suitability-for-service determination.", { color: muted, size: 8 });

    let lastSection = "";
    data.questions.forEach((q, index) => {
      if (q.section !== lastSection) {
        doc.font("Helvetica-Bold").fontSize(9);
        section(q.section, doc.heightOfString(`${index + 1}. [NOT CHECKED] ${q.questionText}`, { width, lineGap: 2 }) + 40);
        lastSection = q.section;
      }
      const answer = byId.get(q.id);
      const label = answer?.answer === "yes" ? "YES" : answer?.answer === "no" ? "NO" : answer?.answer === "n/a" ? "N/A" : "NOT CHECKED";
      doc.font("Helvetica-Bold").fontSize(9);
      ensure(doc.heightOfString(`${index + 1}. [${label}] ${q.questionText}`, { width, lineGap: 2 }) + 40);
      paragraph(`${index + 1}. [${label}] ${q.questionText}`, { bold: true, color: label === "NO" ? "#b91c1c" : ink });
      if (answer?.comments?.trim()) paragraph(`Observation: ${answer.comments}`);
      if (answer?.photos?.length) paragraph(`Photos: see item ${index + 1} in the photo record (${answer.photos.length}).`, { color: muted, size: 8 });
      doc.moveTo(48, doc.y).lineTo(564, doc.y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.y += 9;
    });

    section("Corrective-action log");
    const findings = data.questions.filter(q => byId.get(q.id)?.answer === "no");
    if (!findings.length) paragraph("No NO responses recorded. Review any uninspected items and inspection limitations separately.");
    for (const q of findings) {
      const action = data.tankDetails?.correctiveActions[String(q.id)];
      ensure(115);
      paragraph(`Item ${data.questions.indexOf(q) + 1}: ${q.questionText}`, { bold: true });
      paragraph(`Finding: ${byId.get(q.id)?.comments || "Not recorded"}`);
      if (q.recommendResponse) paragraph(`Suggested follow-up: ${q.recommendResponse}`, { color: muted });
      paragraph(`Action planned / taken: ${action?.action || "Not recorded"}`);
      paragraph(`Responsible person: ${action?.owner || "Unassigned"}  |  Target date: ${action?.dueDate || "Not set"}`);
      paragraph(`Verified complete date: ${action?.completedDate || "Open / not recorded"}`);
    }
    if (data.generalComments?.trim()) { section("General comments"); paragraph(data.generalComments); }
    section("Review and acknowledgement");
    paragraph("Reviewed by: __________________________    Date: __________________");
    paragraph("Signature: _____________________________________________________");

    const photos = data.questions.filter(q => byId.get(q.id)?.photos?.length);
    if (photos.length) { doc.addPage(); section("Photo record"); }
    for (const q of photos) {
      const images = byId.get(q.id)?.photos ?? [];
      images.forEach((photo, i) => {
        const caption = `Item ${data.questions.indexOf(q) + 1} - Photo ${i + 1}: ${q.questionText}`;
        doc.font("Helvetica-Bold").fontSize(9);
        ensure(doc.heightOfString(caption, { width, lineGap: 2 }) + 231);
        paragraph(caption, { bold: true });
        const y = doc.y;
        try {
          const bytes = Buffer.from(photo.includes(",") ? photo.split(",")[1] : photo, "base64");
          doc.image(bytes, 48, y, { fit: [width, 210] });
          doc.y = y + 224;
        } catch {
          paragraph("Photo could not be rendered. Review the original inspection record.", { color: "#b91c1c" });
        }
      });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.moveTo(48, 738).lineTo(564, 738).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(muted).text("Midwest Training and Consulting Services | midwest-training.com", 48, 747, { lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, 490, 747, { lineBreak: false });
    }
    doc.end();
  });
}
