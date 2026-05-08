/**
 * Node.js PDF generator using PDFKit.
 * Produces a clean, professional inspection report with recommendations page.
 * No cover page.
 */
import PDFDocument from "pdfkit";

// ── Palette ───────────────────────────────────────────────────────────────────
const GREEN       = "#15803d";
const GREEN_DARK  = "#166534";
const GREEN_LIGHT = "#dcfce7";
const RED         = "#dc2626";
const RED_LIGHT   = "#fee2e2";
const AMBER       = "#d97706";
const AMBER_LIGHT = "#fef3c7";
const GRAY_50     = "#f9fafb";
const GRAY_100    = "#f3f4f6";
const GRAY_200    = "#e5e7eb";
const GRAY_400    = "#9ca3af";
const GRAY_600    = "#4b5563";
const GRAY_900    = "#111827";
const WHITE       = "#ffffff";

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

// ── CFR Recommendations ───────────────────────────────────────────────────────
const CFR_RECOMMENDATIONS: Record<number, { cfr: string; recommendation: string }> = {
  1:  { cfr: "40 CFR § 112.8(c)(6)", recommendation: "Immediately remove leaking, cracked, or damaged container from service. Conduct integrity testing per 40 CFR § 112.8(c)(6) before returning to use. Deploy secondary containment or sorbent materials to prevent discharge. Document all repairs and update inspection logs." },
  2:  { cfr: "40 CFR § 112.7(f)(2)", recommendation: "Verify SPCC training records are current for all personnel who could cause or respond to a discharge. Schedule required training within 30 days. Document completion in facility training log per 40 CFR § 112.7(f)(2)." },
  3:  { cfr: "40 CFR § 112.8(c)(4)", recommendation: "Re-label or replace all illegible or inaccurate container markings. Ensure containers are labeled with contents, capacity, and appropriate hazard warnings per 40 CFR § 112.8(c)(4). Document corrective action." },
  4:  { cfr: "40 CFR § 112.8(c)(2)", recommendation: "Immediately remove accumulated oil from secondary containment. Inspect containment for integrity and repair any breaches before returning to service. Investigate source of accumulation and document findings per 40 CFR § 112.8(c)(2)." },
  5:  { cfr: "40 CFR § 112.8(b)(1)", recommendation: "Close and secure all containment drain valves immediately. Inspect drainage system for unauthorized discharges. Document corrective action per 40 CFR § 112.8(b)(1)." },
  6:  { cfr: "40 CFR § 112.8(d)(1)", recommendation: "Immediately isolate and repair all leaking transfer hoses and piping. Inspect for root cause (pressure, corrosion, mechanical failure). Remove from service until repaired and tested per 40 CFR § 112.8(d)(1)." },
  7:  { cfr: "40 CFR § 112.8(d)(2)", recommendation: "Repair or replace damaged transfer connections and fittings. Conduct pressure test before returning to service. Document repairs per 40 CFR § 112.8(d)(2)." },
  8:  { cfr: "40 CFR § 112.8(d)(3)", recommendation: "Repair or replace malfunctioning flow valves. Ensure all valves are labeled and accessible per 40 CFR § 112.8(d)(3). Document corrective action within 30 days." },
  9:  { cfr: "40 CFR § 112.7(a)(3)(vi)", recommendation: "Immediately restock spill response materials (absorbents, pads, booms) to required levels. Ensure materials are accessible in designated locations per facility SPCC Plan. Document restocking within 24 hours." },
  10: { cfr: "40 CFR § 112.7(a)(3)(vi)", recommendation: "Verify spill kit contents against facility inventory list. Replace used or expired materials. Ensure kits are clearly marked and accessible per 40 CFR § 112.7(a)(3)(vi). Document within 30 days." },
  11: { cfr: "40 CFR § 112.7(a)(3)(vi)", recommendation: "Restock all depleted spill response equipment. Investigate the discharge event requiring equipment use and document in spill log. Review response procedures per 40 CFR § 112.7(a)(3)(vi)." },
  12: { cfr: "40 CFR § 112.8(b)(2)", recommendation: "Remove all obstructions from drainage pathways. Verify drainage direction and containment integrity. Schedule regular inspection of drainage system per 40 CFR § 112.8(b)(2)." },
  13: { cfr: "40 CFR § 112.8(b)(3)", recommendation: "Inspect and repair floor drains, catch basins, and oil-water separators. Schedule maintenance service if separation efficiency is compromised. Document per 40 CFR § 112.8(b)(3)." },
  14: { cfr: "40 CFR § 112.8(b)(4)", recommendation: "Immediately investigate source of oil sheen. Contain and clean up discharge. Notify appropriate authorities per 40 CFR § 112.7(a)(4) if discharge reaches navigable waters. Document investigation and response." },
  15: { cfr: "40 CFR § 112.7(e)(8)", recommendation: "Update and organize all inspection records. Ensure the most recent inspection and any corrective actions are filed and accessible for regulatory review per 40 CFR § 112.7(e)(8). Complete within 30 days." },
  16: { cfr: "40 CFR § 112.7(f)(2)", recommendation: "Schedule and complete SPCC training for all required personnel within 30 days. Document training dates, topics covered, and attendees per 40 CFR § 112.7(f)(2). Update training log." },
  17: { cfr: "40 CFR § 112.7(a)(3)(v)", recommendation: "Update all emergency contact lists immediately. Post current contact numbers at required locations throughout the facility. Verify contacts are reachable 24/7 per 40 CFR § 112.7(a)(3)(v)." },
  18: { cfr: "40 CFR § 122.26(b)(14)", recommendation: "Inspect and repair all damaged BMPs (berms, curbing, diversion ditches). Document damage and corrective actions. Update BMP maintenance log per facility SWPPP requirements." },
  19: { cfr: "40 CFR § 122.26(b)(14)(iii)", recommendation: "Repair or replace damaged sediment controls (silt fences, inlet protection). Ensure controls are properly installed and functional before next rain event. Document per facility SWPPP." },
  20: { cfr: "40 CFR § 122.26(b)(14)(iii)", recommendation: "Repair all damaged BMPs within 7 days or before the next storm event, whichever is sooner. Document repairs and update SWPPP corrective action log." },
  21: { cfr: "40 CFR § 122.26(b)(14)(ii)", recommendation: "Relocate all bulk materials away from stormwater drainage paths. Install appropriate controls (berms, covers) to prevent stormwater contact. Document per facility SWPPP." },
  22: { cfr: "40 CFR § 122.26(b)(14)(ii)", recommendation: "Ensure all materials requiring dry storage are stored under cover. Inspect covered storage for integrity. Document corrective action in SWPPP maintenance log." },
  23: { cfr: "40 CFR § 122.26(b)(14)(ii)", recommendation: "Immediately clean up all spills and residue from material storage areas. Prevent stormwater contact with contaminated areas. Document spill and response per SWPPP incident reporting requirements." },
  24: { cfr: "40 CFR § 122.26(b)(14)(iv)", recommendation: "Install or repair roofing or berming around vehicle maintenance areas. Ensure all maintenance activities occur in protected areas. Document per facility SWPPP." },
  25: { cfr: "40 CFR § 122.26(b)(14)(iv)", recommendation: "Inspect and repair vehicle/equipment washdown area containment and drainage. Verify treatment system is functional. Document per facility SWPPP." },
  26: { cfr: "40 CFR § 122.26(b)(14)(iv)", recommendation: "Immediately clean up all spills and staining at fueling areas. Inspect for drainage to stormwater system. Report if discharge has reached stormwater. Document per SWPPP incident log." },
  27: { cfr: "40 CFR § 122.26(b)(14)(v)", recommendation: "Investigate and eliminate illicit discharges at all outfalls immediately. Sample discharge if necessary. Report to regulatory authority if required per 40 CFR § 122.26(b)(14)(v)." },
  28: { cfr: "40 CFR § 122.26(b)(14)(v)", recommendation: "Identify and eliminate source of pollutants at outfall. Sample discharge. Notify state stormwater authority if required. Document investigation and response per SWPPP." },
  29: { cfr: "40 CFR § 122.26(b)(14)(v)", recommendation: "Repair outfall structures (pipes, channels, rip-rap) and address erosion. Inspect regularly per SWPPP monitoring schedule. Document repairs." },
  30: { cfr: "40 CFR § 122.26(b)(14)(x)", recommendation: "Ensure all waste materials are stored in covered containers in designated areas. Conduct housekeeping sweep of entire facility. Document per SWPPP good housekeeping BMP." },
  31: { cfr: "40 CFR § 122.26(b)(14)(x)", recommendation: "Conduct immediate grounds cleanup. Remove all litter and loose materials that could enter stormwater. Implement routine housekeeping schedule per facility SWPPP." },
  32: { cfr: "40 CFR § 122.26(b)(14)(ii)", recommendation: "Re-label all chemical storage areas. Verify secondary containment is in place. Update chemical inventory list per SWPPP requirements." },
  33: { cfr: "40 CFR § 122.26(b)(14)(ix)", recommendation: "Locate SWPPP and make accessible to all employees. Post location notices throughout facility. Ensure SWPPP is current and reflects actual site conditions per 40 CFR § 122.26(b)(14)(ix)." },
  34: { cfr: "40 CFR § 122.26(b)(14)(ix)", recommendation: "Complete all overdue monitoring and sampling. Update records immediately. Establish schedule to prevent future lapses per facility SWPPP monitoring requirements." },
  35: { cfr: "40 CFR § 122.26(b)(14)(ix)", recommendation: "Complete all outstanding corrective actions from previous inspections. Document completion in SWPPP corrective action log. Schedule follow-up inspection to verify effectiveness." },
};

interface Question { id: number; questionText: string; section: string; recommendResponse?: string; }
interface Answer   { questionId: number; answer: string; comments: string; photos: string[]; }
interface PdfData {
  inspectionName?: string;
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

function fmtDate(d: string): string {
  try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

// Draw a filled rounded-rect approximation (PDFKit rects are always square-cornered — use moveTo for rounded)
function roundRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number) {
  doc.moveTo(x + r, y)
    .lineTo(x + w - r, y).quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r).quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h).quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y)
    .closePath();
}

export function generatePDF(data: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER", bufferPages: true, info: { Title: `${data.templateName} — ${data.facility}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);



    // Helper: stamp footer on current page (used before addPage calls)
    const stampFooter = () => {
      doc.moveTo(50, 710).lineTo(562, 710).strokeColor(rgb(GRAY_200)).lineWidth(0.5).stroke();
      doc.fillColor(rgb(GRAY_400)).fontSize(7.5).font("Helvetica")
        .text("Midwest Training and Consulting Services  \u00b7  midwest-training.com",
          50, 716, { width: 512, align: "center", lineBreak: false });
    };

    const answerMap: Record<number, Answer> = {};
    for (const a of data.answers) answerMap[a.questionId] = a;

    // Only include answered questions in the report
    const answeredQs = data.questions.filter(q => answerMap[q.id]?.answer === "yes" || answerMap[q.id]?.answer === "no");
    const noAnswers  = data.questions.filter(q => answerMap[q.id]?.answer === "no");
    const yesCount   = data.answers.filter(a => a.answer === "yes").length;
    const noCount    = data.answers.filter(a => a.answer === "no").length;
    const skippedCount = data.questions.length - answeredQs.length;
    const totalQ     = answeredQs.length; // report only answered questions
    const fDate      = fmtDate(data.date);
    const now        = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const W          = 512; // usable width (margin 50 each side)

    // ─────────────────────────────────────────────────────────────────────────
    // PAGE 1: INSPECTION REPORT
    // ─────────────────────────────────────────────────────────────────────────

    // ── Top header band ──────────────────────────────────────────────────────
    doc.rect(0, 0, 612, 72).fill(rgb(GREEN_DARK));

    // Title
    doc.fillColor(rgb(WHITE))
      .fontSize(17).font("Helvetica-Bold")
      .text("INSPECTION REPORT", 50, 18, { width: 420 });

    // Inspection name subtitle
    if (data.inspectionName) {
      doc.fillColor("rgba(255,255,255,0.85)").fontSize(9).font("Helvetica")
        .text(data.inspectionName, 50, 40, { width: 420 });
    }

    // Date top-right
    doc.fillColor(rgb(WHITE)).fontSize(8.5).font("Helvetica")
      .text(now, 420, 28, { width: 142, align: "right" });

    // ── Facility info card ───────────────────────────────────────────────────
    const cardY = 84;
    doc.rect(50, cardY, W, 62).fill(rgb(GRAY_50)).stroke(rgb(GRAY_200));
    doc.fillColor(rgb(GREEN_DARK)).fontSize(7).font("Helvetica-Bold")
      .text("FACILITY INFORMATION", 62, cardY + 8, { characterSpacing: 0.8 });

    doc.fillColor(rgb(GRAY_900)).fontSize(10).font("Helvetica-Bold")
      .text(data.facility, 62, cardY + 20, { width: 320 });
    doc.fontSize(8.5).font("Helvetica").fillColor(rgb(GRAY_600))
      .text(data.address || "Address not specified", 62, cardY + 34, { width: 320 });

    // Right column: inspector + date
    doc.fillColor(rgb(GRAY_600)).fontSize(7.5).font("Helvetica")
      .text("Inspector", 400, cardY + 20)
      .text("Date", 400, cardY + 38);
    doc.fillColor(rgb(GRAY_900)).fontSize(8.5).font("Helvetica-Bold")
      .text(data.inspector, 450, cardY + 19, { width: 100 })
      .text(fDate, 450, cardY + 37, { width: 100 });

    // Stats row removed per user request
    doc.y = cardY + 72; // position below facility card

    if (false) { // ── Stats row (hidden) ───────────────────────────────────────────────────────
    const statY  = cardY + 74;
    const statW  = 168;
    const statGap = 4;
    const stats = [
      { label: "TOTAL ANSWERED",    value: String(totalQ),   bg: GRAY_100,    border: GRAY_200, val: GRAY_900 },
      { label: "COMPLIANT (YES)",   value: String(yesCount), bg: GREEN_LIGHT, border: GREEN,    val: GREEN_DARK },
      { label: "DEFICIENCIES (NO)", value: String(noCount),  bg: noCount > 0 ? RED_LIGHT : GREEN_LIGHT, border: noCount > 0 ? RED : GREEN, val: noCount > 0 ? RED : GREEN_DARK },
    ];
    stats.forEach((s, i) => {
      const x = 50 + i * (statW + statGap);
      doc.rect(x, statY, statW, 46).fill(rgb(s.bg)).stroke(rgb(s.border));
      doc.fontSize(22).font("Helvetica-Bold").fillColor(rgb(s.val))
        .text(s.value, x, statY + 6, { width: statW, align: "center" });
      doc.fontSize(6.5).font("Helvetica").fillColor(rgb(GRAY_400))
        .text(s.label, x, statY + 32, { width: statW, align: "center", characterSpacing: 0.5 });
    });

    doc.y = statY + 58;
    } // end stats block

    // ── Questions by section (answered only) ────────────────────────────────
    const sections: Record<string, Question[]> = {};
    for (const q of answeredQs) {
      (sections[q.section] = sections[q.section] || []).push(q);
    }

    for (const [section, qs] of Object.entries(sections)) {
      if (doc.y > 680) { stampFooter(); doc.addPage(); }
      doc.moveDown(0.4);

      // Section header — green pill style
      const secY = doc.y;
      doc.rect(50, secY, W, 19).fill(rgb(GREEN_DARK));
      doc.fillColor(rgb(WHITE)).fontSize(8).font("Helvetica-Bold")
        .text(section.toUpperCase(), 60, secY + 5, { width: W - 20, characterSpacing: 0.6 });
      doc.y = secY + 23;

      for (const q of qs) {
        const a = answerMap[q.id] || { answer: "", comments: "", photos: [] };
        const ans = a.answer.toUpperCase();
        if (doc.y > 680) { stampFooter(); doc.addPage(); }

        const rowY = doc.y;
        const rowBg = ans === "NO" ? RED_LIGHT : (ans === "YES" ? WHITE : GRAY_50);

        // Subtle row background for NO answers
        if (ans === "NO") {
          doc.rect(50, rowY - 1, W, 16).fill(rgb(RED_LIGHT)).fillOpacity(0.4);
          doc.fillOpacity(1);
        }

        // Answer pill
        const pillColor = ans === "YES" ? GREEN : ans === "NO" ? RED : GRAY_400;
        roundRect(doc, 50, rowY + 1, 32, 12, 3);
        doc.fill(rgb(pillColor));
        doc.fillColor(rgb(WHITE)).fontSize(7).font("Helvetica-Bold")
          .text(ans || "—", 50, rowY + 3, { width: 32, align: "center" });

        // Question text
        doc.fillColor(rgb(GRAY_900)).fontSize(8.5).font("Helvetica")
          .text(q.questionText, 88, rowY, { width: W - 38 });

        doc.y = Math.max(doc.y, rowY + 14);

        // Comment
        if (a.comments?.trim()) {
          doc.fillColor(rgb(GRAY_600)).fontSize(7.5).font("Helvetica-Oblique")
            .text(`↳ ${a.comments}`, 88, doc.y, { width: W - 38 });
        }

        // Photos — 100x100 squares, up to 4 per row
        if (a.photos && a.photos.length > 0) {
          const SZ = 100;  // square size
          const GAP = 6;
          const PER_ROW = 4;
          doc.y += 6;
          let thumbX = 88;
          let thumbY = doc.y;

          if (thumbY + SZ + 16 > 680) { stampFooter(); doc.addPage(); thumbY = 86; }

          for (let pi = 0; pi < a.photos.length; pi++) {
            try {
              const base64 = a.photos[pi].includes(",") ? a.photos[pi].split(",")[1] : a.photos[pi];
              doc.image(Buffer.from(base64, "base64"), thumbX, thumbY, { fit: [SZ, SZ] });
            } catch { /* skip bad images */ }
            thumbX += SZ + GAP;
            if ((pi + 1) % PER_ROW === 0) {
              thumbX = 88;
              thumbY += SZ + GAP;
              if (thumbY + SZ + 16 > 680) { stampFooter(); doc.addPage(); thumbY = 86; }
            }
          }
          // Move cursor below last row of photos
          const rows = Math.ceil(a.photos.length / PER_ROW);
          doc.y = thumbY + SZ + 10;
        }

        // Separator
        doc.moveTo(50, doc.y).lineTo(562, doc.y)
          .strokeColor(rgb(GRAY_200)).lineWidth(0.4).stroke();
        doc.y += 5;
      }
    }

    // ── General Comments ─────────────────────────────────────────────────────
    if (data.generalComments?.trim()) {
      if (doc.y > 660) { stampFooter(); doc.addPage(); }
      doc.moveDown(0.5);
      const gcY = doc.y;
      doc.rect(50, gcY, W, 19).fill(rgb(GRAY_600));
      doc.fillColor(rgb(WHITE)).fontSize(8).font("Helvetica-Bold")
        .text("GENERAL COMMENTS", 60, gcY + 5, { characterSpacing: 0.6 });
      doc.y = gcY + 25;
      doc.fillColor(rgb(GRAY_900)).fontSize(9).font("Helvetica")
        .text(data.generalComments, 60, doc.y, { width: W - 20 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RECOMMENDATIONS PAGE (only if there are NO answers)
    // ─────────────────────────────────────────────────────────────────────────
    if (noAnswers.length > 0) {
      stampFooter();
      doc.addPage();

      // Header band — red
      doc.rect(0, 0, 612, 72).fill(rgb(RED));
      doc.fillColor(rgb(WHITE))
        .fontSize(17).font("Helvetica-Bold")
        .text("CORRECTIVE ACTION RECOMMENDATIONS", 50, 16, { width: W });
      doc.fontSize(9.5).font("Helvetica")
        .text(`${noAnswers.length} deficienc${noAnswers.length === 1 ? "y" : "ies"} identified  ·  ${fDate}`, 50, 40, { width: W });

      doc.y = 86;

      noAnswers.forEach((q, idx) => {
        if (doc.y > 680) { stampFooter(); doc.addPage(); }

        const startY = doc.y;
        const rec    = CFR_RECOMMENDATIONS[q.id];
        const recText = rec?.recommendation || q.recommendResponse || "Review applicable CFR requirements and implement corrective action.";

        // Number badge
        doc.circle(65, startY + 8, 9).fill(rgb(AMBER));
        doc.fillColor(rgb(WHITE)).fontSize(8).font("Helvetica-Bold")
          .text(String(idx + 1), 57, startY + 4, { width: 16, align: "center" });

        // CFR reference
        if (rec?.cfr) {
          doc.fillColor(rgb(GRAY_400)).fontSize(7.5).font("Helvetica")
            .text(rec.cfr, 82, startY + 2, { width: W - 32 });
        }

        // Finding
        doc.fillColor(rgb(GRAY_900)).fontSize(9).font("Helvetica-Bold")
          .text(q.questionText, 82, startY + (rec?.cfr ? 14 : 4), { width: W - 32 });
        doc.moveDown(0.3);

        // Recommendation
        doc.fillColor(rgb(GRAY_600)).fontSize(8.5).font("Helvetica")
          .text(recText, 82, doc.y, { width: W - 32 });
        doc.moveDown(0.3);

        // Separator
        doc.moveTo(82, doc.y).lineTo(562, doc.y)
          .strokeColor(rgb(GRAY_200)).lineWidth(0.5).stroke();
        doc.y += 8;
      });
    }



    // ── Footer on every page ─────────────────────────────────────────────────
    // MUST read bufferedPageRange BEFORE calling end() or flushPages()
    // flushPages() resets the buffer to empty — do NOT call it first
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.moveTo(50, 710).lineTo(562, 710)
        .strokeColor(rgb(GRAY_200)).lineWidth(0.5).stroke();
      doc.fillColor(rgb(GRAY_400)).fontSize(7.5).font("Helvetica")
        .text(
          "Midwest Training and Consulting Services  \u00b7  midwest-training.com",
          50, 716, { width: 512, align: "center", lineBreak: false }
        );
    }
    // Switch back to last page so end() finalises correctly
    if (range.count > 0) doc.switchToPage(range.start + range.count - 1);

    doc.end();
  });
}
