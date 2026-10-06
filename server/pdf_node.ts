import { generateTankPDF } from "./tank-pdf";
import { generateChecklistPDF } from "./checklist-pdf";
import { reportDate } from "./mtcs-pdf";

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

export function generatePDF(data: PdfData): Promise<Buffer> {
  if (data.templateType === "tank") return generateTankPDF(data);
  return generateChecklistPDF({ ...data, date: reportDate(data.date) }, {
    title: data.templateName || "Inspection Checklist",
    recommendation: q => CFR_RECOMMENDATIONS[q.id] || {
      recommendation: q.recommendResponse || "Review applicable CFR requirements and implement corrective action.",
    },
  });
}
