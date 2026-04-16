/**
 * Node.js PDF generator using PDFKit — replaces Python/ReportLab.
 * Produces a styled inspection report with cover letter and recommendations.
 */
import PDFDocument from "pdfkit";

// ── Colors ───────────────────────────────────────────────────────────────────
const GREEN = "#15803d";
const GREEN_LIGHT = "#f0fdf4";
const RED = "#dc2626";
const RED_LIGHT = "#fef2f2";
const GRAY = "#6b7280";
const GRAY_LIGHT = "#f9fafb";
const GRAY_MID = "#e5e7eb";
const TEXT = "#111827";
const GOLD = "#b45309";
const GOLD_LIGHT = "#fef3c7";
const BLUE = "#1d4ed8";
const BLUE_LIGHT = "#eff6ff";
const ORANGE = "#c2410c";
const ORANGE_LIGHT = "#fff7ed";

// ── CFR Recommendations ───────────────────────────────────────────────────────
const CFR_RECOMMENDATIONS: Record<number, { cfr: string; severity: string; recommendation: string }> = {
  1: { cfr: "40 CFR § 112.8(c)(6)", severity: "critical", recommendation: "Immediately remove leaking, cracked, or damaged container from service. Conduct integrity testing per 40 CFR § 112.8(c)(6) before returning to use. Deploy secondary containment or sorbent materials to prevent discharge. Document all repairs and update inspection logs." },
  2: { cfr: "40 CFR § 112.7(f)(2)", severity: "standard", recommendation: "Verify SPCC training records are current for all personnel who could cause or respond to a discharge. Schedule required training within 30 days. Document completion in facility training log per 40 CFR § 112.7(f)(2)." },
  3: { cfr: "40 CFR § 112.8(c)(4)", severity: "standard", recommendation: "Re-label or replace all illegible or inaccurate container markings. Ensure containers are labeled with contents, capacity, and appropriate hazard warnings per 40 CFR § 112.8(c)(4). Document corrective action." },
  4: { cfr: "40 CFR § 112.8(c)(2)", severity: "critical", recommendation: "Immediately remove accumulated oil from secondary containment. Inspect containment for integrity and repair any breaches before returning to service. Investigate source of accumulation and document findings per 40 CFR § 112.8(c)(2)." },
  5: { cfr: "40 CFR § 112.8(b)(1)", severity: "critical", recommendation: "Close and secure all containment drain valves immediately. Inspect drainage system for unauthorized discharges. Document corrective action per 40 CFR § 112.8(b)(1)." },
  6: { cfr: "40 CFR § 112.8(d)(1)", severity: "critical", recommendation: "Immediately isolate and repair all leaking transfer hoses and piping. Inspect for root cause (pressure, corrosion, mechanical failure). Remove from service until repaired and tested per 40 CFR § 112.8(d)(1)." },
  7: { cfr: "40 CFR § 112.8(d)(2)", severity: "standard", recommendation: "Repair or replace damaged transfer connections and fittings. Conduct pressure test before returning to service. Document repairs per 40 CFR § 112.8(d)(2)." },
  8: { cfr: "40 CFR § 112.8(d)(3)", severity: "standard", recommendation: "Repair or replace malfunctioning flow valves. Ensure all valves are labeled and accessible per 40 CFR § 112.8(d)(3). Document corrective action within 30 days." },
  9: { cfr: "40 CFR § 112.7(a)(3)(vi)", severity: "critical", recommendation: "Immediately restock spill response materials (absorbents, pads, booms) to required levels. Ensure materials are accessible in designated locations per facility SPCC Plan. Document restocking within 24 hours." },
  10: { cfr: "40 CFR § 112.7(a)(3)(vi)", severity: "standard", recommendation: "Verify spill kit contents against facility inventory list. Replace used or expired materials. Ensure kits are clearly marked and accessible per 40 CFR § 112.7(a)(3)(vi). Document within 30 days." },
  11: { cfr: "40 CFR § 112.7(a)(3)(vi)", severity: "standard", recommendation: "Restock all depleted spill response equipment. Investigate the discharge event requiring equipment use and document in spill log. Review response procedures per 40 CFR § 112.7(a)(3)(vi)." },
  12: { cfr: "40 CFR § 112.8(b)(2)", severity: "standard", recommendation: "Remove all obstructions from drainage pathways. Verify drainage direction and containment integrity. Schedule regular inspection of drainage system per 40 CFR § 112.8(b)(2)." },
  13: { cfr: "40 CFR § 112.8(b)(3)", severity: "standard", recommendation: "Inspect and repair floor drains, catch basins, and oil-water separators. Schedule maintenance service if separation efficiency is compromised. Document per 40 CFR § 112.8(b)(3)." },
  14: { cfr: "40 CFR § 112.8(b)(4)", severity: "critical", recommendation: "Immediately investigate source of oil sheen. Contain and clean up discharge. Notify appropriate authorities per 40 CFR § 112.7(a)(4) if discharge reaches navigable waters. Document investigation and response." },
  15: { cfr: "40 CFR § 112.7(e)(8)", severity: "standard", recommendation: "Update and organize all inspection records. Ensure the most recent inspection and any corrective actions are filed and accessible for regulatory review per 40 CFR § 112.7(e)(8). Complete within 30 days." },
  16: { cfr: "40 CFR § 112.7(f)(2)", severity: "standard", recommendation: "Schedule and complete SPCC training for all required personnel within 30 days. Document training dates, topics covered, and attendees per 40 CFR § 112.7(f)(2). Update training log." },
  17: { cfr: "40 CFR § 112.7(a)(3)(v)", severity: "standard", recommendation: "Update all emergency contact lists immediately. Post current contact numbers at required locations throughout the facility. Verify contacts are reachable 24/7 per 40 CFR § 112.7(a)(3)(v)." },
  18: { cfr: "40 CFR § 122.26(b)(14)", severity: "standard", recommendation: "Inspect and repair all damaged BMPs (berms, curbing, diversion ditches). Document damage and corrective actions. Update BMP maintenance log per facility SWPPP requirements." },
  19: { cfr: "40 CFR § 122.26(b)(14)(iii)", severity: "standard", recommendation: "Repair or replace damaged sediment controls (silt fences, inlet protection). Ensure controls are properly installed and functional before next rain event. Document per facility SWPPP." },
  20: { cfr: "40 CFR § 122.26(b)(14)(iii)", severity: "standard", recommendation: "Repair all damaged BMPs within 7 days or before the next storm event, whichever is sooner. Document repairs and update SWPPP corrective action log." },
  21: { cfr: "40 CFR § 122.26(b)(14)(ii)", severity: "standard", recommendation: "Relocate all bulk materials away from stormwater drainage paths. Install appropriate controls (berms, covers) to prevent stormwater contact. Document per facility SWPPP." },
  22: { cfr: "40 CFR § 122.26(b)(14)(ii)", severity: "standard", recommendation: "Ensure all materials requiring dry storage are stored under cover. Inspect covered storage for integrity. Document corrective action in SWPPP maintenance log." },
  23: { cfr: "40 CFR § 122.26(b)(14)(ii)", severity: "critical", recommendation: "Immediately clean up all spills and residue from material storage areas. Prevent stormwater contact with contaminated areas. Document spill and response per SWPPP incident reporting requirements." },
  24: { cfr: "40 CFR § 122.26(b)(14)(iv)", severity: "standard", recommendation: "Install or repair roofing or berming around vehicle maintenance areas. Ensure all maintenance activities occur in protected areas. Document per facility SWPPP." },
  25: { cfr: "40 CFR § 122.26(b)(14)(iv)", severity: "standard", recommendation: "Inspect and repair vehicle/equipment washdown area containment and drainage. Verify treatment system is functional. Document per facility SWPPP." },
  26: { cfr: "40 CFR § 122.26(b)(14)(iv)", severity: "critical", recommendation: "Immediately clean up all spills and staining at fueling areas. Inspect for drainage to stormwater system. Report if discharge has reached stormwater. Document per SWPPP incident log." },
  27: { cfr: "40 CFR § 122.26(b)(14)(v)", severity: "critical", recommendation: "Investigate and eliminate illicit discharges at all outfalls immediately. Sample discharge if necessary. Report to regulatory authority if required per 40 CFR § 122.26(b)(14)(v)." },
  28: { cfr: "40 CFR § 122.26(b)(14)(v)", severity: "critical", recommendation: "Identify and eliminate source of pollutants at outfall. Sample discharge. Notify state stormwater authority if required. Document investigation and response per SWPPP." },
  29: { cfr: "40 CFR § 122.26(b)(14)(v)", severity: "standard", recommendation: "Repair outfall structures (pipes, channels, rip-rap) and address erosion. Inspect regularly per SWPPP monitoring schedule. Document repairs." },
  30: { cfr: "40 CFR § 122.26(b)(14)(x)", severity: "standard", recommendation: "Ensure all waste materials are stored in covered containers in designated areas. Conduct housekeeping sweep of entire facility. Document per SWPPP good housekeeping BMP." },
  31: { cfr: "40 CFR § 122.26(b)(14)(x)", severity: "standard", recommendation: "Conduct immediate grounds cleanup. Remove all litter and loose materials that could enter stormwater. Implement routine housekeeping schedule per facility SWPPP." },
  32: { cfr: "40 CFR § 122.26(b)(14)(ii)", severity: "standard", recommendation: "Re-label all chemical storage areas. Verify secondary containment is in place. Update chemical inventory list per SWPPP requirements." },
  33: { cfr: "40 CFR § 122.26(b)(14)(ix)", severity: "standard", recommendation: "Locate SWPPP and make accessible to all employees. Post location notices throughout facility. Ensure SWPPP is current and reflects actual site conditions per 40 CFR § 122.26(b)(14)(ix)." },
  34: { cfr: "40 CFR § 122.26(b)(14)(ix)", severity: "standard", recommendation: "Complete all overdue monitoring and sampling. Update records immediately. Establish schedule to prevent future lapses per facility SWPPP monitoring requirements." },
  35: { cfr: "40 CFR § 122.26(b)(14)(ix)", severity: "standard", recommendation: "Complete all outstanding corrective actions from previous inspections. Document completion in SWPPP corrective action log. Schedule follow-up inspection to verify effectiveness." },
};

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function fillColor(doc: PDFKit.PDFDocument, hex: string) {
  doc.fillColor(hexToRgb(hex));
}

function strokeColor(doc: PDFKit.PDFDocument, hex: string) {
  doc.strokeColor(hexToRgb(hex));
}

interface Question { id: number; questionText: string; section: string; }
interface Answer { questionId: number; answer: string; comments: string; photos: string[]; }
interface PdfData {
  facility: string;
  address: string;
  inspector: string;
  date: string;
  generalComments: string;
  templateName: string;
  templateType: string;
  questions: Question[];
  answers: Answer[];
  clientName: string;
  clientEmail: string;
  sendToEmail: string;
  completedAt: string;
  mtcsContact: string;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function generatePDF(data: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const answerMap: Record<number, Answer> = {};
    for (const a of data.answers) answerMap[a.questionId] = a;

    const noAnswers = data.questions.filter(q => {
      const a = answerMap[q.id];
      return a && a.answer === "no";
    });

    const formattedDate = formatDate(data.date);
    const now = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // ── PAGE 1: Cover Letter ──────────────────────────────────────────────────

    // Header bar
    doc.rect(0, 0, 612, 80).fill(hexToRgb(GREEN));
    fillColor(doc, "#ffffff");
    doc.fontSize(20).font("Helvetica-Bold").text("Midwest Training and Consulting Services", 50, 22, { width: 512 });
    doc.fontSize(10).font("Helvetica").text("Environmental Compliance | SPCC & Stormwater Inspection Services", 50, 50, { width: 512 });

    doc.y = 100;
    fillColor(doc, TEXT);

    // Company name, date, inspector block
    doc.fontSize(14).font("Helvetica-Bold").text(data.facility, { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").text(`Date: ${formattedDate}`, { align: "left" });
    doc.fontSize(10).font("Helvetica").text(`Inspector: ${data.inspector}`, { align: "left" });
    doc.moveDown(1);

    // Report description sentence
    const isSPCC = data.templateType === "spcc";
    const cfr = isSPCC ? "40 CFR Part 112" : "40 CFR Part 122 / MSGP";
    const regulation = isSPCC
      ? "Spill Prevention, Control, and Countermeasure (SPCC)"
      : "Municipal Separate Storm Sewer System (MS4) / SWPPP";

    doc.fontSize(10).font("Helvetica").text(
      `This report documents the results of the ${data.templateName} inspection conducted on ${formattedDate}.`,
      { align: "justify" }
    );
    doc.moveDown(1);

    // Salutation
    doc.font("Helvetica").fontSize(10).text("Dear Valued Client,");
    doc.moveDown(0.8);

    // Body
    doc.text(
      `Please find enclosed the completed ${regulation} inspection report for ${data.facility}, conducted on ${formattedDate} by ${data.inspector}. This inspection was performed in accordance with ${cfr} requirements.`,
      { align: "justify" }
    );
    doc.moveDown(0.8);

    const totalQ = data.questions.length;
    const yesCount = data.answers.filter(a => a.answer === "yes").length;
    const noCount = data.answers.filter(a => a.answer === "no").length;
    const naCount = data.answers.filter(a => a.answer === "n/a").length;

    doc.text(
      `The inspection covered ${totalQ} compliance checklist items. Of those, ${yesCount} were found to be in compliance (YES), ${naCount} were not applicable (N/A), and ${noCount} were identified as deficiencies requiring corrective action (NO).`,
      { align: "justify" }
    );
    doc.moveDown(0.8);

    if (noCount > 0) {
      doc.text(
        `A total of ${noCount} deficienc${noCount === 1 ? "y was" : "ies were"} identified during this inspection. Detailed findings and CFR-based corrective action recommendations are included in the attached report. Please review each finding and implement corrective actions within the timeframes specified.`,
        { align: "justify" }
      );
    } else {
      doc.text(
        "No deficiencies were identified during this inspection. The facility was found to be in full compliance with all applicable checklist requirements. Continue current maintenance and inspection practices.",
        { align: "justify" }
      );
    }

    doc.moveDown(0.8);
    doc.text(
      "This report should be retained on-site and made available for regulatory inspection. If you have any questions regarding the findings or recommended corrective actions, please do not hesitate to contact us.",
      { align: "justify" }
    );
    doc.moveDown(1);

    doc.text("Sincerely,");
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Midwest Training and Consulting Services");
    doc.font("Helvetica").text(data.mtcsContact || "info@midwest-training.com");
    doc.text("midwest-training.com");

    // ── PAGE 2+: Inspection Report ────────────────────────────────────────────
    doc.addPage();

    // Header
    doc.rect(0, 0, 612, 60).fill(hexToRgb(GREEN));
    fillColor(doc, "#ffffff");
    doc.fontSize(16).font("Helvetica-Bold").text("INSPECTION REPORT", 50, 15, { width: 512 });
    doc.fontSize(10).font("Helvetica").text(`${data.templateName}  ·  ${formattedDate}`, 50, 38, { width: 512 });

    doc.y = 80;
    fillColor(doc, TEXT);

    // Facility info box
    const infoY = doc.y;
    doc.rect(50, infoY, 512, 55).fill(hexToRgb(GRAY_LIGHT)).stroke(hexToRgb(GRAY_MID));
    fillColor(doc, TEXT);
    doc.fontSize(9).font("Helvetica-Bold").text("FACILITY INFORMATION", 62, infoY + 6);
    doc.font("Helvetica").fontSize(9);
    doc.text(`Facility Name: ${data.facility}`, 62, infoY + 18);
    doc.text(`Address: ${data.address || "N/A"}`, 62, infoY + 30);
    doc.text(`Inspector: ${data.inspector}   |   Inspection Date: ${formattedDate}`, 62, infoY + 42);

    doc.y = infoY + 65;

    // Stats row
    const statY = doc.y;
    const statW = 120;
    const stats = [
      { label: "Total Items", value: String(totalQ), color: GRAY_LIGHT, textColor: TEXT },
      { label: "Compliant (YES)", value: String(yesCount), color: GREEN_LIGHT, textColor: GREEN },
      { label: "Deficiencies (NO)", value: String(noCount), color: noCount > 0 ? RED_LIGHT : GREEN_LIGHT, textColor: noCount > 0 ? RED : GREEN },
      { label: "Not Applicable", value: String(naCount), color: GRAY_LIGHT, textColor: GRAY },
    ];
    stats.forEach((s, i) => {
      const x = 50 + i * (statW + 4);
      doc.rect(x, statY, statW, 40).fill(hexToRgb(s.color)).stroke(hexToRgb(GRAY_MID));
      fillColor(doc, s.textColor);
      doc.fontSize(18).font("Helvetica-Bold").text(s.value, x, statY + 6, { width: statW, align: "center" });
      fillColor(doc, GRAY);
      doc.fontSize(7).font("Helvetica").text(s.label, x, statY + 28, { width: statW, align: "center" });
    });

    doc.y = statY + 50;

    // Group questions by section
    const sections: Record<string, Question[]> = {};
    for (const q of data.questions) {
      if (!sections[q.section]) sections[q.section] = [];
      sections[q.section].push(q);
    }

    for (const [section, questions] of Object.entries(sections)) {
      // Check if we need a new page
      if (doc.y > 680) doc.addPage();

      doc.moveDown(0.5);

      // Section header
      const secY = doc.y;
      doc.rect(50, secY, 512, 18).fill(hexToRgb(GREEN));
      fillColor(doc, "#ffffff");
      doc.fontSize(9).font("Helvetica-Bold").text(section.toUpperCase(), 58, secY + 4, { width: 496 });
      doc.y = secY + 22;

      for (const q of questions) {
        const a = answerMap[q.id] || { answer: "", comments: "", photos: [] };
        const ans = a.answer.toUpperCase();

        // Check space
        if (doc.y > 700) doc.addPage();

        const rowY = doc.y;
        fillColor(doc, TEXT);

        // Answer badge
        const badgeColor = ans === "YES" ? GREEN : ans === "NO" ? RED : GRAY;
        doc.rect(50, rowY, 35, 14).fill(hexToRgb(badgeColor));
        fillColor(doc, "#ffffff");
        doc.fontSize(8).font("Helvetica-Bold").text(ans || "—", 50, rowY + 3, { width: 35, align: "center" });

        // Question text
        fillColor(doc, TEXT);
        doc.fontSize(9).font("Helvetica").text(q.questionText, 92, rowY, { width: 460 });

        doc.y = Math.max(doc.y, rowY + 16);

        // Comments
        if (a.comments && a.comments.trim()) {
          fillColor(doc, GRAY);
          doc.fontSize(8).font("Helvetica-Oblique").text(`Note: ${a.comments}`, 92, doc.y, { width: 460 });
        }

        doc.moveDown(0.3);
      }
    }

    // General comments
    if (data.generalComments && data.generalComments.trim()) {
      if (doc.y > 650) doc.addPage();
      doc.moveDown(0.5);
      const gcY = doc.y;
      doc.rect(50, gcY, 512, 14).fill(hexToRgb(GREEN));
      fillColor(doc, "#ffffff");
      doc.fontSize(9).font("Helvetica-Bold").text("GENERAL COMMENTS", 58, gcY + 2, { width: 496 });
      doc.y = gcY + 18;
      fillColor(doc, TEXT);
      doc.fontSize(9).font("Helvetica").text(data.generalComments, 58, doc.y, { width: 496 });
    }

    // ── Recommendations Page ──────────────────────────────────────────────────
    if (noAnswers.length > 0) {
      doc.addPage();

      doc.rect(0, 0, 612, 60).fill(hexToRgb(RED));
      fillColor(doc, "#ffffff");
      doc.fontSize(16).font("Helvetica-Bold").text("CORRECTIVE ACTION RECOMMENDATIONS", 50, 12, { width: 512 });
      doc.fontSize(10).font("Helvetica").text(`${noAnswers.length} deficiencie${noAnswers.length === 1 ? "" : "s"} requiring attention  ·  ${formattedDate}`, 50, 38, { width: 512 });

      doc.y = 80;

      for (const q of noAnswers) {
        if (doc.y > 680) doc.addPage();

        const rec = CFR_RECOMMENDATIONS[q.id];

        // CFR reference
        if (rec?.cfr) {
          fillColor(doc, GRAY);
          doc.fontSize(7).font("Helvetica").text(rec.cfr, 50, doc.y, { width: 512 });
          doc.moveDown(0.3);
        }

        // Question / Finding
        fillColor(doc, TEXT);
        doc.fontSize(9).font("Helvetica-Bold").text(`Finding: ${q.questionText}`, 50, doc.y, { width: 512 });
        doc.moveDown(0.3);

        // Recommendation text
        fillColor(doc, TEXT);
        doc.fontSize(9).font("Helvetica").text(
          rec?.recommendation || "Review applicable CFR requirements and implement corrective action within 30 days.",
          50, doc.y, { width: 512 }
        );

        doc.moveDown(0.8);
      }
    }

    // Footer on last page
    doc.moveDown(1);
    fillColor(doc, GRAY);
    doc.fontSize(8).font("Helvetica").text(
      `Generated by Midwest Training and Consulting Services  ·  ${now}  ·  midwest-training.com`,
      50, doc.page.height - 40, { width: 512, align: "center" }
    );

    doc.end();
  });
}
