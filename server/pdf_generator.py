#!/usr/bin/env python3
"""
Generate a styled inspection report PDF with cover letter.
Accepts JSON from stdin, writes PDF to stdout as base64.
"""
import sys
import json
import base64
import io
import urllib.request
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

# ─── Colors ────────────────────────────────────────────────────────────────
GREEN       = HexColor("#15803d")
GREEN_LIGHT = HexColor("#f0fdf4")
GREEN_MID   = HexColor("#dcfce7")
RED         = HexColor("#dc2626")
RED_LIGHT   = HexColor("#fef2f2")
GRAY        = HexColor("#6b7280")
GRAY_LIGHT  = HexColor("#f9fafb")
GRAY_MID    = HexColor("#e5e7eb")
TEXT        = HexColor("#111827")
TEXT_MUTED  = HexColor("#6b7280")
GOLD        = HexColor("#b45309")
GOLD_LIGHT  = HexColor("#fef3c7")
BLUE        = HexColor("#1d4ed8")
BLUE_LIGHT  = HexColor("#eff6ff")
ORANGE      = HexColor("#c2410c")
ORANGE_LIGHT= HexColor("#fff7ed")

# ── CFR-based corrective action recommendations ────────────────────────────
# severity: "critical" (24-48 hrs) or "standard" (30 days)
CFR_RECOMMENDATIONS = {
    # ── SPCC (Template 1) ─────────────────────────────────────────────────
    1: {
        "cfr": "40 CFR § 112.8(c)(6)",
        "severity": "critical",
        "recommendation": (
            "Immediately remove leaking, cracked, or damaged container from service. "
            "Conduct integrity testing per 40 CFR § 112.8(c)(6) before returning to use. "
            "Deploy secondary containment or sorbent materials to prevent discharge. "
            "Document all repairs and update the SPCC Plan within 6 months per § 112.5."
        ),
    },
    2: {
        "cfr": "40 CFR § 112.8(c)(8)",
        "severity": "standard",
        "recommendation": (
            "Investigate cause of abnormal tank levels (overfill, underfill, or leak). "
            "Verify high-level alarms or gauges are operational per § 112.8(c)(8). "
            "Calibrate level-sensing devices and establish a monitoring schedule. "
            "Ensure overfill prevention equipment is tested annually."
        ),
    },
    3: {
        "cfr": "40 CFR § 112.7(e); 49 CFR § 172 (DOT labeling)",
        "severity": "standard",
        "recommendation": (
            "Replace or repair all illegible/inaccurate container labels immediately. "
            "Labels must identify contents, capacity, and hazards per DOT 49 CFR § 172 "
            "and SPCC Plan documentation requirements under § 112.7(e). "
            "Include labeling verification in routine inspection checklists."
        ),
    },
    4: {
        "cfr": "40 CFR § 112.8(c)(2)",
        "severity": "critical",
        "recommendation": (
            "Repair secondary containment to restore capacity for the largest single container "
            "plus sufficient freeboard for precipitation per § 112.8(c)(2). "
            "Remove any accumulated oil — do not discharge contaminated water. "
            "Verify containment area impermeability and repair cracks, joints, or seams."
        ),
    },
    5: {
        "cfr": "40 CFR § 112.8(c)(3)(i)",
        "severity": "critical",
        "recommendation": (
            "Close and seal all containment drain valves immediately per § 112.8(c)(3)(i). "
            "Drain valves must remain sealed at all times except during supervised drainage "
            "of visually inspected, uncontaminated rainwater. "
            "Replace any flapper-type valves with manual open-and-closed design per § 112.8(b)(2)."
        ),
    },
    6: {
        "cfr": "40 CFR § 112.8(d)(4)",
        "severity": "critical",
        "recommendation": (
            "Shut down leaking transfer line and repair immediately to prevent discharge. "
            "Per § 112.8(d)(4), regularly inspect all aboveground valves and piping — "
            "assess flange joints, expansion joints, valve glands, pipe supports, and metal surfaces. "
            "Conduct leak testing on buried piping per the same section."
        ),
    },
    7: {
        "cfr": "40 CFR § 112.8(d)(4)",
        "severity": "standard",
        "recommendation": (
            "Replace or repair worn transfer connections and fittings. "
            "Per § 112.8(d)(4), inspect condition of flange joints, expansion joints, "
            "valve glands and bodies, catch pans, and locking mechanisms. "
            "Implement preventive maintenance schedule to prevent future degradation."
        ),
    },
    8: {
        "cfr": "40 CFR § 112.8(d)(4)",
        "severity": "standard",
        "recommendation": (
            "Repair or replace malfunctioning flow valves and ensure proper labeling. "
            "Per § 112.8(d)(4), all valves must be regularly inspected and in working condition. "
            "Verify valve locking mechanisms to prevent unauthorized operation. "
            "Update valve labels to clearly indicate function and normal position."
        ),
    },
    9: {
        "cfr": "40 CFR § 112.7(c)(1)(vii)",
        "severity": "critical",
        "recommendation": (
            "Restock spill response materials (absorbents, pads, booms) immediately. "
            "Per § 112.7(c)(1)(vii), adequate sorbent materials must be readily available. "
            "Ensure spill kits are sized for worst-case discharge volume. "
            "The SPCC Plan must include a written commitment of materials required per § 112.7(d)(2)."
        ),
    },
    10: {
        "cfr": "40 CFR § 112.7(c)(1)(vii); § 112.7(d)",
        "severity": "standard",
        "recommendation": (
            "Relocate spill kits to designated, clearly marked locations per SPCC Plan layout. "
            "Ensure signage is visible and legible. Per § 112.7(d), the facility must have "
            "written procedures for spill response that identify kit locations. "
            "Include kit locations on facility maps posted in the SPCC Plan."
        ),
    },
    11: {
        "cfr": "40 CFR § 112.7(c)(1)(vii); § 112.7(d)(2)",
        "severity": "critical",
        "recommendation": (
            "Restock all used spill response equipment within 24 hours. "
            "Per § 112.7(d)(2), the facility must maintain a written commitment of materials "
            "required to expeditiously control and remove any discharge. "
            "Document the depletion event and restocking in inspection records per § 112.7(e)."
        ),
    },
    12: {
        "cfr": "40 CFR § 112.8(b)(3)-(4)",
        "severity": "standard",
        "recommendation": (
            "Clear all obstructed drainage pathways to prevent uncontrolled accumulation. "
            "Per § 112.8(b)(3), drainage from undiked areas must flow into catchment basins "
            "designed to retain oil. Per § 112.8(b)(4), final discharge ditches must be equipped "
            "with diversion systems capable of retaining oil in the event of an uncontrolled discharge."
        ),
    },
    13: {
        "cfr": "40 CFR § 112.8(b)(1)-(5)",
        "severity": "standard",
        "recommendation": (
            "Service and repair malfunctioning floor drains, catch basins, and oil-water separators. "
            "Per § 112.8(b), facility drainage must be engineered to prevent discharge. "
            "If treatment is continuous across multiple units, ensure redundant lift pumps "
            "are installed per § 112.8(b)(5). Document maintenance in SPCC records."
        ),
    },
    14: {
        "cfr": "40 CFR § 112.1(b); § 112.8(c)(3)(ii)-(iv)",
        "severity": "critical",
        "recommendation": (
            "Investigate source of oil sheening immediately — this may constitute a reportable "
            "discharge under § 112.1(b) and CWA § 311. Contain and clean up visible sheen. "
            "Per § 112.8(c)(3)(ii)-(iv), do not drain contaminated water until oil is removed. "
            "Notify facility SPCC coordinator and evaluate need for regulatory reporting."
        ),
    },
    15: {
        "cfr": "40 CFR § 112.7(e)",
        "severity": "standard",
        "recommendation": (
            "Update all inspection records immediately. Per § 112.7(e), inspection and test records "
            "signed by the appropriate supervisor must be kept with the SPCC Plan for a minimum "
            "of three years. Develop written inspection procedures if not already in place. "
            "Backdate and complete any missed inspection forms."
        ),
    },
    16: {
        "cfr": "40 CFR § 112.7(f)",
        "severity": "standard",
        "recommendation": (
            "Schedule and complete SPCC training for all required personnel within 30 days. "
            "Per § 112.7(f), training must address operation and maintenance procedures, "
            "applicable pollution control laws, and spill response procedures. "
            "Conduct annual refresher training and document attendance and topics per § 112.7(e)."
        ),
    },
    17: {
        "cfr": "40 CFR § 112.7(a)(3)(iv); § 112.7(d)",
        "severity": "critical",
        "recommendation": (
            "Post current emergency contact numbers at all oil-handling locations immediately. "
            "Per § 112.7(a)(3)(iv), the SPCC Plan must include the phone number for the "
            "National Response Center (1-800-424-8802), EPA region, and state agency. "
            "Per § 112.7(d), emergency procedures must be readily accessible to facility personnel."
        ),
    },
    # ── Stormwater (Template 2) ───────────────────────────────────────────
    18: {
        "cfr": "2021 MSGP Part 2.1.1; CWA § 402(p)",
        "severity": "standard",
        "recommendation": (
            "Repair or replace damaged structural BMPs (berms, curbing, diversion ditches) "
            "within 14 days per MSGP Part 5.1 corrective action requirements. "
            "Document the deficiency in the SWPPP and describe repairs made. "
            "Verify the repaired BMP restores effective stormwater diversion."
        ),
    },
    19: {
        "cfr": "2021 MSGP Part 2.1.1; Part 5.1",
        "severity": "critical",
        "recommendation": (
            "Repair or replace failed sediment controls (silt fences, inlet protection) immediately. "
            "Non-functional sediment controls allow direct pollutant discharge in violation of "
            "MSGP Part 2.1.1. Per Part 5.1, corrective action must be initiated within 14 days. "
            "Update the SWPPP to document the failure and corrective action taken."
        ),
    },
    20: {
        "cfr": "2021 MSGP Part 5.1; Part 3.1",
        "severity": "standard",
        "recommendation": (
            "Repair damaged BMPs within 14 days per MSGP Part 5.1 corrective action timeline. "
            "Evaluate whether additional or upgraded BMPs are needed per Part 3.1. "
            "Document the damage, root cause analysis, and repair in the SWPPP. "
            "Consider weather-resilient designs to prevent recurring damage."
        ),
    },
    21: {
        "cfr": "2021 MSGP Part 2.1.2 (Good Housekeeping); Part 3.2",
        "severity": "standard",
        "recommendation": (
            "Relocate bulk materials away from stormwater drainage paths immediately. "
            "Per MSGP Part 2.1.2, materials with potential for stormwater exposure must "
            "be stored in designated areas with proper containment. "
            "Install berms or diversion structures to protect drainage pathways if relocation is not feasible."
        ),
    },
    22: {
        "cfr": "2021 MSGP Part 2.1.2; Part 8 (Sector-specific)",
        "severity": "standard",
        "recommendation": (
            "Provide covered storage (roofing, tarps, or enclosed structures) for materials "
            "that must remain dry per MSGP Part 2.1.2 good housekeeping requirements. "
            "If 'no exposure' certification is sought under § 122.26(g), all industrial "
            "materials must be sheltered from stormwater contact."
        ),
    },
    23: {
        "cfr": "2021 MSGP Part 2.1.2; Part 5.1",
        "severity": "critical",
        "recommendation": (
            "Clean up spills or residue in material storage areas immediately to prevent "
            "stormwater contamination. Per MSGP Part 2.1.2, good housekeeping requires "
            "prompt cleanup of spills and leaks. Document cleanup actions in the SWPPP "
            "and evaluate whether existing containment is adequate."
        ),
    },
    24: {
        "cfr": "2021 MSGP Part 2.1.1; Part 8 (Sector-specific)",
        "severity": "standard",
        "recommendation": (
            "Install roofing, berms, or other protection over vehicle maintenance areas "
            "to prevent stormwater contact with oils, fluids, and parts. "
            "Per MSGP Part 2.1.1, all control measures must minimize pollutant exposure. "
            "Consider installing an oil-water separator for any drainage from the area."
        ),
    },
    25: {
        "cfr": "2021 MSGP Part 2.1.3; 40 CFR § 122.26",
        "severity": "standard",
        "recommendation": (
            "Repair or install proper containment and treatment for the washdown area. "
            "Washwater is an industrial discharge and must not enter the stormwater system "
            "without treatment per 40 CFR § 122.26. Route washwater to a sanitary sewer "
            "(with pretreatment authority approval) or a permitted treatment system."
        ),
    },
    26: {
        "cfr": "2021 MSGP Part 2.1.2; 40 CFR § 112.7(c)",
        "severity": "critical",
        "recommendation": (
            "Clean up fueling area spills immediately to prevent stormwater contamination. "
            "Per MSGP Part 2.1.2, fueling areas must be kept clean and free of spills. "
            "If fuel storage exceeds 1,320 gallons aggregate, SPCC Plan requirements under "
            "40 CFR § 112.7(c) also apply. Install drip pans and absorbent pads at fueling points."
        ),
    },
    27: {
        "cfr": "2021 MSGP Part 3.3; CWA § 402(p)",
        "severity": "critical",
        "recommendation": (
            "Investigate and eliminate any illicit discharges at outfalls immediately. "
            "Illicit discharges violate CWA § 402(p) and MSGP Part 3.3. "
            "Trace the discharge source using dye testing or visual tracking. "
            "Report to the permitting authority if the source cannot be immediately controlled."
        ),
    },
    28: {
        "cfr": "2021 MSGP Part 3.2; Part 5.1",
        "severity": "critical",
        "recommendation": (
            "Identify and eliminate the source of pollutants (oil sheen, discoloration, foam, odor) "
            "at outfalls immediately. Per MSGP Part 3.2, visual monitoring must confirm "
            "no evidence of stormwater pollution. Per Part 5.1, initiate corrective action "
            "within 14 days, including SWPPP revisions and additional control measures."
        ),
    },
    29: {
        "cfr": "2021 MSGP Part 2.1.1; Part 5.1",
        "severity": "standard",
        "recommendation": (
            "Repair damaged outfall structures (pipes, channels, rip-rap) and address erosion. "
            "Per MSGP Part 2.1.1, stormwater control measures must be maintained in "
            "effective operating condition. Stabilize eroded areas with rip-rap, vegetation, "
            "or erosion blankets. Document repairs in the SWPPP."
        ),
    },
    30: {
        "cfr": "2021 MSGP Part 2.1.2 (Good Housekeeping)",
        "severity": "standard",
        "recommendation": (
            "Store all waste materials in covered, leak-proof containers in designated areas. "
            "Per MSGP Part 2.1.2, good housekeeping practices require proper waste containment "
            "to prevent stormwater exposure. Ensure dumpsters and waste bins have lids closed. "
            "Schedule regular waste pickup to prevent overflow."
        ),
    },
    31: {
        "cfr": "2021 MSGP Part 2.1.2 (Good Housekeeping)",
        "severity": "standard",
        "recommendation": (
            "Clean up litter and loose materials from facility grounds that could enter "
            "stormwater runoff. Per MSGP Part 2.1.2, good housekeeping requires regular "
            "cleanup and proper disposal of debris. Implement a weekly grounds cleanup "
            "schedule and document in the SWPPP maintenance log."
        ),
    },
    32: {
        "cfr": "2021 MSGP Part 2.1.2; OSHA 29 CFR § 1910.1200 (HazCom)",
        "severity": "standard",
        "recommendation": (
            "Label all chemical storage areas clearly with contents and hazards per MSGP "
            "Part 2.1.2 and OSHA HazCom 29 CFR § 1910.1200. Organize storage areas so "
            "incompatible chemicals are separated. Ensure SDS sheets are accessible on-site. "
            "Verify secondary containment is adequate for stored volumes."
        ),
    },
    33: {
        "cfr": "2021 MSGP Part 5.2; 40 CFR § 122.26",
        "severity": "standard",
        "recommendation": (
            "Make the current SWPPP available on-site and accessible to all employees immediately. "
            "Per MSGP Part 5.2, the SWPPP must be retained on-site or readily available "
            "upon request. Under the 2021 MSGP, the SWPPP must also be made publicly available. "
            "Ensure all employees know the location and key contents of the SWPPP."
        ),
    },
    34: {
        "cfr": "2021 MSGP Part 4.1; Part 5.1",
        "severity": "standard",
        "recommendation": (
            "Complete all outstanding monitoring and sampling records per MSGP Part 4.1. "
            "This includes quarterly visual assessments, benchmark monitoring, and any "
            "sector-specific sampling requirements. Late or missing records may trigger "
            "Tier 2 or Tier 3 corrective action escalation under Part 5.1."
        ),
    },
    35: {
        "cfr": "2021 MSGP Part 5.1 (Corrective Action)",
        "severity": "critical",
        "recommendation": (
            "Complete all outstanding corrective actions from previous inspections within 14 days "
            "per MSGP Part 5.1. Failure to complete prior corrective actions constitutes a "
            "permit violation. Review the SWPPP corrective action log, prioritize by risk, "
            "and document completion with dates, photos, and responsible party."
        ),
    },
}

# ─── Fonts ─────────────────────────────────────────────────────────────────
FONT_DIR = Path("/tmp/fonts")
FONT_DIR.mkdir(exist_ok=True)

def download_font(name, url):
    path = FONT_DIR / name
    if not path.exists():
        try:
            urllib.request.urlretrieve(url, path)
        except Exception:
            return False
    return True

# DM Sans
reg_ok = download_font("DMSans-Regular.ttf",
    "https://github.com/googlefonts/dm-fonts/raw/main/Sans/fonts/ttf/DMSans-Regular.ttf")
bold_ok = download_font("DMSans-Bold.ttf",
    "https://github.com/googlefonts/dm-fonts/raw/main/Sans/fonts/ttf/DMSans-Bold.ttf")

if reg_ok and bold_ok:
    pdfmetrics.registerFont(TTFont("DMSans", str(FONT_DIR / "DMSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("DMSans-Bold", str(FONT_DIR / "DMSans-Bold.ttf")))
    FONT_BODY = "DMSans"
    FONT_BOLD = "DMSans-Bold"
else:
    FONT_BODY = "Helvetica"
    FONT_BOLD = "Helvetica-Bold"

# ─── Styles ────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def make_style(name, **kwargs):
    return ParagraphStyle(name, **kwargs)

S = {
    "h1": make_style("H1", fontName=FONT_BOLD, fontSize=20, leading=26, textColor=TEXT, spaceAfter=4),
    "h2": make_style("H2", fontName=FONT_BOLD, fontSize=13, leading=18, textColor=TEXT, spaceBefore=14, spaceAfter=4),
    "h3": make_style("H3", fontName=FONT_BOLD, fontSize=10, leading=14, textColor=TEXT_MUTED, spaceBefore=10, spaceAfter=4),
    "body": make_style("Body", fontName=FONT_BODY, fontSize=10, leading=15, textColor=TEXT, spaceAfter=6),
    "small": make_style("Small", fontName=FONT_BODY, fontSize=8.5, leading=12, textColor=TEXT_MUTED),
    "label": make_style("Label", fontName=FONT_BOLD, fontSize=8, leading=11, textColor=TEXT_MUTED),
    "value": make_style("Value", fontName=FONT_BOLD, fontSize=10, leading=14, textColor=TEXT),
    "qtext": make_style("QText", fontName=FONT_BODY, fontSize=9.5, leading=14, textColor=TEXT),
    "comment": make_style("Comment", fontName=FONT_BODY, fontSize=9, leading=13, textColor=GRAY, leftIndent=8),
    "cover_title": make_style("CoverTitle", fontName=FONT_BOLD, fontSize=28, leading=34, textColor=white),
    "cover_sub":   make_style("CoverSub",   fontName=FONT_BODY, fontSize=12, leading=18, textColor=HexColor("#bbf7d0")),
    "cover_body":  make_style("CoverBody",  fontName=FONT_BODY, fontSize=11, leading=17, textColor=HexColor("#d1fae5")),
    "footer": make_style("Footer", fontName=FONT_BODY, fontSize=7.5, leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER),
}

# ─── Page template with header/footer ──────────────────────────────────────
PAGE_W, PAGE_H = letter
MARGIN = 0.75 * inch

def make_header_footer(facility, inspection_date, page_label=""):
    def draw(canvas, doc):
        canvas.saveState()
        # Top bar
        canvas.setFillColor(GREEN)
        canvas.rect(0, PAGE_H - 0.45*inch, PAGE_W, 0.45*inch, fill=1, stroke=0)
        canvas.setFont(FONT_BOLD, 8.5)
        canvas.setFillColor(white)
        canvas.drawString(MARGIN, PAGE_H - 0.28*inch, facility.upper())
        canvas.setFont(FONT_BODY, 8)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.28*inch, inspection_date)
        # Bottom bar
        canvas.setFillColor(GRAY_MID)
        canvas.rect(0, 0, PAGE_W, 0.35*inch, fill=1, stroke=0)
        canvas.setFont(FONT_BODY, 7.5)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawString(MARGIN, 0.12*inch, "Midwest Training and Consulting Services · midwest-training.com")
        canvas.drawRightString(PAGE_W - MARGIN, 0.12*inch, f"Page {doc.page}")
        canvas.restoreState()
    return draw

# ─── Answer badge ──────────────────────────────────────────────────────────
def answer_badge(ans):
    if ans == "yes":
        return ('<font color="#15803d"><b> YES </b></font>', GREEN_LIGHT, GREEN)
    elif ans == "no":
        return ('<font color="#dc2626"><b> NO  </b></font>', RED_LIGHT, RED)
    elif ans == "n/a":
        return ('<font color="#6b7280"><b> N/A </b></font>', GRAY_LIGHT, GRAY_MID)
    return ('<font color="#9ca3af">  —  </font>', white, GRAY_MID)

# ─── Main generator ────────────────────────────────────────────────────────
def generate_pdf(data: dict) -> bytes:
    buf = io.BytesIO()

    facility        = data.get("facility", "Unknown Facility")
    address         = data.get("address", "")
    inspector       = data.get("inspector", "")
    insp_date_raw   = data.get("date", "")
    general_comments= data.get("generalComments", "")
    template_name   = data.get("templateName", "Inspection Report")
    template_type   = data.get("templateType", "spcc")
    questions       = data.get("questions", [])
    answers_raw     = data.get("answers", [])  # [{questionId, answer, comments, photos}]
    client_name     = data.get("clientName", "")
    client_email    = data.get("clientEmail", "")
    send_to_email   = data.get("sendToEmail", "")
    completed_at    = data.get("completedAt", "")
    mtcs_contact    = data.get("mtcsContact", "info@midwest-training.com")

    # Format dates
    try:
        insp_date_fmt = datetime.strptime(insp_date_raw, "%Y-%m-%d").strftime("%B %d, %Y")
    except Exception:
        insp_date_fmt = insp_date_raw
    try:
        completed_fmt = datetime.fromisoformat(completed_at.replace("Z","")).strftime("%B %d, %Y")
    except Exception:
        completed_fmt = datetime.now().strftime("%B %d, %Y")

    reg_label = "40 CFR Part 112" if template_type == "spcc" else "MSGP / SWPPP"

    answer_map = {a["questionId"]: a for a in answers_raw}
    yes_count = sum(1 for a in answers_raw if a.get("answer") == "yes")
    no_count  = sum(1 for a in answers_raw if a.get("answer") == "no")
    na_count  = sum(1 for a in answers_raw if a.get("answer") == "n/a")
    total     = len(questions)

    sections = []
    seen = set()
    for q in questions:
        s = q.get("section", "")
        if s not in seen:
            sections.append(s)
            seen.add(s)

    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        title=f"{template_name} — {facility}",
        author="Perplexity Computer",
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=0.65*inch, bottomMargin=0.55*inch,
    )

    hf = make_header_footer(facility, insp_date_fmt)
    story = []

    # ══════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════
    # Full-page green background using a table trick
    cover_content = [
        Spacer(1, 0.6*inch),
        Paragraph(template_name.upper(), S["label"]),  # will be overridden below
        Spacer(1, 0.1*inch),
        Paragraph(facility, S["cover_title"]),
    ]
    if address:
        cover_content.append(Paragraph(address, S["cover_sub"]))
    cover_content += [
        Spacer(1, 0.5*inch),
        HRFlowable(width="100%", thickness=1, color=HexColor("#86efac"), spaceAfter=20),
    ]

    # Meta table on cover
    cover_meta = [
        ["Inspection Date", insp_date_fmt],
        ["Completed",       completed_fmt],
        ["Inspector",       inspector],
        ["Regulation",      reg_label],
        ["Prepared for",    f"{client_name}" + (f" · {client_email}" if client_email else "")],
    ]
    if send_to_email:
        cover_meta.append(["Report sent to", send_to_email])

    meta_label_style = ParagraphStyle("ML", fontName=FONT_BOLD, fontSize=9, textColor=HexColor("#86efac"))
    meta_value_style = ParagraphStyle("MV", fontName=FONT_BODY, fontSize=10, textColor=white)

    meta_table_data = [[
        Paragraph(row[0], meta_label_style),
        Paragraph(row[1], meta_value_style)
    ] for row in cover_meta]

    meta_t = Table(meta_table_data, colWidths=[1.6*inch, 4.5*inch])
    meta_t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, HexColor("#166534")),
    ]))

    # Full-page green cover using a canvas callback
    def cover_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(GREEN)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Decorative bar
        canvas.setFillColor(HexColor("#166534"))
        canvas.rect(0, 0, PAGE_W, 1.2*inch, fill=1, stroke=0)
        # MTCS footer on cover
        canvas.setFont(FONT_BODY, 8)
        canvas.setFillColor(HexColor("#86efac"))
        canvas.drawCentredString(PAGE_W/2, 0.45*inch, "Midwest Training and Consulting Services  ·  midwest-training.com")
        canvas.drawCentredString(PAGE_W/2, 0.28*inch, f"Contact: {mtcs_contact}")
        # Top accent
        canvas.setFillColor(HexColor("#166534"))
        canvas.rect(0, PAGE_H - 0.5*inch, PAGE_W, 0.5*inch, fill=1, stroke=0)
        canvas.setFont(FONT_BOLD, 9)
        canvas.setFillColor(HexColor("#86efac"))
        canvas.drawString(MARGIN, PAGE_H - 0.3*inch, "INSPECTPRO · COMPLIANCE REPORT")
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.3*inch, completed_fmt)
        canvas.restoreState()

    story.append(Spacer(1, 0.8*inch))
    story.append(Paragraph(
        f'<font color="#86efac"><b>{reg_label.upper()} · MONTHLY INSPECTION</b></font>',
        ParagraphStyle("CoverTag", fontName=FONT_BOLD, fontSize=9, leading=12)
    ))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(facility, S["cover_title"]))
    if address:
        story.append(Paragraph(address, S["cover_sub"]))
    story.append(Spacer(1, 0.4*inch))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#86efac"), spaceAfter=16))
    story.append(meta_t)
    story.append(Spacer(1, 0.5*inch))

    # Summary boxes on cover
    summary_data = [[
        Paragraph(f'<font color="#15803d"><b>{yes_count}</b></font>\n<font color="#166534" size="8">YES</font>', ParagraphStyle("SY", fontName=FONT_BOLD, fontSize=22, leading=28, alignment=TA_CENTER)),
        Paragraph(f'<font color="#dc2626"><b>{no_count}</b></font>\n<font size="8">NO</font>', ParagraphStyle("SN", fontName=FONT_BOLD, fontSize=22, leading=28, alignment=TA_CENTER)),
        Paragraph(f'<font color="#6b7280"><b>{na_count}</b></font>\n<font size="8">N/A</font>', ParagraphStyle("SNA", fontName=FONT_BOLD, fontSize=22, leading=28, alignment=TA_CENTER, textColor=GRAY)),
        Paragraph(f'<font color="#1e3a5f"><b>{total}</b></font>\n<font size="8">TOTAL</font>', ParagraphStyle("ST", fontName=FONT_BOLD, fontSize=22, leading=28, alignment=TA_CENTER)),
    ]]

    sum_t = Table(summary_data, colWidths=[1.5*inch]*4)
    sum_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), HexColor("#f0fdf4")),
        ("BACKGROUND", (1,0), (1,0), HexColor("#fef2f2")),
        ("BACKGROUND", (2,0), (2,0), HexColor("#f9fafb")),
        ("BACKGROUND", (3,0), (3,0), HexColor("#eff6ff")),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 14),
        ("BOTTOMPADDING", (0,0), (-1,-1), 14),
        ("BOX", (0,0), (0,0), 1, HexColor("#bbf7d0")),
        ("BOX", (1,0), (1,0), 1, HexColor("#fecaca")),
        ("BOX", (2,0), (2,0), 1, GRAY_MID),
        ("BOX", (3,0), (3,0), 1, HexColor("#bfdbfe")),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(sum_t)

    if no_count > 0:
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph(
            f'<font color="#dc2626"><b>!! ACTION REQUIRED:</b></font> <font color="#7f1d1d">{no_count} item{"s" if no_count > 1 else ""} answered NO. Corrective action required — see detail section.</font>',
            ParagraphStyle("Warn", fontName=FONT_BODY, fontSize=9.5, leading=14, backColor=HexColor("#fef2f2"), borderPadding=(8,10,8,10), borderColor=RED, borderWidth=1)
        ))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # COVER LETTER PAGE
    # ══════════════════════════════════════════════════════════════════════
    letter_style = ParagraphStyle("LetterBody", fontName=FONT_BODY, fontSize=10.5, leading=17, textColor=TEXT, spaceAfter=10)
    letter_bold  = ParagraphStyle("LetterBold", fontName=FONT_BOLD, fontSize=10.5, leading=17, textColor=TEXT)

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(completed_fmt, ParagraphStyle("Date", fontName=FONT_BODY, fontSize=10, textColor=TEXT_MUTED, spaceAfter=16)))
    story.append(Paragraph("RE: Monthly Compliance Inspection Report", ParagraphStyle("Re", fontName=FONT_BOLD, fontSize=11, leading=16, textColor=TEXT, spaceAfter=4)))
    story.append(Paragraph(f"Facility: {facility}" + (f", {address}" if address else ""), letter_style))
    story.append(Paragraph(f"Inspection Date: {insp_date_fmt}", letter_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_MID, spaceBefore=8, spaceAfter=16))

    greeting = f"Dear {send_to_email.split('@')[0].replace('.', ' ').title()}," if send_to_email else "Dear Client,"
    story.append(Paragraph(greeting, letter_bold))
    story.append(Spacer(1, 0.1*inch))

    reg_full = "Spill Prevention, Control, and Countermeasure (SPCC) Plan under 40 CFR Part 112" if template_type == "spcc" \
               else "Stormwater Pollution Prevention Plan (SWPPP) under the Multi-Sector General Permit (MSGP)"

    story.append(Paragraph(
        f"Please find attached the completed monthly inspection report for <b>{facility}</b>, "
        f"conducted on <b>{insp_date_fmt}</b> by <b>{inspector}</b> in accordance with your {reg_full}.",
        letter_style
    ))

    story.append(Paragraph("Inspection Summary", ParagraphStyle("LS", fontName=FONT_BOLD, fontSize=11, leading=16, textColor=TEXT, spaceBefore=12, spaceAfter=6)))
    story.append(Paragraph(f"A total of <b>{total} inspection items</b> were evaluated during this visit:", letter_style))

    bullet_style = ParagraphStyle("Bullet", fontName=FONT_BODY, fontSize=10.5, leading=16, textColor=TEXT, leftIndent=18, spaceAfter=4)
    story.append(Paragraph(f"&bull; &nbsp;<b>{yes_count} items</b> were found to be in satisfactory condition.", bullet_style))
    if no_count > 0:
        story.append(Paragraph(f"&bull; &nbsp;<b>{no_count} item{'s' if no_count > 1 else ''}</b> were identified as deficient and require corrective action.", bullet_style))
    if na_count > 0:
        story.append(Paragraph(f"&bull; &nbsp;<b>{na_count} item{'s' if na_count > 1 else ''}</b> were marked not applicable.", bullet_style))

    if no_count > 0:
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(
            f"<b>Corrective Action Required:</b> {no_count} item{'s were' if no_count > 1 else ' was'} identified as deficient. "
            "Please review the detailed findings on the following pages and implement corrective actions promptly. "
            "Document any corrective actions taken and retain records in accordance with your permit requirements.",
            ParagraphStyle("ActionNote", fontName=FONT_BODY, fontSize=10.5, leading=16, textColor=HexColor("#7f1d1d"),
                           backColor=HexColor("#fef2f2"), borderPadding=(10,12,10,12), borderColor=RED, borderWidth=1, spaceAfter=10)
        ))
    else:
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(
            "No deficiencies were identified during this inspection. The facility appears to be in good compliance standing.",
            ParagraphStyle("AllClear", fontName=FONT_BODY, fontSize=10.5, leading=16, textColor=HexColor("#14532d"),
                           backColor=HexColor("#f0fdf4"), borderPadding=(10,12,10,12), borderColor=GREEN, borderWidth=1, spaceAfter=10)
        ))

    if general_comments.strip():
        story.append(Paragraph("Inspector Notes", ParagraphStyle("IN", fontName=FONT_BOLD, fontSize=11, leading=16, textColor=TEXT, spaceBefore=10, spaceAfter=4)))
        story.append(Paragraph(general_comments.strip(), letter_style))

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(
        "The full inspection checklist, including individual item responses, comments, and any photographic documentation, "
        "is included in the pages that follow. Please retain this report as part of your facility's compliance records.",
        letter_style
    ))
    story.append(Spacer(1, 0.25*inch))
    story.append(Paragraph("Sincerely,", letter_style))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("<b>Midwest Training and Consulting Services (MTCS)</b>", letter_style))
    story.append(Paragraph("Environmental Compliance Division", letter_style))
    story.append(Paragraph(f"Contact: {mtcs_contact}", letter_style))
    story.append(Paragraph('<a href="https://midwest-training.com" color="#15803d">midwest-training.com</a>', letter_style))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # INSPECTION DETAIL PAGES
    # ══════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("Inspection Detail", S["h1"]))
    story.append(Paragraph(f"{template_name} · {facility} · {insp_date_fmt}", S["small"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GREEN, spaceBefore=6, spaceAfter=16))

    for section in sections:
        section_qs = [q for q in questions if q.get("section") == section]
        if not section_qs:
            continue

        sec_header = Table(
            [[Paragraph(section.upper(), ParagraphStyle("SecH", fontName=FONT_BOLD, fontSize=9, textColor=white))]],
            colWidths=[doc.width]
        )
        sec_header.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), GREEN),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (-1,-1), 10),
        ]))
        story.append(KeepTogether([sec_header, Spacer(1, 2)]))

        rows = []
        for i, q in enumerate(section_qs):
            ans_data = answer_map.get(q.get("id", -1), {})
            ans = ans_data.get("answer", "")
            comments = ans_data.get("comments", "")
            photos = ans_data.get("photos", [])

            badge_text, bg_color, border_color = answer_badge(ans)
            badge_cell = Table(
                [[Paragraph(badge_text, ParagraphStyle("Badge", fontName=FONT_BOLD, fontSize=9, alignment=TA_CENTER))]],
                colWidths=[0.65*inch]
            )
            badge_cell.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), bg_color),
                ("BOX", (0,0), (-1,-1), 1, border_color),
                ("TOPPADDING", (0,0), (-1,-1), 4),
                ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ("ALIGN", (0,0), (-1,-1), "CENTER"),
            ]))

            q_content = [Paragraph(f"<b>{i+1}.</b> {q.get('questionText','')}", S["qtext"])]
            if comments.strip():
                q_content.append(Paragraph(f"<i>Comment:</i> {comments.strip()}", S["comment"]))
            if photos:
                q_content.append(Paragraph(f"<i>{len(photos)} photo{'s' if len(photos)>1 else ''} attached to inspection record</i>", S["comment"]))

            row_bg = GRAY_LIGHT if i % 2 == 0 else white

            row_table = Table(
                [[badge_cell, q_content]],
                colWidths=[0.75*inch, doc.width - 0.75*inch]
            )
            row_table.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), row_bg),
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("TOPPADDING", (0,0), (-1,-1), 8),
                ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                ("LEFTPADDING", (0,0), (-1,-1), 8),
                ("RIGHTPADDING", (0,0), (-1,-1), 8),
                ("LINEBELOW", (0,0), (-1,-1), 0.5, GRAY_MID),
            ]))
            rows.append(row_table)

        for row in rows:
            story.append(row)
        story.append(Spacer(1, 12))

    # ── Recommendations page (only if any NO answers) ──────────────────
    no_items = []
    for q in questions:
        qid = q.get("id", -1)
        ans_data = answer_map.get(qid, {})
        if ans_data.get("answer", "").lower() == "no":
            rec = CFR_RECOMMENDATIONS.get(qid)
            if rec:
                no_items.append({
                    "qid": qid,
                    "question": q.get("questionText", ""),
                    "section": q.get("section", ""),
                    "comments": ans_data.get("comments", ""),
                    **rec,
                })

    if no_items:
        story.append(PageBreak())

        # Page header
        story.append(Paragraph(
            "Recommendations & Corrective Actions",
            ParagraphStyle("RecTitle", fontName=FONT_BOLD, fontSize=16, leading=22,
                           textColor=HexColor("#991b1b"), spaceAfter=4)
        ))
        story.append(HRFlowable(width="100%", thickness=2, color=RED, spaceAfter=6))
        story.append(Paragraph(
            f"The following {len(no_items)} item{'s' if len(no_items) > 1 else ''} "
            f"answered <b>NO</b> require corrective action. Recommendations are based on "
            f"applicable federal regulations (40 CFR Part 112, 2021 MSGP, NPDES).",
            ParagraphStyle("RecIntro", fontName=FONT_BODY, fontSize=9.5, leading=14,
                           textColor=GRAY, spaceAfter=16)
        ))

        # Severity legend
        legend_data = [[
            Paragraph('<font color="#991b1b"><b>CRITICAL</b></font> = Correct within 24-48 hours',
                       ParagraphStyle("LegC", fontName=FONT_BODY, fontSize=8, leading=11)),
            Paragraph('<font color="#b45309"><b>STANDARD</b></font> = Correct within 30 days',
                       ParagraphStyle("LegS", fontName=FONT_BODY, fontSize=8, leading=11)),
        ]]
        legend_t = Table(legend_data, colWidths=[doc.width/2]*2)
        legend_t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), HexColor("#fef2f2")),
            ("BOX", (0,0), (-1,-1), 1, HexColor("#fecaca")),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (-1,-1), 10),
            ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ]))
        story.append(legend_t)
        story.append(Spacer(1, 14))

        # Individual recommendation cards
        for idx, item in enumerate(no_items):
            is_critical = item["severity"] == "critical"
            sev_color = HexColor("#991b1b") if is_critical else ORANGE
            sev_bg = HexColor("#fef2f2") if is_critical else ORANGE_LIGHT
            sev_border = HexColor("#fecaca") if is_critical else HexColor("#fed7aa")
            deadline = "24-48 hours" if is_critical else "30 days"

            # Severity badge
            badge = Table(
                [[Paragraph(f'<font color="white"><b>{"CRITICAL" if is_critical else "STANDARD"}</b></font>',
                            ParagraphStyle("SevBadge", fontName=FONT_BOLD, fontSize=7, alignment=TA_CENTER))]],
                colWidths=[1.0*inch]
            )
            badge.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), sev_color),
                ("TOPPADDING", (0,0), (-1,-1), 3),
                ("BOTTOMPADDING", (0,0), (-1,-1), 3),
                ("ALIGN", (0,0), (-1,-1), "CENTER"),
            ]))

            card_content = []
            # Question + badge row
            q_row = Table(
                [[Paragraph(f"<b>{idx+1}.</b> {item['question']}",
                            ParagraphStyle("RecQ", fontName=FONT_BOLD, fontSize=9.5, leading=13, textColor=TEXT)),
                  badge]],
                colWidths=[doc.width - 1.4*inch - 20, 1.2*inch]
            )
            q_row.setStyle(TableStyle([
                ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("LEFTPADDING", (0,0), (-1,-1), 0),
                ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ("TOPPADDING", (0,0), (-1,-1), 0),
                ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ]))
            card_content.append(q_row)

            # Inspector comments (if any)
            if item["comments"].strip():
                card_content.append(Spacer(1, 4))
                card_content.append(Paragraph(
                    f'<font color="#6b7280"><i>Inspector note:</i></font> {item["comments"].strip()}',
                    ParagraphStyle("RecComment", fontName=FONT_BODY, fontSize=8.5, leading=12, textColor=GRAY)
                ))

            # CFR citation
            card_content.append(Spacer(1, 6))
            card_content.append(Paragraph(
                f'<font color="#374151"><b>Regulatory Basis:</b></font> <font color="#1d4ed8">{item["cfr"]}</font>',
                ParagraphStyle("RecCFR", fontName=FONT_BODY, fontSize=8.5, leading=12)
            ))

            # Recommendation text
            card_content.append(Spacer(1, 4))
            card_content.append(Paragraph(
                f'<font color="#374151"><b>Recommended Action:</b></font> {item["recommendation"]}',
                ParagraphStyle("RecAction", fontName=FONT_BODY, fontSize=9, leading=13, textColor=TEXT)
            ))

            # Deadline
            card_content.append(Spacer(1, 4))
            card_content.append(Paragraph(
                f'<font color="{"#991b1b" if is_critical else "#b45309"}"><b>Correction Deadline:</b> {deadline} from date of inspection</font>',
                ParagraphStyle("RecDeadline", fontName=FONT_BOLD, fontSize=8.5, leading=12)
            ))

            # Wrap in card
            card_table = Table([[card_content]], colWidths=[doc.width - 20])
            card_table.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,-1), sev_bg),
                ("BOX", (0,0), (-1,-1), 1, sev_border),
                ("TOPPADDING", (0,0), (-1,-1), 10),
                ("BOTTOMPADDING", (0,0), (-1,-1), 10),
                ("LEFTPADDING", (0,0), (-1,-1), 12),
                ("RIGHTPADDING", (0,0), (-1,-1), 12),
            ]))
            story.append(KeepTogether([card_table, Spacer(1, 10)]))

        # Summary footer
        crit_count = sum(1 for i in no_items if i["severity"] == "critical")
        std_count = len(no_items) - crit_count
        story.append(Spacer(1, 8))
        story.append(HRFlowable(width="100%", thickness=1, color=GRAY_MID, spaceAfter=8))
        summary_parts = [f"<b>Summary:</b> {len(no_items)} corrective action{'s' if len(no_items)>1 else ''} required"]
        if crit_count:
            summary_parts.append(f" \u2014 <font color='#991b1b'><b>{crit_count} critical</b></font> (24-48 hrs)")
        if std_count:
            summary_parts.append(f"{', ' if crit_count else ' \u2014 '}<font color='#b45309'><b>{std_count} standard</b></font> (30 days)")
        summary_parts.append(". Document all corrective actions with dates, responsible parties, and photographic evidence.")
        story.append(Paragraph(
            "".join(summary_parts),
            ParagraphStyle("RecSummary", fontName=FONT_BODY, fontSize=9, leading=13,
                           textColor=TEXT, backColor=GRAY_LIGHT, borderPadding=(8,10,8,10))
        ))

    # ── Build ────────────────────────────────────────────────────────────
    doc.build(story, onFirstPage=cover_page, onLaterPages=hf)
    return buf.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    pdf_bytes = generate_pdf(data)
    sys.stdout.buffer.write(base64.b64encode(pdf_bytes))
