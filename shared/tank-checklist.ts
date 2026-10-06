// Original MTCS companion checklist. Site-specific requirements and inspection
// intervals come from the applicable tank records, plan and inspection standard.
export const tankTemplate = {
  name: "Tank Inspection - Integrity Report Companion",
  type: "tank",
  description: "One checklist per tank: identification, visual condition, supporting records, photos and corrective actions linked to an integrity testing report.",
};

const sections: [string, [string, string][]][] = [
  ["Tank records and inspection basis", [
    ["Does the tank ID match the tank identified in the integrity testing report?", "Reconcile tank identification with the referenced report before finalizing the checklist."],
    ["Are the tank design standard, nameplate details and available construction records documented?", "Locate supporting records; record unknown information for follow-up without assuming a listing."],
    ["Are prior inspection, thickness measurement and repair records available for comparison?", "Obtain the available inspection and repair history and identify missing records."],
    ["Is the inspection schedule documented and current for this tank's configuration and applicable inspection program?", "Have the responsible inspector review the inspection basis and document the next due date."],
    ["Are applicable tank registration or permit records available and current?", "Confirm applicable requirements and update the records; document the basis for N/A."],
  ]],
  ["Foundation and supports", [
    ["Is the foundation free of visible settlement, erosion or washout?", "Document the location and extent of movement or erosion for evaluation and repair."],
    ["Are concrete pads or ring walls free of significant cracking and spalling?", "Record cracks and spalling with photographs and arrange evaluation of the affected support."],
    ["Are saddles, skids, legs, anchors and other supports free of visible damage or significant corrosion?", "Identify damaged support components and refer them for qualified evaluation."],
    ["Can water drain away without accumulating against the tank or its supports?", "Identify the drainage obstruction and arrange correction consistent with the containment plan."],
    ["Are accessible tank surfaces clear of unintended soil contact and vegetation?", "Document obscured surfaces and arrange safe access for inspection."],
    ["Are visible bonding and grounding connections intact where provided?", "Have damaged or missing connections evaluated and repaired by qualified personnel."],
  ]],
  ["Shell, heads, roof and markings", [
    ["Are accessible coatings free of peeling, blistering or other visible failure?", "Document coating deterioration and plan surface evaluation and coating repair."],
    ["Are accessible tank surfaces free of visible rust, pitting or other corrosion?", "Map and photograph corrosion; refer affected areas for evaluation before coating or repair."],
    ["Are the shell, heads, roof and visible welds free of cracks, distortion, dents or bulging?", "Document visible deformation or cracking and obtain a qualified assessment."],
    ["Are the tank exterior and visible seams free of leakage or wet staining?", "Investigate the source promptly and follow the facility's spill response procedures as appropriate."],
    ["Are surrounding ground and concrete surfaces free of evidence of product leakage?", "Document staining or product accumulation and investigate the source."],
    ["Are tank identification, product and capacity markings legible and consistent with tank records?", "Replace or correct markings after confirming the tank information."],
    ["Are applicable hazard labels and warnings legible and visible from the intended approach?", "Restore applicable labels and warnings in visible locations."],
  ]],
  ["Manways, piping and connections", [
    ["Are accessible manways, covers, gaskets and bolted connections free of visible damage or leakage?", "Identify damaged or leaking connections and arrange qualified evaluation and repair."],
    ["Are visible piping, fittings, valves and flexible connections free of leakage, damage and significant corrosion?", "Document affected components and arrange evaluation and corrective work."],
    ["Are pipe supports and clamps intact without visible abrasion or stress at tank connections?", "Have damaged supports or stressed connections evaluated and corrected."],
    ["Are unused connections capped or secured as specified by the facility procedures?", "Secure unused connections in accordance with the applicable operating procedures."],
  ]],
  ["Vents, gauges and overfill equipment", [
    ["Are installed normal vents visibly intact and free of external obstructions?", "Document vent damage or obstruction and arrange safe servicing."],
    ["Are installed emergency vents visibly intact and free of external obstructions?", "Have damaged or obstructed emergency vent equipment evaluated by qualified personnel."],
    ["Are required vent maintenance or functional check records current under the applicable program?", "Obtain current records or arrange the prescribed checks by qualified personnel."],
    ["Are level indicators or gauges readable and free of visible damage or leakage?", "Document defective indicators and arrange servicing or replacement."],
    ["Is the required overfill prevention equipment identified, with current inspection or functional test records?", "Verify the required equipment and obtain or schedule the applicable functional checks."],
    ["Do documented alarm and shutoff settings match the applicable tank operating procedures?", "Have setpoints verified against the tank's approved operating basis; document discrepancies."],
  ]],
  ["Containment and release detection", [
    ["Is secondary containment free of visible breaches, significant cracks or damaged penetrations?", "Document containment defects and arrange evaluation of containment performance and repair."],
    ["Is containment free of accumulated product, excess water or debris that reduces usable capacity?", "Investigate accumulation and manage removal under the facility's procedures."],
    ["Are containment drains controlled and secured as specified in the facility plan?", "Correct drain controls and document any release under facility procedures."],
    ["Is the documented release detection method in place with current inspection or monitoring records?", "Restore the specified detection method and document monitoring or inspection findings."],
    ["Are interstitial indicators or observation points accessible, readable and free of evidence of a release?", "Investigate abnormal indications and document follow-up; use N/A if not installed or applicable."],
    ["Are release prevention barriers and detection arrangements consistent with the documented tank inspection basis?", "Have changes or compromised barriers/detection reviewed for effects on the tank category and inspection schedule."],
  ]],
  ["Access, electrical condition and protection", [
    ["Are visible wiring, conduit and electrical enclosures free of damage or corrosion?", "Have damaged electrical components assessed by qualified personnel."],
    ["Are electrical components protected from standing liquid and other observed damage hazards?", "Document exposure and obtain a qualified assessment of the installation."],
    ["Are access routes, ladders and platforms visibly clear and in usable condition?", "Document access hazards and arrange correction before use."],
    ["Are installed vehicle barriers and other tank protections intact?", "Repair damaged protection and review observed vehicle impact exposure."],
    ["Are tank surroundings free of debris and combustible material that obstructs inspection or access?", "Remove obstructions under facility procedures and recheck previously obscured surfaces."],
  ]],
  ["Report reconciliation and follow-up", [
    ["Have visual findings been cross-referenced to the tank's integrity testing report and photo records?", "Reconcile findings and references before issuing the final report package."],
    ["Have previous corrective actions been verified and any remaining items carried forward?", "Verify prior work and carry unresolved items into the corrective-action log."],
    ["Have inaccessible areas, missing records and other inspection limitations been documented?", "Describe limitations and identify any additional access, records or inspection needed."],
  ]],
];

export const tankQuestions = sections.flatMap(([section, items]) => items.map(([questionText, recommendResponse]) => ({ section, questionText, recommendResponse })))
  .map((q, index) => ({ ...q, order: index + 1, required: true }));
