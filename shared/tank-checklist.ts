// Checklist supplied by MTCS for the integrity testing report companion.
export const tankTemplate = {
  name: "Tank Inspection - Integrity Report Companion",
  type: "tank",
  description: "Tank inspection findings: 32 YES/NO questions with optional comments and photos.",
};

const sections: [string, string[]][] = [
  ["Administrative Requirements", [
    "The tank was inspected within three years?",
    "Facility knows tank design standard?",
    "The facility knows the age of the tank?",
    "The tank is registered with the state environmental and fire agencies?",
    "There is an AST record available for each AST?",
  ]],
  ["Tank Foundation/Supports", [
    "Tank settlement or foundation free from washout?",
    "Concrete pad or ring wall free of cracking and spalling?",
    "Tank supports and skids are in good condition?",
    "Water able to drain away from tank if tank is resting on a foundation or on the ground?",
    "Grounding strap between the tank and foundation/supports is in good condition?",
    "Confirm that there is no soil resting against the side of the AST?",
  ]],
  ["Tank Shells, Heads and Roof", [
    "Tank is free of visible signs of coating failure?",
    "Tank is free of indications of rusting?",
    "Tank exterior free of visible leaks?",
    "Area around the tank (concrete surfaces and ground) free of visible signs of leakage?",
    "AST is labeled with capacity?",
    "Shop AST construction is confirmed (UL142) - for flammable and combustible liquids?",
    "Shop AST construction is confirmed UL 2080 - Fire Resistant Tank (Flameshield or F921)?",
    "Labels (NFPA 704) and warnings are intact and visible?",
    "Labels are positioned where they are visible to emergency responders?",
  ]],
  ["Tank Manway, Piping & Equipment", [
    "Piping connection bolts are tight and fully engaged?",
    "Piping is free of corrosion on clamps, crevices and supports?",
  ]],
  ["Tank Equipment", [
    "Each tank has been provided with normal vents that are free of obstructions?",
    "Each tank has been provided with emergency vents that are free of obstructions?",
    "Emergency vents in good working condition and functional, as required by manufacturer?",
    "Interstitial sight gauges are clear?",
    "Overfill protection has been provided and annually inspected and confirmed to be in working condition, reading correctly?",
    "Electronic alarms are set at 90% - overfill 95% level?",
  ]],
  ["Tank/Piping Release Detection", [
    "Inventory control is being performed and documented?",
    "Release detection from containment is being performed and documented?",
  ]],
  ["Other Equipment", [
    "Electrical wiring and boxes are in good condition?",
    "Electrical conduit has not been placed on floor of containment?",
  ]],
];

export const tankQuestions = sections.flatMap(([section, questions]) =>
  questions.map(questionText => ({ section, questionText, recommendResponse: "" }))
).map((q, index) => ({ ...q, order: index + 1, required: true }));
