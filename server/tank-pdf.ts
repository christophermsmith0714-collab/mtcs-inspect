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
      info: { Title: data.inspectionName || "MTCS Tank Inspection Checklist", Author: "Midwest Training and Consulting Services" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const blue = "#548dd4", navy = "#20355b", muted = "#53657c", pale = "#eef4fc";
    const x = 36, width = 540, textX = 66, textWidth = 422, statusX = 504, bottom = 718;
    const byId = new Map(data.answers.map(a => [a.questionId, a]));
    const complete = tankChecklistComplete(data.questions, data.answers);
    let y = 36;
    const measure = (text: string, textWidth: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      return doc.heightOfString(text, { width: textWidth, lineGap: 1 });
    };
    const newPage = () => { doc.addPage(); y = 36; };
    const ensure = (height: number) => { if (y + height > bottom) newPage(); };
    const paragraph = (text: string, bold = false, color = navy, size = 9) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
      ensure(Math.min(doc.heightOfString(text, { width, lineGap: 2 }) + 7, 55));
      doc.text(text, x, y, { width, lineGap: 2 });
      y = doc.y + 7;
    };

    doc.rect(x, y, width, 3).fill(blue);
    y += 14;
    paragraph("MTCS  /  INTEGRITY REPORT COMPANION", true, muted, 8);
    paragraph("Tank Inspection Checklist", true, blue, 22);
    if (data.inspectionName) paragraph(data.inspectionName, true);
    paragraph(data.facility + (data.address ? " | " + data.address : ""));
    paragraph("Inspector: " + data.inspector + "     Inspection date: " + data.date, false, muted);
    if (!complete) paragraph("DRAFT - Items marked OPEN still need a YES or NO response.", true, blue, 8);
    y += 5;

    const groups: { section: string; questions: TankPdfData["questions"] }[] = [];
    for (const q of data.questions) {
      const last = groups[groups.length - 1];
      if (last?.section === q.section) last.questions.push(q);
      else groups.push({ section: q.section, questions: [q] });
    }
    const rowText = (q: TankPdfData["questions"][number]) => q.questionText + (byId.get(q.id)?.photos?.length ? "  [Photo attached]" : "");
    const rowHeight = (q: TankPdfData["questions"][number]) => Math.max(22, measure(rowText(q), textWidth) + 9);
    const sectionHeading = (name: string, index: number, continued = false) => {
      const title = name + (continued ? " (continued)" : "");
      const height = Math.max(26, measure(title, 410, true) + 11);
      doc.roundedRect(x, y, width, height, 4).fill(pale);
      doc.roundedRect(x, y, 24, height, 4).fill(blue);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("white").text(String(index + 1).padStart(2, "0"), x, y + 8, { width: 24, align: "center" });
      doc.fillColor(navy).text(title, textX, y + 7, { width: 410 });
      doc.fontSize(7).fillColor(muted).text("RESULT", statusX, y + 8, { width: 62, align: "center" });
      y += height + 3;
    };

    for (const [index, group] of groups.entries()) {
      const headerHeight = Math.max(26, measure(group.section, 410, true) + 11) + 3;
      const totalHeight = headerHeight + group.questions.reduce((sum, q) => sum + rowHeight(q), 0);
      ensure(totalHeight <= bottom - 36 ? totalHeight : headerHeight + rowHeight(group.questions[0]));
      sectionHeading(group.section, index);
      for (const q of group.questions) {
        const height = rowHeight(q);
        if (y + height > bottom) { newPage(); sectionHeading(group.section, index, true); }
        const answer = byId.get(q.id)?.answer;
        const label = answer === "yes" ? "YES" : answer === "no" ? "NO" : answer === "n/a" ? "N/A" : "OPEN";
        const color = answer === "yes" ? "#187347" : answer === "no" ? "#b63737" : muted;
        const fill = answer === "yes" ? "#e8f4ed" : answer === "no" ? "#fdecec" : "#f0f3f7";
        const itemNumber = data.questions.indexOf(q) + 1;
        doc.font("Helvetica").fontSize(8).fillColor(muted).text(String(itemNumber).padStart(2, "0"), x + 4, y + 6, { width: 20 });
        doc.fontSize(9).fillColor(navy).text(rowText(q), textX, y + 5, { width: textWidth, lineGap: 1 });
        doc.roundedRect(statusX, y + (height - 16) / 2, 62, 16, 8).fill(fill);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(color).text(label, statusX, y + (height - 16) / 2 + 4, { width: 62, align: "center" });
        doc.moveTo(x, y + height).lineTo(x + width, y + height).strokeColor("#dce5ef").lineWidth(0.4).stroke();
        y += height;
      }
      y += 10;
    }

    const notes = data.questions.filter(q => byId.get(q.id)?.comments?.trim());
    const photos = data.questions.filter(q => byId.get(q.id)?.photos?.length);
    if (notes.length || data.generalComments?.trim() || photos.length) {
      newPage();
      paragraph("Inspection Notes & Photos", true, blue, 16);
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
      doc.moveTo(x, 736).lineTo(x + width, 736).strokeColor(blue).lineWidth(0.8).stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(blue);
      doc.text("Midwest Training and Consulting Services", x, 746, { lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(muted);
      doc.text("13470 S Arapahoe Drive, Suite 130, Olathe, KS 66062 | 913-712-8077", x, 758, { lineBreak: false });
      doc.text("MTCS | " + (i + 1) + " / " + range.count, 510, 746, { lineBreak: false });
    }
    doc.end();
  });
}
