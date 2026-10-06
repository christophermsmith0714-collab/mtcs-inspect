import PDFDocument from "pdfkit";

export const reportColors = {
  blue: "#548dd4", navy: "#20355b", muted: "#53657c", pale: "#eef4fc", line: "#dce5ef",
};

export interface ReportRow { text: string; answer?: string; number?: number; neutral?: boolean }

/** Shared layout for every MTCS checklist and evaluation PDF. */
export class MtcsReport {
  readonly doc: PDFKit.PDFDocument;
  readonly result: Promise<Buffer>;
  readonly x = 36;
  readonly width = 540;
  readonly bottom = 718;
  y = 36;

  constructor(title: string) {
    this.doc = new PDFDocument({
      size: "LETTER", margins: { top: 36, bottom: 74, left: 36, right: 36 }, bufferPages: true,
      info: { Title: title, Author: "Midwest Training and Consulting Services" },
    });
    const chunks: Buffer[] = [];
    this.result = new Promise((resolve, reject) => {
      this.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
    });
  }

  measure(text: string, width = this.width, bold = false, size = 9, lineGap = 1) {
    return this.doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size)
      .heightOfString(text, { width, lineGap });
  }

  newPage() { this.doc.addPage(); this.y = 36; }
  ensure(height: number) { if (this.y + height > this.bottom) this.newPage(); }

  paragraph(text: string, bold = false, color = reportColors.navy, size = 9) {
    this.ensure(Math.min(this.measure(text, this.width, bold, size, 2) + 7, 55));
    this.doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color)
      .text(text, this.x, this.y, { width: this.width, lineGap: 2 });
    this.y = this.doc.y + 7;
  }

  header(title: string, eyebrow = "MTCS  /  INSPECTION REPORT") {
    this.doc.rect(this.x, this.y, this.width, 3).fill(reportColors.blue);
    this.y += 14;
    this.paragraph(eyebrow, true, reportColors.muted, 8);
    this.paragraph(title, true, reportColors.blue, 22);
  }

  sectionHeight(title: string, results = false) {
    return Math.max(26, this.measure(title, results ? 410 : 500, true) + 11) + 3;
  }

  section(title: string, number: number, results = false) {
    const height = this.sectionHeight(title, results) - 3;
    this.ensure(height + 25);
    this.doc.roundedRect(this.x, this.y, this.width, height, 4).fill(reportColors.pale);
    this.doc.roundedRect(this.x, this.y, 24, height, 4).fill(reportColors.blue);
    this.doc.font("Helvetica-Bold").fontSize(9).fillColor("white")
      .text(String(number).padStart(2, "0"), this.x, this.y + 8, { width: 24, align: "center" });
    this.doc.fillColor(reportColors.navy).text(title, 66, this.y + 7, { width: results ? 410 : 500, lineGap: 1 });
    if (results) this.doc.fontSize(7).fillColor(reportColors.muted)
      .text("RESULT", 504, this.y + 8, { width: 62, align: "center" });
    this.y += height + 3;
  }

  private rowHeight(text: string) { return Math.max(22, this.measure(text, 422) + 9); }

  // Split exceptionally long custom questions at a word boundary rather than clipping a page.
  private fittingText(text: string, height: number) {
    if (this.rowHeight(text) <= height) return text;
    let low = 1, high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.rowHeight(text.slice(0, middle)) <= height) low = middle;
      else high = middle - 1;
    }
    const boundary = text.slice(0, low).search(/\s+\S*$/);
    return text.slice(0, boundary > 0 ? boundary : low);
  }

  rows(title: string, number: number, allRows: ReportRow[]) {
    const rows = allRows.filter(row => ["yes", "no", "na", "n/a"].includes(row.answer || ""));
    if (!rows.length) return;
    const heading = this.sectionHeight(title, true);
    const total = heading + rows.reduce((sum, row) => sum + this.rowHeight(row.text), 0);
    this.ensure(total <= this.bottom - 36 ? total : heading + Math.min(this.rowHeight(rows[0]?.text || ""), 80));
    this.section(title, number, true);
    for (const row of rows) {
      let remaining = row.text;
      let continued = false;
      do {
        const height = this.rowHeight(remaining);
        if (this.y + Math.min(height, 80) > this.bottom ||
            (this.y + height > this.bottom && height <= this.bottom - 36 - heading)) {
          this.newPage(); this.section(title + " (continued)", number, true);
        }
        const part = this.fittingText(remaining, this.bottom - this.y);
        const partHeight = this.rowHeight(part);
        if (row.number !== undefined) this.doc.font("Helvetica").fontSize(8).fillColor(reportColors.muted)
          .text(String(row.number).padStart(2, "0"), 40, this.y + 6, { width: 20 });
        this.doc.font("Helvetica").fontSize(9).fillColor(reportColors.navy)
          .text(part, 66, this.y + 5, { width: 422, lineGap: 1 });
        if (!continued) this.badge(row.answer, 504, this.y + (partHeight - 16) / 2, row.neutral);
        this.y += partHeight;
        this.rule();
        remaining = remaining.slice(part.length).trimStart();
        continued = true;
      } while (remaining);
    }
    this.y += 10;
  }

  badge(answer: string | undefined, x: number, y: number, neutral = false) {
    const label = answer === "yes" ? "YES" : answer === "no" ? "NO" : answer === "na" || answer === "n/a" ? "N/A" : "OPEN";
    const color = neutral ? reportColors.navy : answer === "yes" ? "#187347" : answer === "no" ? "#b63737" : reportColors.muted;
    const fill = neutral ? reportColors.pale : answer === "yes" ? "#e8f4ed" : answer === "no" ? "#fdecec" : "#f0f3f7";
    this.doc.roundedRect(x, y, 62, 16, 8).fill(fill);
    this.doc.font("Helvetica-Bold").fontSize(8).fillColor(color)
      .text(label, x, y + 4, { width: 62, align: "center" });
  }

  field(label: string, value?: string) {
    this.ensure(Math.min(this.measure(label, this.width, true) + 40, 100));
    this.paragraph(label, true, reportColors.muted, 8);
    this.paragraph(value?.trim() || "Not recorded");
  }

  rule() {
    this.doc.moveTo(this.x, this.y).lineTo(this.x + this.width, this.y)
      .strokeColor(reportColors.line).lineWidth(0.4).stroke();
  }

  finish() {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      this.doc.moveTo(this.x, 736).lineTo(this.x + this.width, 736).strokeColor(reportColors.blue).lineWidth(0.8).stroke();
      this.doc.font("Helvetica-Bold").fontSize(8).fillColor(reportColors.blue)
        .text("Midwest Training and Consulting Services", this.x, 746, { lineBreak: false });
      this.doc.font("Helvetica").fontSize(7).fillColor(reportColors.muted)
        .text("13470 S Arapahoe Drive, Suite 130, Olathe, KS 66062 | 913-712-8077", this.x, 758, { lineBreak: false })
        .text("MTCS | " + (i + 1) + " / " + range.count, 510, 746, { lineBreak: false });
    }
    this.doc.end();
    return this.result;
  }
}

export function reportDate(value: string) {
  if (!value) return "";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
