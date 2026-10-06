// MTCS wording for the 32 inspection points selected by the user.
export const tankTemplate = {
  name: "Tank Inspection - Integrity Report Companion",
  type: "tank",
  description: "MTCS tank checklist: 32 YES/NO inspection points with optional notes and photos.",
};

const sections: [string, string[]][] = [
  ["Records & Identification", [
    "Do the inspection records show a tank inspection within the past three years?",
    "Can the facility identify the standard used to design this tank?",
    "Is the tank's age known to the facility?",
    "Is the tank registered with the state environmental and fire authorities?",
    "Does the facility maintain an individual AST record for this tank?",
  ]],
  ["Base, Supports & Drainage", [
    "Is the tank base stable, without visible settlement or washout?",
    "Are the concrete pad or ring wall intact, without cracking or spalling?",
    "Are the tank's supports and skids in serviceable condition?",
    "Does water drain away from the tank and its foundation or ground contact area?",
    "Is the grounding strap between the tank and its foundation or supports intact?",
    "Are the tank sides clear of accumulated soil?",
  ]],
  ["Tank Body & Safety Markings", [
    "Is the exterior coating intact, without visible deterioration?",
    "Are the tank surfaces free of visible rust?",
    "Is the tank exterior free of visible product leaks?",
    "Are the nearby concrete and soil free of signs of product leakage?",
    "Is the tank capacity clearly marked?",
    "Is UL 142 construction documented for this shop-built flammable/combustible liquid tank?",
    "Is the shop-built tank documented as UL 2080 fire-resistant construction (Flameshield or F921)?",
    "Are NFPA 704 markings and other warning labels present, legible and intact?",
    "Can emergency responders readily see the tank's safety markings?",
  ]],
  ["Connections & Pipework", [
    "Are piping connection bolts secure and fully engaged?",
    "Are piping clamps, crevices and supports free of corrosion?",
  ]],
  ["Venting, Gauges & Overfill Controls", [
    "Does the tank have normal venting with unobstructed openings?",
    "Does the tank have emergency venting with unobstructed openings?",
    "Do emergency vents function correctly and meet the manufacturer's condition requirements?",
    "Are interstitial sight gauges clear and readable?",
    "Is overfill protection installed, inspected annually and verified to operate and indicate correctly?",
    "Are the electronic alarm and overfill settings 90% and 95%, respectively?",
  ]],
  ["Inventory & Leak Monitoring", [
    "Is inventory control carried out and recorded?",
    "Is containment release detection carried out and recorded?",
  ]],
  ["Electrical Installation", [
    "Are visible electrical wiring and enclosures in good condition?",
    "Is electrical conduit kept off the containment floor?",
  ]],
];

export const tankQuestions = sections.flatMap(([section, questions]) =>
  questions.map(questionText => ({ section, questionText, recommendResponse: "" }))
).map((q, index) => ({ ...q, order: index + 1, required: true }));
