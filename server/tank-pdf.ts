import PDFDocument from "pdfkit";
import { tankChecklistComplete } from "@shared/tank";

export interface TankPdfData {
  inspectionName?: string;
  facility: string;
  address?: string;
  inspector: string;
  date: string;
  generalComments?: string;
  questions: { id: number; section: string; questionText: string; recommendResponse?: string }[];
  answers: { questionId: number; answer: string; comments?: string; photos?: string[] }[];
}

export function generateTankPDF(data: TankPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER", margins: { top: 36, bottom: 66, left: 36, right: 36 }, bufferPages: true,
      info: { Title: data.inspectionName || "Tank Inspection Checklist", Author: "Midwest Training and Consulting Services" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const blue = "#548dd4"; // Sampled from the supplied integrity report.
    const x = 36, width = 540, questionWidth = 464, answerWidth = 38, bottom = 718;
    const byId = new Map(data.answers.map(a => [a.questionId, a]));
    const complete = tankChecklistComplete(data.questions, data.answers);
    let y = 36;
    const plain = (size = 9) => doc.font("Helvetica").fontSize(size).fillColor("black");
    const measure = (text: string, textWidth: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      return doc.heightOfString(text, { width: textWidth, lineGap: 1 });
    };
    const newPage = () => { doc.addPage(); y = 36; };
    const ensure = (height: number) => { if (y + height > bottom) newPage(); };
    // Flow optional notes independently of the table, including multi-page notes.
    const paragraph = (text: string, bold = false, color = "black", size = 9) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
      ensure(Math.min(doc.heightOfString(text, { width, lineGap: 2 }) + 8, 55));
      doc.text(text, x, y, { width, lineGap: 2 });
      y = doc.y + 8;
    };

    doc.font("Times-Bold").fontSize(19).fillColor(blue)
      .text("Tank Inspection Checklist", x, y, { width, align: "center" });
    y = doc.y + 8;
    paragraph(data.inspectionName || data.facility, true);
    if (data.inspectionName) paragraph(data.facility + (data.address ? " | " + data.address : ""));
    else if (data.address) paragraph(data.address);
    paragraph("Inspector: " + data.inspector + "    Date: " + data.date);
    if (!complete) paragraph("DRAFT - Unanswered items have blank YES / NO cells.", false, blue, 8);
    paragraph("Findings:", true, blue, 11);
    y += 2;

    const groups: { section: string; questions: TankPdfData["questions"] }[] = [];
    for (const q of data.questions) {
      const last = groups[groups.length - 1];
      if (last?.section === q.section) last.questions.push(q);
      else groups.push({ section: q.section, questions: [q] });
    }
    const rowText = (q: TankPdfData["questions"][number]) => {
      const a = byId.get(q.id);
      // Preserve a legacy/custom N/A response without treating it as YES or NO.
      return q.questionText + (a?.photos?.length ? "  (See Photo)" : "") + (a?.answer === "n/a" ? "  (N/A)" : "");
    };
    const rowHeight = (q: TankPdfData["questions"][number]) => Math.max(17, measure(rowText(q), questionWidth - 6) + 6);
    const border = (top: number, height: number) => {
      doc.lineWidth(0.65).strokeColor("black").rect(x, top, width, height).stroke();
      for (const cellX of [x + questionWidth, x + questionWidth + answerWidth]) {
        doc.moveTo(cellX, top).lineTo(cellX, top + height).stroke();
      }
    };
    const tableHeader = (name: string) => {
      const height = Math.max(17, measure(name, questionWidth - 6, true) + 6);
      doc.rect(x, y, width, height).fill("#c0c0c0");
      border(y, height);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("black").text(name, x + 3, y + 3, { width: questionWidth - 6 });
      for (const [index, label] of ["YES", "NO"].entries()) {
        doc.text(label, x + questionWidth + index * answerWidth, y + 3, { width: answerWidth, align: "center" });
      }
      y += height;
    };

    for (const [index, group] of groups.entries()) {
      // Match the two-page grouping in the supplied checklist. Edited templates
      // still paginate by their measured row heights and repeat table headers.
      if (index > 0 && group.section === "Tank Manway, Piping & Equipment") newPage();
      const headerHeight = Math.max(17, measure(group.section, questionWidth - 6, true) + 6);
      const totalHeight = headerHeight + group.questions.reduce((sum, q) => sum + rowHeight(q), 0);
      ensure(totalHeight <= bottom - 36 ? totalHeight : headerHeight + rowHeight(group.questions[0]));
      tableHeader(group.section);
      for (const q of group.questions) {
        const height = rowHeight(q);
        if (y + height > bottom) { newPage(); tableHeader(group.section + " (continued)"); }
        const answer = byId.get(q.id)?.answer;
        if (answer === "yes" || answer === "no") {
          const cellX = x + questionWidth + (answer === "no" ? answerWidth : 0);
          doc.rect(cellX, y, answerWidth, height).fill(answer === "yes" ? "#008000" : "#ff0000");
        }
        border(y, height);
        plain().text(rowText(q), x + 3, y + 3, { width: questionWidth - 6, lineGap: 1 });
        y += height;
      }
      y += 16;
    }

    // Only add supporting material when the inspector actually entered it.
    const notes = data.questions.filter(q => byId.get(q.id)?.comments?.trim());
    const photos = data.questions.filter(q => byId.get(q.id)?.photos?.length);
    if (notes.length || data.generalComments?.trim() || photos.length) {
      newPage();
      paragraph("Inspection Notes and Photos", true, blue, 12);
      for (const q of notes) {
        const label = "Item " + (data.questions.indexOf(q) + 1) + ": " + q.questionText;
        ensure(measure(label, width, true) + 50);
        paragraph(label, true);
        paragraph(byId.get(q.id)!.comments!);
      }
      if (data.generalComments?.trim()) { paragraph("General comments", true, blue); paragraph(data.generalComments); }
      for (const q of photos) {
        byId.get(q.id)!.photos!.forEach((photo, i) => {
          const caption = "Item " + (data.questions.indexOf(q) + 1) + " - Photo " + (i + 1) + ": " + q.questionText;
          ensure(measure(caption, width, true) + 240);
          paragraph(caption, true);
          try {
            const bytes = Buffer.from(photo.includes(",") ? photo.split(",")[1] : photo, "base64");
            doc.image(bytes, x, y, { fit: [width, 210] });
            y += 226;
          } catch { paragraph("Photo could not be rendered. Review the original inspection record."); }
        });
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(blue);
      doc.text("Midwest Training and Consulting Services", x, 744, { lineBreak: false });
      doc.text("13470 S Arapahoe Drive, Suite 130, Olathe, KS 66062 - 913-712-8077", x, 755, { lineBreak: false });
      doc.font("Helvetica").fontSize(8).text("Page " + (i + 1) + " of " + range.count, 510, 744, { lineBreak: false });
    }
    doc.end();
  });
}
