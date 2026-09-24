/**
 * CONSTRUCTION ONTOLOGY (Item F).
 *
 * A structured bridge between what a human (or a vision model) *observes* on a
 * job and what the canonical catalog can *price*. It exists so recognition work
 * never degrades into a pile of literal keyword cases:
 *
 *   subject  — a canonical construction object/work family ("wall", "lvl_beam")
 *   trade    — the hire-able trade that owns it
 *   unit     — the ONLY unit family a quantity may bind to for this subject
 *   actions  — the verbs that turn a mention of the subject into WORK
 *   contextOnly — phrasings where the subject is a LOCATION or a GRADE word,
 *                 never scope ("behind the range hood", "paint-grade trim")
 *   featureKey — the intake feature key (and therefore the canonical assembly
 *                through FEATURE_ASSEMBLY_MAP) this subject resolves to
 *   dependencies — process reasoning: work that a subject typically drags along,
 *                classified `required` | `likely` | `optional` | `unknown`.
 *                NEVER auto-priced from this table; it drives questions,
 *                incidental candidates and composite exclusivity.
 *
 * Pure module: no React, no IO, no network.
 */

import type { LaborTradeKey } from "@/domains/estimating/tradeTaxonomy";
import type { FallbackUnitFamily } from "@/domains/estimating/genericTradeFallback";

export type OntologyActionKey =
  | "remove"
  | "install"
  | "replace"
  | "build"
  | "relocate"
  | "repair"
  | "paint"
  | "clean"
  | "permit";

export type DependencyStrength = "required" | "likely" | "optional" | "unknown";

export interface OntologyDependency {
  subjectKey: string;
  strength: DependencyStrength;
  reason: string;
}

export interface OntologySubject {
  subjectKey: string;
  /** Trade that owns the work when an action is directed at this subject. */
  tradeKey: LaborTradeKey;
  /** Unit family a quantity may bind to. `count` subjects never take LF/SF. */
  unitFamily: FallbackUnitFamily;
  /** Verbs that create work for this subject. */
  actions: OntologyActionKey[];
  /** Nouns/aliases that name this subject. */
  aliases: string[];
  /**
   * Phrasings where the alias is context, not scope. Matching one of these
   * means: do NOT create work from this mention.
   */
  contextOnly?: RegExp[];
  /** Intake feature key (bridges into FEATURE_ASSEMBLY_MAP / canonical catalog). */
  featureKey?: string;
  /** Process reasoning; never priced directly from here. */
  dependencies?: OntologyDependency[];
  /**
   * True when no defensible quantity convention exists without contractor
   * dimensions, so the subject prices as a disclosed allowance that always
   * needs review (custom casework, un-engineered structure).
   */
  allowanceOnly?: boolean;
}

const LOCATION_PREPOSITION =
  /\b(behind|beside|next to|near|above|below|under|underneath|over|by|across from|opposite|in front of|on the (back|far|other)side of|backside of|detr[áa]s de|al lado de)\b[^.,;]*/i;

/** Grade/spec words that name a quality tier, not a trade activity. */
const GRADE_CONTEXT = [
  /\bpaint[-\s]?grade\b/i,
  /\bstain[-\s]?grade\b/i,
  /\bmid[-\s]?grade\b/i,
  /\bbuilder[-\s]?grade\b/i,
  /\bcountertop\s+level\b/i,
  /\bfloor\s+plan\b/i,
  /\blevel\s+5\s+finish\b/i,
];

export const ONTOLOGY: OntologySubject[] = [
  /* ------------------------------------------- general conditions */
  {
    subjectKey: "general.protection_cleanup",
    tradeKey: "general_conditions",
    unitFamily: "area",
    actions: ["clean", "install"],
    aliases: ["floor protection", "dust barrier", "cleanup", "clean up", "debris removal", "dumpster"],
  },
  {
    subjectKey: "general.permit",
    tradeKey: "general_conditions",
    unitFamily: "count",
    actions: ["permit"],
    aliases: ["permit", "building permit", "inspection fee", "plan review"],
    // Permits are fees: zero labor unless a separate admin labor task exists.
  },
  {
    subjectKey: "general.engineering",
    tradeKey: "general_conditions",
    unitFamily: "count",
    actions: ["permit", "install"],
    aliases: ["structural engineer", "engineering", "stamped drawing", "architect"],
  },

  /* ------------------------------------------------- demolition */
  {
    subjectKey: "demo.wall",
    tradeKey: "demolition",
    unitFamily: "linear",
    actions: ["remove"],
    aliases: ["wall", "partition", "pared"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "structural.wall_removal",
    dependencies: [
      { subjectKey: "general.protection_cleanup", strength: "likely", reason: "Dust control and debris haul for interior demo." },
      { subjectKey: "structure.temporary_support", strength: "unknown", reason: "Shoring depends on whether the wall is load bearing — unknown from media." },
      { subjectKey: "drywall.patch", strength: "likely", reason: "Adjacent surfaces are opened by the removal." },
    ],
  },
  {
    subjectKey: "demo.closet",
    tradeKey: "demolition",
    unitFamily: "linear",
    actions: ["remove"],
    aliases: ["closet", "closets", "clóset", "closet wall"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "demolition.closet_removal",
  },
  {
    subjectKey: "demo.flooring",
    tradeKey: "demolition",
    unitFamily: "area",
    actions: ["remove"],
    aliases: ["existing flooring", "old carpet", "tear out floor"],
  },

  /* ------------------------------------- structure / framing */
  {
    subjectKey: "structure.lvl_beam",
    tradeKey: "framing",
    unitFamily: "linear",
    actions: ["install", "replace", "build"],
    aliases: ["lvl", "beam", "header", "microlam", "glulam", "viga"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "structural.lvl_beam",
    dependencies: [
      { subjectKey: "structure.post", strength: "required", reason: "A beam requires bearing posts at each end." },
      { subjectKey: "general.engineering", strength: "likely", reason: "Structural members in a bearing wall usually need a stamped design." },
      { subjectKey: "general.permit", strength: "likely", reason: "Structural alteration is typically permitted work." },
    ],
  },
  {
    subjectKey: "structure.post",
    tradeKey: "framing",
    unitFamily: "count",
    actions: ["install", "replace", "build"],
    aliases: ["post", "posts", "column", "columns", "poste", "columna"],
    featureKey: "structural.column",
  },
  {
    subjectKey: "structure.temporary_support",
    tradeKey: "framing",
    unitFamily: "count",
    actions: ["install", "build"],
    aliases: ["temporary support", "shoring", "temp wall"],
  },
  {
    subjectKey: "structure.framing",
    tradeKey: "framing",
    unitFamily: "linear",
    actions: ["build", "install", "repair"],
    aliases: ["framing", "stud wall", "rough carpentry", "joist", "subfloor", "stairs"],
    contextOnly: GRADE_CONTEXT,
  },

  /* ------------------------------------------------ drywall */
  {
    subjectKey: "drywall.patch",
    tradeKey: "drywall",
    unitFamily: "area",
    actions: ["repair", "install", "replace"],
    aliases: ["drywall", "sheetrock", "plaster", "patch"],
    contextOnly: [...GRADE_CONTEXT],
    featureKey: "drywall.replace",
  },

  /* ------------------------------------------------ painting */
  {
    subjectKey: "paint.interior",
    tradeKey: "painting",
    unitFamily: "area",
    actions: ["paint"],
    aliases: ["paint", "prime", "repaint", "coating", "pintar"],
    contextOnly: GRADE_CONTEXT,
    featureKey: "paint.interior",
  },

  /* ------------------------------------------------ flooring */
  {
    subjectKey: "flooring.finish",
    tradeKey: "flooring",
    unitFamily: "area",
    actions: ["install", "replace", "repair"],
    aliases: ["flooring", "hardwood", "lvp", "vinyl plank", "carpet", "laminate", "piso"],
    contextOnly: [/\bfloor\s+plan\b/i, LOCATION_PREPOSITION],
    featureKey: "flooring.replace",
  },

  /* -------------------------------------- tile / waterproofing */
  {
    subjectKey: "tile.wet_area",
    tradeKey: "tile",
    unitFamily: "area",
    actions: ["install", "replace", "repair"],
    aliases: ["tile", "backsplash", "shower surround", "shower pan", "waterproofing", "kerdi", "azulejo"],
    featureKey: "tile.wet_area",
  },

  /* --------------------------- finish carpentry / casework */
  {
    subjectKey: "carpentry.builtin",
    tradeKey: "finish_carpentry",
    unitFamily: "linear",
    actions: ["build", "install", "replace"],
    aliases: ["built-in", "built in", "bookcase", "bookcases", "casework", "shelving", "millwork"],
    featureKey: "trim.builtin_casework",
    allowanceOnly: true,
    dependencies: [
      { subjectKey: "paint.interior", strength: "optional", reason: "Site-built casework is usually finished, but only when the contractor includes it." },
    ],
  },
  {
    subjectKey: "carpentry.trim",
    tradeKey: "finish_carpentry",
    unitFamily: "linear",
    actions: ["install", "replace", "repair", "remove"],
    aliases: ["trim", "baseboard", "casing", "crown", "moulding", "molding"],
    contextOnly: GRADE_CONTEXT,
    featureKey: "trim.replace",
  },
  {
    subjectKey: "carpentry.cabinets",
    tradeKey: "finish_carpentry",
    unitFamily: "linear",
    actions: ["install", "replace", "remove", "build"],
    aliases: ["cabinet", "cabinets", "cabinetry", "gabinetes"],
    featureKey: "cabinets.replace",
  },
  {
    subjectKey: "carpentry.cabinets_upper",
    tradeKey: "finish_carpentry",
    unitFamily: "linear",
    actions: ["install", "replace", "remove", "build"],
    aliases: ["upper cabinet", "upper cabinets", "uppers", "wall cabinet", "wall cabinets"],
    featureKey: "cabinets.upper",
  },
  {
    subjectKey: "carpentry.island",
    tradeKey: "finish_carpentry",
    unitFamily: "linear",
    actions: ["install", "replace", "remove", "build"],
    /*
     * A breakfast bar is the same cabinetry work as an island and must be
     * recognized on its own words — contractors routinely say "a breakfast
     * bar, not an island", which previously recognized NOTHING.
     */
    aliases: ["island", "peninsula", "isla", "breakfast bar", "eating bar", "bar top", "barra de desayuno"],
    featureKey: "cabinets.island",
  },


  {
    subjectKey: "carpentry.countertop",
    tradeKey: "finish_carpentry",
    unitFamily: "area",
    actions: ["install", "replace"],
    aliases: ["countertop", "counter top", "quartz top", "granite top"],
    contextOnly: [/\bcountertop\s+level\b/i],
    featureKey: "countertops.replace",
  },

  /* ------------------------------------------------ plumbing */
  {
    subjectKey: "plumbing.fixture",
    tradeKey: "plumbing",
    unitFamily: "count",
    actions: ["install", "replace", "relocate", "remove", "repair"],
    aliases: ["toilet", "sink", "faucet", "shower valve", "water heater", "shutoff", "supply line", "rough-in"],
    featureKey: "fixtures.replace",
  },
  /*
   * Plumbing rough-in. A "plumbing chase" is a CAVITY — a location for other
   * work — and a "plumbing wall" is a landmark. Neither is plumbing scope.
   */
  {
    subjectKey: "plumbing.rough_in",
    tradeKey: "plumbing",
    unitFamily: "count",
    actions: ["install", "replace", "relocate", "remove", "repair"],
    aliases: [
      "plumbing",
      "water line",
      "supply line",
      "drain line",
      "waste line",
      "vent stack",
      "shutoff valve",
      "shut-off valve",
      "p-trap",
      "rough-in",
      "sink",
      "plomer",
    ],

    contextOnly: [
      /\bplumbing\s+(chase|wall|access|panel|cavity)\b/i,
      /\bchase\b/i,
      LOCATION_PREPOSITION,
    ],
    featureKey: "mechanical.plumbing",
  },


  /* ----------------------------------------------- electrical */
  {
    subjectKey: "electrical.device",
    tradeKey: "electrical",
    unitFamily: "count",
    actions: ["install", "replace", "relocate", "remove"],
    aliases: ["outlet", "receptacle", "switch", "circuit", "panel", "wiring"],
    featureKey: "mechanical.electrical",
  },
  {
    subjectKey: "electrical.device_relocate",
    tradeKey: "electrical",
    unitFamily: "count",
    actions: ["relocate", "install", "replace"],
    aliases: ["outlet", "receptacle", "switch", "device"],
    featureKey: "mechanical.outlet_relocate",
  },

  {
    subjectKey: "electrical.lighting",
    tradeKey: "electrical",
    unitFamily: "count",
    actions: ["install", "replace", "relocate"],
    aliases: ["recessed light", "can light", "light fixture", "sconce", "pendant"],
    featureKey: "lighting.recessed",
  },

  /* ---------------------------------------------------- HVAC */
  {
    subjectKey: "hvac.ventilation",
    tradeKey: "hvac",
    unitFamily: "count",
    actions: ["install", "replace", "relocate", "repair"],
    aliases: ["range hood", "exhaust fan", "duct", "mini split", "furnace", "vent"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "mechanical.hvac",
  },

  /* ---------------------------------------------- insulation */
  {
    subjectKey: "insulation.thermal",
    tradeKey: "insulation",
    unitFamily: "area",
    actions: ["install", "replace"],
    aliases: ["insulation", "air seal", "vapor barrier", "batt"],
    featureKey: "insulation.install",
  },

  /* ----------------------------------------- doors & windows */
  /*
   * A site-built access door/hatch over a chase is small carpentry, NOT a
   * catalog room door. It keeps its own subject so it can never inherit the
   * "are any room doors included?" question or a 5-door catalog default.
   */
  {
    subjectKey: "carpentry.access_panel",
    tradeKey: "finish_carpentry",
    unitFamily: "count",
    actions: ["build", "install", "replace", "repair"],
    aliases: ["access door", "access panel", "access hatch", "chase door", "chase panel", "hatch"],
    featureKey: "carpentry.access_panel",
  },
  /*
   * Closing up an existing opening is REAL carpentry work (remove the door,
   * frame and infill the opening). It is not a door replacement, so it keeps
   * its own subject and supersedes the catalog door line.
   */
  {
    subjectKey: "carpentry.opening_infill",
    tradeKey: "finish_carpentry",
    unitFamily: "count",
    actions: ["build"],
    /* Bare "door" stays with openings.door; this subject owns closure phrasing. */
    aliases: ["doorway", "door opening", "existing door", "kitchen door", "garage door"],

    featureKey: "carpentry.opening_infill",
  },

  {
    subjectKey: "openings.door",
    tradeKey: "finish_carpentry",
    unitFamily: "count",
    /* A site-built access door/hatch is BUILT, not ordered. */
    actions: ["install", "replace", "remove", "repair", "build"],
    aliases: ["door", "doors", "puerta", "access door", "access panel", "hatch"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "doors.replace",
  },

  {
    subjectKey: "paint.component",
    tradeKey: "painting",
    unitFamily: "linear",
    actions: ["paint"],
    aliases: ["paint", "prime", "repaint", "pintar"],
    contextOnly: GRADE_CONTEXT,
    featureKey: "paint.component",
  },


  {
    subjectKey: "openings.window",
    tradeKey: "exterior",
    unitFamily: "count",
    actions: ["install", "replace", "repair"],
    aliases: ["window", "windows", "ventana"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "windows.replace",
  },

  /* -------------------------------------------------- roofing */
  {
    subjectKey: "roofing.covering",
    tradeKey: "roofing",
    unitFamily: "area",
    actions: ["install", "replace", "repair"],
    aliases: ["roof", "shingles", "roofing", "techo"],
    featureKey: "roofing.replace",
  },
  {
    subjectKey: "roofing.metal",
    tradeKey: "roofing",
    unitFamily: "area",
    actions: ["install", "replace"],
    aliases: ["standing seam", "metal roof", "steel roof", "aluminum roof", "techo metálico"],
    featureKey: "roofing.metal.replace",
  },
  {
    subjectKey: "roofing.gutter",
    tradeKey: "roofing",
    unitFamily: "linear",
    actions: ["install", "replace", "repair"],
    aliases: ["gutter", "gutters", "downspout"],
    featureKey: "gutters.replace",
  },
  /*
   * Fascia, soffit and rake/shadow boards are exterior TRIM, measured in linear
   * feet. Folding them into siding is what turned "56 LF of 1x6 fascia" into a
   * 2,800 SF whole-house siding replacement.
   */
  {
    subjectKey: "exterior.fascia_trim",
    tradeKey: "exterior",
    unitFamily: "linear",
    actions: ["install", "replace", "repair", "paint"],
    aliases: ["fascia", "soffit", "soffits", "shadow board", "rake board", "frieze board"],
    featureKey: "fascia.replace",
  },
  /*
   * Exterior trim boards (vinyl / PVC / composite) around a deck, porch or
   * opening. Separate from interior trim so the contractor's own words survive
   * into the written scope and the price comes from an exterior book section.
   */
  {
    subjectKey: "exterior.trim_board",
    tradeKey: "exterior",
    unitFamily: "linear",
    actions: ["install", "replace", "repair"],
    aliases: ["vinyl trim", "pvc trim", "composite trim", "aluminum trim", "exterior trim board", "deck trim"],
    featureKey: "trim.exterior",
  },


  /* ------------------------------------------------- exterior */
  {
    subjectKey: "exterior.siding",
    tradeKey: "exterior",
    unitFamily: "area",
    actions: ["install", "replace", "repair"],
    aliases: ["siding", "cladding", "exterior trim"],
    featureKey: "siding.replace",
  },

  {
    subjectKey: "exterior.deck",
    tradeKey: "exterior",
    unitFamily: "area",
    actions: ["build", "install", "replace", "repair"],
    aliases: ["deck", "porch", "terraza"],
    featureKey: "deck.build",
  },
  {
    subjectKey: "exterior.deck_railing",
    tradeKey: "exterior",
    unitFamily: "linear",
    actions: ["install", "replace", "repair"],
    aliases: ["railing", "railings", "guardrail", "handrail", "baluster", "balusters", "barandal"],
    featureKey: "deck.railing",
  },
  {
    subjectKey: "exterior.fence",
    tradeKey: "exterior",
    unitFamily: "linear",
    actions: ["install", "replace", "repair"],
    aliases: ["fence", "fencing", "gate", "cerca"],
    featureKey: "fence.install",
  },

  {
    subjectKey: "site.landscaping",
    tradeKey: "exterior",
    unitFamily: "area",
    actions: ["install", "replace", "repair", "clean"],
    aliases: ["landscaping", "landscape", "sod", "planting", "plantings", "shrub", "shrubs", "mulch", "hardscape", "jardinería", "paisajismo"],
    featureKey: "landscaping.install",
  },

  /* ------------------------------------ concrete / sitework */
  {
    subjectKey: "sitework.concrete",
    tradeKey: "sitework_concrete",
    unitFamily: "area",
    actions: ["install", "replace", "repair"],
    aliases: ["concrete", "slab", "walkway", "driveway", "footing", "masonry", "grading", "drainage"],
    contextOnly: [/\bmid[-\s]?grade\b/i, /\bbuilder[-\s]?grade\b/i],
    featureKey: "concrete.flatwork",
  },

  /* ------------------------------------------------ specialty */
  {
    subjectKey: "specialty.appliance",
    tradeKey: "specialty",
    unitFamily: "count",
    actions: ["install", "replace", "relocate", "remove"],
    aliases: ["appliance", "range", "refrigerator", "dishwasher", "microwave", "cooktop", "range hood"],
    contextOnly: [LOCATION_PREPOSITION],
    featureKey: "appliances.install",
  },
  {
    subjectKey: "handyman.repair",
    tradeKey: "specialty",
    unitFamily: "count",
    actions: ["repair", "install", "replace"],
    aliases: ["punch list", "small repair", "handyman", "misc repair"],
    /*
     * "three little handyman projects" NAMES the job; it is not a request for
     * generic handyman hours on top of the tasks the contractor then lists.
     */
    contextOnly: [/\bhandyman\s+(project|job|visit)s?\b/i, /\bpunch\s?list\b/i],
    featureKey: "handyman.general",
  },

];

const BY_SUBJECT = new Map(ONTOLOGY.map((s) => [s.subjectKey, s]));
const BY_FEATURE = new Map(
  ONTOLOGY.filter((s) => s.featureKey).map((s) => [s.featureKey as string, s]),
);

export function ontologySubject(subjectKey: string): OntologySubject | null {
  return BY_SUBJECT.get(subjectKey) ?? null;
}

export function subjectForFeatureKey(featureKey: string): OntologySubject | null {
  return BY_FEATURE.get(featureKey) ?? null;
}

/** Coverage report: how many ontology subjects each trade owns. */
export function ontologyCoverageByTrade(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const subject of ONTOLOGY) {
    out[subject.tradeKey] = (out[subject.tradeKey] ?? 0) + 1;
  }
  return out;
}

/** Find the ontology subject a free-text noun names, if any. */
export function matchSubject(text: string): OntologySubject | null {
  const lower = (text ?? "").toLowerCase();
  let best: { subject: OntologySubject; length: number } | null = null;
  for (const subject of ONTOLOGY) {
    for (const alias of subject.aliases) {
      if (!lower.includes(alias.toLowerCase())) continue;
      if (!best || alias.length > best.length) best = { subject, length: alias.length };
    }
  }
  return best?.subject ?? null;
}

/**
 * True when the subject's alias only appears as LOCATION or GRADE context in
 * this phrase — a mention that must never create work.
 *
 * "the closets are on the backside of that range hood" -> range hood is context
 * "install a new range hood"                           -> range hood is scope
 */
export function isContextOnlyMention(subject: OntologySubject, phrase: string): boolean {
  const text = phrase ?? "";
  if (!text.trim()) return true;
  const lower = text.toLowerCase();

  /* Spans of the phrase that are pure context (location, grade tier, plan refs). */
  const spans: Array<[number, number]> = [];
  for (const pattern of subject.contextOnly ?? []) {
    const match = lower.match(pattern);
    if (!match || match.index == null) continue;
    spans.push([match.index, match.index + match[0].length]);
  }
  if (spans.length === 0) return false;

  /*
   * The mention is context ONLY when every mention of the subject sits inside a
   * context span. "Install a range hood over the cooktop" names the hood
   * outside the location span, so it is real scope; "the closets are on the
   * backside of that range hood" names the hood only inside it, so it is not.
   */
  let sawMention = false;
  for (const alias of subject.aliases) {
    const needle = alias.toLowerCase();
    let from = lower.indexOf(needle);
    while (from !== -1) {
      sawMention = true;
      const inside = spans.some(([start, end]) => from >= start && from < end);
      if (!inside) return false;
      from = lower.indexOf(needle, from + needle.length);
    }
  }
  return sawMention;
}


const ACTION_PATTERNS: Record<OntologyActionKey, RegExp> = {
  remove: /\b(remov(e|es|ing|al)|demo|demolish\w*|demolition|tear(ing)?\s+out|rip(ping)?\s+out|tak(e|ing)\s+out|pull(ing)?\s+out|quitar|demoler)\b/i,
  /*
   * Contractors describe installation with the verb for the FASTENING, not the
   * word "install": "put rigid foam on the ceiling", "screw it up with washers",
   * "glue the panel". Missing these is how explicitly stated insulation work was
   * demoted to a suggestion and dropped from pricing.
   */
  install: /\b(install\w*|add(s|ing)?|put(ting)?(\s+(in|up|on|over))?|hang(ing)?|set|new|appl(y|ies|ied|ying)|attach\w*|fasten\w*|screw\w*|mount\w*|secur(e|ed|ing)|glu(e|ed|ing)|stapl(e|ed|ing)|instalar|agregar|a[ñn]adir)\b/i,

  replace: /\b(replac(e|es|ing|ement)|swap(ping)?|reemplaz\w+|sustitu\w+)\b/i,

  /*
   * Contractors say "we're gonna do some built-in bookcases" as often as
   * "build". "do not" is handled by the negation gate, never here.
   */
  build:
    /\b(build\w*|construct\w*|fram(e|es|ing)|construir|do|does|doing|done|clos(e|es|ing)\s+(up|off)|fill(ing)?\s+in|infill\w*|wall(ing)?\s+(in|off)|board(ing)?\s+up)\b/i,


  relocate: /\b(relocat(e|ed|es|ing)|mov(e|ed|es|ing)|rerout(e|ed|ing)|mover|reubicar)\b/i,
  repair: /\b(repair\w*|patch\w*|fix\w*|reparar|arreglar)\b/i,
  paint: /\b(paint\w*|prime|primed|priming|repaint\w*|refinish\w*|pintar)\b/i,
  clean: /\b(clean|cleanup|clean\s+up|haul|dispose|disposal)\b/i,
  permit: /\b(permit|permitting|inspection|plan\s+review|engineer\w*)\b/i,
};

/** The action verb directed at this subject in the phrase, or null. */
export function actionForSubject(
  subject: OntologySubject,
  phrase: string,
): OntologyActionKey | null {
  const text = phrase ?? "";
  for (const action of subject.actions) {
    if (ACTION_PATTERNS[action].test(text)) return action;
  }
  return null;
}

export interface WorkCandidateCheck {
  /** True only when an action verb is directed at a non-context mention. */
  createsWork: boolean;
  action: OntologyActionKey | null;
  reason: "context_only" | "no_action" | "ok";
}

/**
 * ACTION + OBJECT + CONTEXT gate (Item C). A noun alone never creates work.
 */
export function evaluateWorkCandidate(
  subject: OntologySubject,
  phrase: string,
): WorkCandidateCheck {
  if (isContextOnlyMention(subject, phrase)) {
    return { createsWork: false, action: null, reason: "context_only" };
  }
  const action = actionForSubject(subject, phrase);
  if (!action) return { createsWork: false, action: null, reason: "no_action" };
  return { createsWork: true, action, reason: "ok" };
}

/**
 * SUBJECT-AWARE UNIT COMPATIBILITY (Item E). A measurement may only bind to a
 * subject whose expected unit family matches — 26 LF can never become 26 posts,
 * and a room's square footage can never become shower tile.
 */
export function unitFamilyCompatible(
  subject: OntologySubject,
  family: FallbackUnitFamily | null,
): boolean {
  if (!family) return false;
  return subject.unitFamily === family;
}

/** Dependencies of a subject, filtered by how firm they are. */
export function dependenciesFor(
  subjectKey: string,
  strengths: DependencyStrength[] = ["required"],
): OntologyDependency[] {
  const subject = BY_SUBJECT.get(subjectKey);
  if (!subject) return [];
  return (subject.dependencies ?? []).filter((d) => strengths.includes(d.strength));
}
