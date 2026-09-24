/**
 * GENERIC WORK KNOWLEDGE — question & measurement library.
 *
 * Every entry declares:
 *  - `domains`  : the work this question is allowed to exist for
 *  - `affects`  : the estimating lever it moves (price/quantity/labor/risk/
 *                 sequencing/feasibility) — if it moves none, it is not asked
 *  - `reason`   : plain-English justification, surfaced as provenance
 *
 * There is no universal room/kitchen/garage schema here. A question reaches a
 * contractor only when the CURRENT project's scope contains a domain that
 * declares it. This library never stores a project's values.
 */

import type { BallparkOption, BallparkQuestion, BallparkQuestionKind } from "@/domains/ballpark/types";
import type { WorkDomain } from "./taxonomy";

export type EstimatingLever =
  | "price"
  | "quantity"
  | "labor"
  | "risk"
  | "sequencing"
  | "feasibility";

export interface ApplicabilityRule {
  /** In-scope domains that justify this field. */
  domains: WorkDomain[];
  /** Optional narrowing: only when a scope item key/title matches. */
  scopeItemPattern?: RegExp;
  /**
   * Optional suppression: the admitted scope ALREADY answers this question, so
   * asking it is noise. "2-inch rigid foam on the basement ceiling" makes "is
   * ceiling insulation included?" a question with a known answer.
   */
  satisfiedByPattern?: RegExp;
  affects: EstimatingLever[];
  reason: string;
}

export interface WorkQuestionDef extends ApplicabilityRule {
  id: string;
  kind: BallparkQuestionKind;
  promptKey: string;
  hintKey?: string;
  unit?: "ft" | "each";
  options?: BallparkOption[];
  allowUnknown?: boolean;
  optional?: boolean;
}

const opt = (value: string, labelKey: string, en: string[], es: string[]): BallparkOption => ({
  value,
  labelKey,
  match: { "en-US": en, "es-US": es },
});

const YES_NO_UNSURE: BallparkOption[] = [
  opt("yes", "options.yes", ["yes", "yeah", "yep"], ["si", "claro"]),
  opt("no", "options.no", ["no", "nope"], ["no"]),
  opt("unsure", "options.unsure", ["unsure", "not sure", "dont know"], ["no se", "no estoy seguro"]),
];

const EXTENT: BallparkOption[] = [
  opt("light", "options.light", ["light", "a little", "minimal"], ["poca", "ligera"]),
  opt("moderate", "options.moderate", ["moderate", "medium", "some"], ["moderada", "media"]),
  opt("extensive", "options.extensive", ["extensive", "a lot", "heavy", "full"], ["extensa", "mucha"]),
];

/**
 * Applicability of the questions that already exist in the quick interview.
 * These are rules, not special cases: `room_conversion` is simply the domain
 * that happens to need room geometry.
 */
export const BASE_QUESTION_RULES: Record<string, ApplicabilityRule> = {
  lengthFt: {
    /* Whole-surface work only. Patch/paint work is extent-based (patchScope). */
    domains: ["room_conversion", "flooring"],
    scopeItemPattern: /\b(room|space|floor\w*|area|whole|entire|convert\w*|conversion|basement|attic|garage)\b/,
    affects: ["quantity"],
    reason: "Room area and perimeter drive floor, wall and ceiling quantities.",
  },
  widthFt: {
    domains: ["room_conversion", "flooring"],
    scopeItemPattern: /\b(room|space|floor\w*|area|whole|entire|convert\w*|conversion|basement|attic|garage)\b/,
    affects: ["quantity"],
    reason: "Room area and perimeter drive floor, wall and ceiling quantities.",
  },
  useOfSpace: {
    domains: ["room_conversion"],
    affects: ["price", "feasibility"],
    reason: "What the space becomes sets the finish and code expectations.",
  },
  ceilingHeightFt: {
    domains: ["room_conversion", "drywall", "paint", "structure"],
    /* Height is a quantity driver only for room SURFACES, not local components. */
    scopeItemPattern: /\b(wall|walls|room|drywall|interior|partition|framing)\b/,
    affects: ["quantity", "labor"],
    reason: "Wall area and staging effort scale with ceiling height.",
  },
  partitions: {
    domains: ["room_conversion", "framing"],
    affects: ["quantity"],
    reason: "New interior walls are framed, insulated, boarded and finished.",
  },
  partitionLfKnown: {
    domains: ["room_conversion", "framing"],
    affects: ["quantity"],
    reason: "Known partition length replaces the allowance with a real quantity.",
  },
  raisedFloor: {
    domains: ["room_conversion", "flooring", "structure"],
    scopeItemPattern: /\b(raised floor|subfloor|floor\w*|slab|joist)\b/,
    affects: ["quantity", "labor"],
    reason: "A raised floor adds framing, insulation and height coordination.",
  },
  bathroom: {
    domains: ["room_conversion"],
    affects: ["price", "sequencing"],
    reason: "Adding a bathroom adds plumbing rough-in, fixtures and ventilation.",
  },
  closet: {
    domains: ["room_conversion", "closet"],
    affects: ["price"],
    reason: "Closets add framing, doors and shelving.",
  },
  /*
   * Insulation is priced per SURFACE. A ceiling insulation line must not open
   * a wall or floor insulation question — that is how one trade's template
   * reached an unrelated punch list.
   */
  insulationWalls: {
    domains: ["room_conversion", "insulation"],
    scopeItemPattern: /\b(wall|walls|stud|cavity)\b/,
    satisfiedByPattern: /\b(wall|walls|stud|cavity)\b[^.]{0,40}\b(insulat\w*|foam|batt)|\b(insulat\w*|foam|batt)\w*[^.]{0,40}\b(wall|walls|stud|cavity)\b/,
    affects: ["quantity"],
    reason: "Wall insulation is priced by wall area.",
  },
  insulationCeiling: {
    domains: ["room_conversion", "insulation"],
    scopeItemPattern: /\b(ceiling|attic|overhead|roof\w*)\b/,
    satisfiedByPattern: /\b(ceiling|attic|overhead)\b[^.]{0,40}\b(insulat\w*|foam|batt)|\b(insulat\w*|foam|batt)\w*[^.]{0,40}\b(ceiling|attic|overhead)\b/,
    affects: ["quantity"],
    reason: "Ceiling insulation is priced by ceiling area.",
  },
  insulationFloor: {
    domains: ["room_conversion", "insulation"],
    scopeItemPattern: /\b(floor\w*|crawl ?space|slab|subfloor)\b/,
    satisfiedByPattern: /\b(floor\w*|crawl ?space|slab|subfloor)\b[^.]{0,40}\b(insulat\w*|foam|batt)|\b(insulat\w*|foam|batt)\w*[^.]{0,40}\b(floor\w*|crawl ?space|slab|subfloor)\b/,
    affects: ["quantity"],
    reason: "Floor insulation is priced by floor area.",
  },
  drywall: {
    domains: ["room_conversion", "drywall"],
    scopeItemPattern: /\b(drywall|sheetrock|gypsum|board|texture|patch\w*)\b/,
    affects: ["quantity"],
    reason: "Board, tape and finish quantities follow the surfaces covered.",
  },
  flooringQuality: {
    domains: ["room_conversion", "flooring"],
    scopeItemPattern: /\b(floor\w*|lvp|hardwood|carpet|tile|underlayment)\b/,
    affects: ["price"],
    reason: "Flooring material tier moves the material allowance directly.",
  },
  newDoors: {
    domains: ["room_conversion", "openings"],
    scopeItemPattern: /\bdoors?\b/,
    affects: ["quantity"],
    reason: "Each door is a unit of material and labor.",
  },
  newWindows: {
    domains: ["room_conversion", "openings"],
    scopeItemPattern: /\bwindows?\b/,
    affects: ["quantity"],
    reason: "Each window is a unit of material and labor.",
  },
  electrical: {
    domains: ["room_conversion", "electrical"],
    scopeItemPattern: /\b(electric\w*|outlet|receptacle|circuit|panel|light\w*|switch|gfci|device|wiring)\b/,
    affects: ["price"],
    reason: "Device counts and circuits set the electrical allowance.",
  },
  plumbing: {
    domains: ["room_conversion", "plumbing", "bath"],
    scopeItemPattern: /\b(plumb\w*|pipe|supply|drain|waste|fixture|rough[- ]?in|sink|faucet|toilet|shower|tub|water heater)\b/,
    affects: ["price"],
    reason: "Fixture and rough-in counts set the plumbing allowance.",
  },
  finishLevel: {
    /*
     * Finish tier is only a lever where the contractor actually selects
     * materials. A fascia / insulation punch list has no finish tier to pick.
     */
    domains: [
      "room_conversion",
      "cabinets",
      "countertops",
      "flooring",
      "tile",
      "paint",
      "finish_carpentry",
      "bath",
      "kitchen",
    ],
    /*
     * Only ask when the contractor actually selects a finish material. A fascia
     * / insulation / access-door punch list has no finish tier to pick.
     */
    scopeItemPattern: /\b(cabinet\w*|countertop\w*|tile|floor\w*|built[- ]?in|casework|millwork|vanity|fixture\w*|shower|backsplash|finish(es)?\b)/,
    affects: ["price"],
    reason: "Finish tier scales material and labor on every in-scope item.",
  },
};


/**
 * Domain-specific questions that no room schema ever contained. Adding a trade
 * to the product means adding entries here.
 */
export const WORK_QUESTION_CATALOG: WorkQuestionDef[] = [
  /* ---------------- Planting / landscape ---------------- */
  {
    id: "plantingStockSize",
    kind: "choice",
    promptKey: "q.plantingStockSize.prompt",
    hintKey: "q.plantingStockSize.hint",
    domains: ["planting"],
    affects: ["price", "labor"],
    reason: "Nursery stock size sets material cost, equipment and crew size.",
    options: [
      opt("small", "options.plantingStock.small", ["small", "five gallon", "sapling"], ["pequeno", "cinco galones"]),
      opt("medium", "options.plantingStock.medium", ["medium", "fifteen gallon"], ["mediano", "quince galones"]),
      opt("large", "options.plantingStock.large", ["large", "balled", "b and b", "boxed"], ["grande", "encostalado"]),
    ],
  },
  {
    id: "plantingAccess",
    kind: "choice",
    promptKey: "q.plantingAccess.prompt",
    hintKey: "q.plantingAccess.hint",
    domains: ["planting", "excavation", "sitework"],
    affects: ["labor", "feasibility"],
    reason: "Machine access versus hand-carry changes planting labor dramatically.",
    options: [
      opt("machine", "options.access.machine", ["machine", "truck access", "open"], ["maquina", "acceso"]),
      opt("limited", "options.access.limited", ["limited", "gate", "narrow"], ["limitado", "estrecho"]),
      opt("hand", "options.access.hand", ["hand carry", "by hand", "no access"], ["a mano", "sin acceso"]),
    ],
  },
  {
    id: "soilConditions",
    kind: "choice",
    promptKey: "q.soilConditions.prompt",
    domains: ["planting", "excavation"],
    affects: ["labor", "risk"],
    reason: "Rock or clay changes digging time and may require amendment or an auger.",
    options: [
      opt("loam", "options.soil.loam", ["loam", "normal", "topsoil"], ["tierra", "normal"]),
      opt("clay", "options.soil.clay", ["clay", "heavy"], ["arcilla"]),
      opt("rocky", "options.soil.rocky", ["rocky", "rock", "caliche"], ["rocoso", "piedra"]),
    ],
    allowUnknown: true,
  },
  {
    id: "proximityRisk",
    kind: "choice",
    promptKey: "q.proximityRisk.prompt",
    hintKey: "q.proximityRisk.hint",
    domains: ["planting", "excavation", "sitework"],
    affects: ["risk", "feasibility", "sequencing"],
    reason: "Structures, footings and buried utilities near the hole require locates and hand digging.",
    options: YES_NO_UNSURE,
  },
  {
    id: "spoilsDisposal",
    kind: "choice",
    promptKey: "q.spoilsDisposal.prompt",
    domains: ["excavation", "demolition"],
    scopeItemPattern: /\b(spoils?|debris|haul\w*|dispos\w*|dumpster|cart\w*|load[- ]?out|dump)\b/,
    affects: ["price", "labor"],
    reason: "Hauling spoils or debris off site is a real cost line when disposal is stated.",
    options: YES_NO_UNSURE,
    optional: true,
  },

  /* ---------------- Structure / LVL ---------------- */
  {
    id: "beamSpanFt",
    kind: "dimension",
    promptKey: "q.beamSpanFt.prompt",
    hintKey: "q.beamSpanFt.hint",
    unit: "ft",
    domains: ["structure"],
    affects: ["price", "quantity", "feasibility"],
    reason: "Clear span sizes the beam and sets crane/crew needs.",
  },
  {
    id: "bearingCondition",
    kind: "choice",
    promptKey: "q.bearingCondition.prompt",
    domains: ["structure"],
    affects: ["risk", "price", "feasibility"],
    reason: "Load path to foundation determines posts, footings and engineering.",
    options: [
      opt("verified", "options.bearing.verified", ["verified", "confirmed", "engineered"], ["verificado", "confirmado"]),
      opt("assumed", "options.bearing.assumed", ["assumed", "probably"], ["asumido"]),
      opt("unknown", "options.bearing.unknown", ["unknown", "not sure"], ["desconocido"]),
    ],
  },
  {
    id: "temporaryShoring",
    kind: "choice",
    promptKey: "q.temporaryShoring.prompt",
    domains: ["structure", "demolition"],
    affects: ["labor", "sequencing", "risk"],
    reason: "Temporary support is separate labor and dictates the demo sequence.",
    options: [
      opt("yes", "options.yes", ["yes", "yeah", "yep"], ["si", "claro"]),
      opt("no", "options.no", ["no", "nope"], ["no"]),
      opt(
        "allowance",
        "options.shoring.allowance",
        ["allowance", "include an allowance", "ballpark it", "not sure"],
        ["provision", "incluir provision", "no estoy seguro"],
      ),
    ],
  },
  {
    /*
     * A beam in a finished interior is normally covered. Rather than leaving
     * it exposed or silently assuming a premium wrap, ask ONE question — the
     * finish method is the only high-impact unknown at ballpark stage.
     */
    id: "beamFinishMethod",
    scopeItemPattern: /\b(beam|lvl|glulam|header|post|column)\b/,
    kind: "choice",
    promptKey: "q.beamFinishMethod.prompt",
    domains: ["structure", "finish_carpentry"],
    affects: ["price", "labor"],
    reason: "How the beam and posts are covered changes trade, material and hours.",
    options: [
      opt("drywall", "options.beamFinish.drywall", ["drywall", "sheetrock", "painted drywall"], ["tabla roca", "panel de yeso"]),
      opt("paint_grade", "options.beamFinish.paintGrade", ["paint grade", "mdf wrap", "1x wrap"], ["para pintar", "mdf"]),
      opt("stain_grade", "options.beamFinish.stainGrade", ["stain grade", "wood wrap", "stained"], ["para barnizar", "madera"]),
      opt("exposed", "options.beamFinish.exposed", ["exposed", "leave exposed", "raw"], ["expuesta", "sin cubrir"]),
      opt("allowance", "options.beamFinish.allowance", ["unknown", "not sure", "allowance"], ["desconocido", "provision"]),
    ],
  },

  {
    id: "demoExtent",
    kind: "choice",
    promptKey: "q.demoExtent.prompt",
    domains: ["demolition"],
    affects: ["labor", "price"],
    reason: "How much comes out drives demo hours, protection and disposal.",
    options: EXTENT,
  },
  {
    id: "patchScope",
    kind: "choice",
    promptKey: "q.patchScope.prompt",
    domains: ["drywall"],
    affects: ["quantity", "labor"],
    reason: "Patch area after demo or a beam install is its own quantity.",
    options: EXTENT,
  },

  /* ---------------- Finish carpentry / built-ins ---------------- */
  {
    id: "builtInLengthFt",
    scopeItemPattern: /\b(built[- ]?in|bookcase|bookshel\w*|shelving|mantel|wainscot|column|cabinet run|casework|millwork)\b/,
    kind: "dimension",
    promptKey: "q.builtInLengthFt.prompt",
    hintKey: "q.builtInLengthFt.hint",
    unit: "ft",
    domains: ["finish_carpentry"],
    affects: ["quantity", "price"],
    reason: "Built-ins and columns are priced per linear foot of finished work.",
  },
  {
    id: "builtInMaterial",
    scopeItemPattern: /\b(built[- ]?in|bookcase|bookshel\w*|shelving|mantel|wainscot|column|cabinet run|casework|millwork)\b/,
    kind: "choice",
    promptKey: "q.builtInMaterial.prompt",
    domains: ["finish_carpentry"],
    affects: ["price", "labor"],
    reason: "Paint-grade versus stain-grade changes material and finishing hours.",
    options: [
      opt("paint_grade", "options.builtIn.paintGrade", ["paint grade", "mdf", "poplar"], ["para pintar", "mdf"]),
      opt("stain_grade", "options.builtIn.stainGrade", ["stain grade", "oak", "hardwood"], ["para barnizar", "madera"]),
    ],
  },

  /* ---------------- Cabinets & countertops ---------------- */
  {
    id: "cabinetRunFt",
    kind: "dimension",
    promptKey: "q.cabinetRunFt.prompt",
    hintKey: "q.cabinetRunFt.hint",
    unit: "ft",
    domains: ["cabinets"],
    affects: ["quantity", "price"],
    reason: "Cabinet work is priced by the linear foot of run, not by room size.",
  },
  {
    id: "counterMaterial",
    kind: "choice",
    promptKey: "q.counterMaterial.prompt",
    domains: ["countertops"],
    affects: ["price"],
    reason: "Countertop material is the dominant cost driver for the surface.",
    options: [
      opt("laminate", "options.counter.laminate", ["laminate", "formica"], ["laminado"]),
      opt("quartz", "options.counter.quartz", ["quartz", "engineered"], ["cuarzo"]),
      opt("granite", "options.counter.granite", ["granite", "stone"], ["granito"]),
    ],
  },

  /* ---------------- Plumbing (fixtures & rough-in) ---------------- */
  {
    id: "fixtureCount",
    scopeItemPattern: /\b(plumb\w*|pipe|supply|drain|waste|fixture|rough[- ]?in|sink|faucet|toilet|shower|tub|water heater)\b/,
    kind: "count",
    promptKey: "q.fixtureCount.prompt",
    hintKey: "q.fixtureCount.hint",
    unit: "each",
    domains: ["plumbing"],
    affects: ["quantity", "price"],
    reason: "Each fixture set is a discrete unit of rough-in, trim and labor.",
  },
  {
    id: "pipeRunLf",
    scopeItemPattern: /\b(plumb\w*|pipe|supply|drain|waste|fixture|rough[- ]?in|sink|faucet|toilet|shower|tub|water heater)\b/,
    kind: "dimension",
    promptKey: "q.pipeRunLf.prompt",
    hintKey: "q.pipeRunLf.hint",
    unit: "ft",
    domains: ["plumbing"],
    affects: ["quantity", "labor"],
    reason: "Supply and waste runs are priced by the linear foot of new pipe.",
  },
  {
    id: "pipeMaterial",
    scopeItemPattern: /\b(plumb\w*|pipe|supply|drain|waste|fixture|rough[- ]?in|sink|faucet|toilet|shower|tub|water heater)\b/,
    kind: "choice",
    promptKey: "q.pipeMaterial.prompt",
    domains: ["plumbing"],
    affects: ["price", "labor"],
    reason: "Existing and new pipe material sets fittings, tooling and transition risk.",
    options: [
      opt("pex", "options.pipe.pex", ["pex"], ["pex"]),
      opt("copper", "options.pipe.copper", ["copper"], ["cobre"]),
      opt("cast_iron", "options.pipe.castIron", ["cast iron", "galvanized"], ["hierro fundido", "galvanizado"]),
    ],
    allowUnknown: true,
  },
  {
    id: "plumbingAccess",
    scopeItemPattern: /\b(plumb\w*|pipe|supply|drain|waste|fixture|rough[- ]?in|sink|faucet|toilet|shower|tub|water heater)\b/,
    kind: "choice",
    promptKey: "q.plumbingAccess.prompt",
    domains: ["plumbing"],
    affects: ["labor", "risk", "feasibility"],
    reason: "Open walls versus slab or crawlspace access changes rough-in hours and demo.",
    options: [
      opt("open", "options.plumbingAccess.open", ["open walls", "accessible", "open"], ["paredes abiertas", "accesible"]),
      opt("concealed", "options.plumbingAccess.concealed", ["concealed", "closed walls", "finished"], ["oculto", "cerrado"]),
      opt("slab", "options.plumbingAccess.slab", ["slab", "under slab", "concrete"], ["losa", "bajo losa"]),
    ],
  },

  /* ---------------- Bath ---------------- */
  {
    id: "bathFixtureScope",
    kind: "choice",
    promptKey: "q.bathFixtureScope.prompt",
    domains: ["bath"],
    affects: ["price", "sequencing"],
    reason: "Replacing fixtures in place is far cheaper than relocating them.",
    options: [
      opt("same_location", "options.bathFixture.sameLocation", ["same location", "in place"], ["mismo lugar"]),
      opt("relocated", "options.bathFixture.relocated", ["relocate", "move", "new layout"], ["reubicar", "mover"]),
    ],
  },
  {
    id: "showerWaterproofing",
    kind: "choice",
    promptKey: "q.showerWaterproofing.prompt",
    domains: ["waterproofing", "tile"],
    affects: ["price", "risk"],
    reason: "A waterproofed wet area is a distinct assembly with its own failure risk.",
    options: YES_NO_UNSURE,
  },
  {
    id: "ventilation",
    kind: "choice",
    promptKey: "q.ventilation.prompt",
    domains: ["bath", "hvac"],
    affects: ["price", "feasibility"],
    reason: "Exhaust ventilation is code-required and may need a new duct run.",
    options: YES_NO_UNSURE,
    optional: true,
  },
];

/** Persisted measurement fields, with the domains that justify each. */
export type MeasurementFieldId =
  | "lengthFt"
  | "widthFt"
  | "ceilingHeightFt"
  | "interiorPartitionLf"
  | "doors"
  | "windows"
  | "floorWastePct";

export const MEASUREMENT_RULES: Record<MeasurementFieldId, ApplicabilityRule> = {
  lengthFt: {
    domains: ["room_conversion", "flooring", "insulation"],
    affects: ["quantity"],
    reason: "Room length is only a pricing input when area or perimeter is priced.",
  },
  widthFt: {
    domains: ["room_conversion", "flooring", "insulation"],
    affects: ["quantity"],
    reason: "Room width is only a pricing input when area or perimeter is priced.",
  },
  ceilingHeightFt: {
    domains: ["room_conversion", "drywall", "paint", "insulation", "structure"],
    affects: ["quantity", "labor"],
    reason: "Wall area and staging scale with ceiling height.",
  },
  interiorPartitionLf: {
    domains: ["room_conversion", "framing"],
    affects: ["quantity"],
    reason: "Partition length is framed, insulated and finished by the linear foot.",
  },
  doors: {
    domains: ["room_conversion", "openings"],
    affects: ["quantity"],
    reason: "Door count is a direct unit quantity.",
  },
  windows: {
    domains: ["room_conversion", "openings"],
    affects: ["quantity"],
    reason: "Window count is a direct unit quantity.",
  },
  floorWastePct: {
    domains: ["room_conversion", "flooring", "tile"],
    affects: ["quantity"],
    reason: "Waste factor applies only where sheet or tile goods are cut in.",
  },
};

export const ALL_MEASUREMENT_FIELDS = Object.keys(MEASUREMENT_RULES) as MeasurementFieldId[];

function ruleApplies(rule: ApplicabilityRule, domains: WorkDomain[], scopeText: string): boolean {
  /* An empty domain list means "any scope at all", never "no scope". */
  const domainMatched =
    rule.domains.length === 0
      ? domains.length > 0
      : rule.domains.some((domain) => domains.includes(domain));
  if (!domainMatched) return false;
  /* The scope already states the answer: asking again is noise, not accuracy. */
  if (rule.satisfiedByPattern?.test(scopeText)) return false;
  if (!rule.scopeItemPattern) return true;
  /*
   * A whole-room conversion prices every surface and opening in the room, so
   * surface-level narrowing does not apply to it. Every other job must name
   * the thing being worked on before its question may be asked.
   */
  if (rule.domains.includes("room_conversion") && domains.includes("room_conversion")) return true;
  return rule.scopeItemPattern.test(scopeText);
}


export function measurementFieldsForDomains(
  domains: WorkDomain[],
  scopeText = "",
): MeasurementFieldId[] {
  return ALL_MEASUREMENT_FIELDS.filter((field) =>
    ruleApplies(MEASUREMENT_RULES[field], domains, scopeText),
  );
}

export function isQuestionRelevant(
  questionId: string,
  domains: WorkDomain[],
  scopeText = "",
): boolean {
  const base = BASE_QUESTION_RULES[questionId];
  if (base) return ruleApplies(base, domains, scopeText);
  const extra = WORK_QUESTION_CATALOG.find((q) => q.id === questionId);
  if (extra) return ruleApplies(extra, domains, scopeText);
  /*
   * Unknown ids are NOT waved through. A legacy universal fallback is exactly
   * how garage questions reached a cabinet job.
   */
  return false;
}

export function questionRule(questionId: string): ApplicabilityRule | null {
  return (
    BASE_QUESTION_RULES[questionId] ??
    WORK_QUESTION_CATALOG.find((q) => q.id === questionId) ??
    null
  );
}

/** Catalog entry -> interview question. */
export function toBallparkQuestion(def: WorkQuestionDef): BallparkQuestion {
  return {
    id: def.id,
    kind: def.kind,
    promptKey: def.promptKey,
    hintKey: def.hintKey,
    unit: def.unit,
    options: def.options,
    allowUnknown: def.allowUnknown,
    optional: def.optional,
  };
}

/** Domain-specific questions the CURRENT scope justifies. */
export function catalogQuestionsForDomains(
  domains: WorkDomain[],
  scopeText = "",
): WorkQuestionDef[] {
  return WORK_QUESTION_CATALOG.filter((def) => ruleApplies(def, domains, scopeText));
}
