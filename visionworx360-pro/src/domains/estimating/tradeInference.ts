/**
 * Trade inference — action + object + trade vocabulary precedence.
 *
 * The old classifier was a first-match keyword list. That is fine for tagging
 * and wrong for judgement: "Frame a platform floor" hit `floor`, "Paint kitchen
 * cabinets" hit `cabinet`, and every one of those misses turned into a review
 * finding asking the contractor to fix something a human reads correctly at a
 * glance.
 *
 * The model here is how a estimator actually reads a line:
 *
 *   1. WHAT IS THE ACTION?  A finish-coating verb ("prime and paint") owns the
 *      line no matter what surface it names. A structural verb ("frame",
 *      "reframe") owns the line no matter what surface it names.
 *   2. WHAT IS THE OBJECT?  A trade-exclusive noun ("GFCI", "shingle", "joist")
 *      is strong evidence. A shared noun ("floor", "wall", "counter") is weak
 *      context that must never outvote the action or an exclusive noun.
 *   3. IS THE WORDING ACTUALLY ABOUT WORK?  "Mid-grade LVP" and "premium
 *      countertop level" describe QUALITY, not site grading and not countertop
 *      installation. Those phrases are neutralized before anything is scored.
 *
 * The output carries a confidence and an ambiguity flag, because the point of
 * this module is not only to classify better — it is to stay silent when the
 * wording genuinely does not decide, instead of nagging the contractor with a
 * confident guess.
 *
 * Canonical trade keys come from `LABOR_TRADES` in `./tradeTaxonomy`; this
 * module never invents a trade or a display label.
 *
 * Pure module — no React, no IO.
 */

import {
  LABOR_TRADES,
  UNASSIGNED_TRADE,
  normalizeTradeKey,
  type LaborTradeKey,
} from "./tradeTaxonomy";

export type TradeConfidence = "high" | "medium" | "low" | "none";

export interface TradeClassification {
  /** Best canonical trade, or null when the wording does not decide. */
  trade: LaborTradeKey | null;
  confidence: TradeConfidence;
  /** True when two trades are genuinely in play and neither should be forced. */
  ambiguous: boolean;
  /** Every trade with real support, strongest first. */
  candidates: Array<{ trade: LaborTradeKey; score: number }>;
  /** The phrases that drove the decision — shown in review, used in tests. */
  evidence: string[];
}

const NONE: TradeClassification = {
  trade: null,
  confidence: "none",
  ambiguous: false,
  candidates: [],
  evidence: [],
};

/* ------------------------------------------------------------------ *
 * 0. Quality-level wording that must never read as work
 * ------------------------------------------------------------------ */

/**
 * Phrases that describe a SELECTION LEVEL. Each is erased from the text before
 * scoring, so "mid-grade LVP" can never reach the grading/sitework vocabulary
 * and "premium countertop level" can never invent countertop work.
 *
 * Regressions these protect against are covered in the classification matrix.
 */
const QUALITY_PHRASES: RegExp[] = [
  /\b(?:mid|high|low|builder|contractor|entry|top|standard|premium|economy|luxury|custom|basic|good|better|best)[\s-]?(?:grade|tier|level|end|quality)\b/g,
  /\b(?:grade|tier|level|quality)[\s-]?(?:a|b|c|1|2|3)\b/g,
  /\b(?:countertop|cabinet|fixture|finish|material|appliance|flooring|tile)[\s-]?(?:level|tier|grade|selection|allowance level)\b/g,
  /\bfinish (?:level|tier|grade|package)\b/g,
  /\bpaint[\s-]?grade\b/g,
  /\bstain[\s-]?grade\b/g,
  /\bselection level\b/g,
];

/** Verbs that mean real work is being performed on something. */
const ACTION_VERBS = [
  "install", "installation", "build", "construct", "set", "hang", "mount",
  "replace", "repair", "patch", "remove", "demo", "demolish", "tear", "pour",
  "frame", "reframe", "run", "rough", "wire", "pipe", "connect", "finish",
  "paint", "prime", "stain", "seal", "coat", "spray", "sand", "tape", "mud",
  "float", "grout", "tile", "lay", "fasten", "flash", "shingle", "insulate",
  "trim", "case", "fabricate", "add", "extend", "relocate", "upgrade", "apply",
];

/* ------------------------------------------------------------------ *
 * 1. Actions that decide the trade by themselves
 * ------------------------------------------------------------------ */

interface ActionRule {
  trade: LaborTradeKey;
  /** Word-boundary patterns for the verb form. */
  patterns: RegExp[];
  weight: number;
  /**
   * Wording that means the verb is NOT the work — e.g. "ready for paint" or
   * "paint-grade trim" (already erased) describe a condition, not a task.
   */
  negations?: RegExp[];
}

/**
 * A finish-coating verb is the single strongest signal in residential scope.
 * "Paint kitchen cabinets" is Painting; the cabinet noun is the object being
 * coated, not the trade. Weight sits above every object so this holds
 * regardless of what surface follows.
 */
const COATING_NEGATIONS: RegExp[] = [
  /\bready (?:for|to) (?:paint|prime|stain)\b/,
  /\bprep(?:ped|are|aration)? (?:for|to) (?:paint|prime|stain)\b/,
  /\b(?:by|per) (?:owner|others)\b.*\bpaint\b/,
  /\bpaint(?:ing)? (?:by|is by) (?:owner|others)\b/,
  /\bno (?:paint|painting)\b/,
  /\bpaint (?:not included|excluded)\b/,
];

const ACTION_RULES: ActionRule[] = [
  {
    trade: "painting",
    patterns: [
      /\b(?:paint|paints|painted|painting|repaint|repainting|prime|primed|priming|restain|stain|staining|varnish|lacquer|topcoat|top coat|clear coat|seal coat|spray finish|refinish|refinishing)\b/,
    ],
    weight: 12,
    negations: COATING_NEGATIONS,
  },
  {
    /* A structural verb outranks whatever surface it names — "frame a
     * platform floor" is Framing, not Flooring. */
    trade: "framing",
    patterns: [
      /* Verb forms only — "and framing" at the end of a demo line is a noun. */
      /\b(?:frame|frames|framed|reframe|reframing|reframed|furr|furring|sister)\b/,
    ],
    weight: 12,
  },
  {
    /* Removing something outranks the trade of the thing being removed:
     * "demo existing garage door and framing" is Demolition, not Framing. */
    trade: "demolition",
    patterns: [
      /\b(?:demo|demoed|demolish|demolition|tear out|tear-out|tearout|gut|strip out|haul out existing)\b/,
    ],
    weight: 14,
  },
  {
    trade: "drywall",
    /* The verb must actually govern a drywall surface — "hang interior
     * doors" is carpentry, not drywall. */
    patterns: [
      /\b(?:hang|hanging|tape|taping|mud|mudding|skim|skim-coat|texture|texturing|float)\b[^.;]{0,40}\b(?:drywall|sheetrock|gypsum|board|wall|walls|ceiling|ceilings)\b/,
      /\btape (?:and )?(?:mud|float|finish)\b/,
    ],
    weight: 9,
  },
  {
    trade: "sitework_concrete",
    patterns: [/\b(?:pour|poured|pouring|form|forming|screed|trowel|finish) (?:and )?(?:new )?(?:concrete|slab|footing|footings|foundation|pad|curb|walkway|driveway)\b/],
    weight: 12,
  },
  {
    trade: "electrical",
    patterns: [/\b(?:wire|wired|wiring|rewire|rewiring)\b/],
    weight: 11,
  },
  {
    /* The bare word "plumbing" is scored as a trade name below, not here. */
    trade: "plumbing",
    patterns: [/\b(?:re-?pipe|repipe|repiping|plumbed)\b/],
    weight: 11,
  },
  {
    trade: "tile",
    patterns: [/\b(?:tile|tiled|tiling|set tile|grout|grouting|waterproof|waterproofing)\b/],
    weight: 9,
  },
  {
    trade: "roofing",
    patterns: [/\b(?:re-?roof|reroof|reroofing|shingle|shingling|flash|flashing)\b/],
    weight: 10,
  },
  {
    trade: "insulation",
    patterns: [/\b(?:insulate|insulating|air ?seal(?:ing)?)\b/],
    weight: 10,
  },
];

/* ------------------------------------------------------------------ *
 * 2. Objects — trade-exclusive nouns vs shared context nouns
 * ------------------------------------------------------------------ */

/**
 * Naming the trade outright ("rough-in PLUMBING") is as strong as performing
 * its verb, which is what makes "plumbing and electrical" read as two trades
 * rather than as plumbing with an electrical footnote.
 */
const TRADE_NAME = 11;
/** Weight for a noun only one trade ever owns. */
const EXCLUSIVE = 7;
/** Weight for a noun that usually means one trade but is not proof. */
const TYPICAL = 4;
/** Weight for a shared surface/location word — context only, never a verdict. */
const CONTEXT = 2;

interface ObjectRule {
  trade: LaborTradeKey;
  weight: number;
  terms: readonly string[];
}

const OBJECT_RULES: ObjectRule[] = [
  {
    trade: "electrical",
    weight: EXCLUSIVE,
    terms: [
      "gfci", "afci", "receptacle", "outlet", "breaker", "circuit", "subpanel",
      "sub panel", "load center", "electrical panel", "romex", "conduit",
      "junction box", "low voltage", "recessed can", "can light", "light fixture",
      "switch leg", "three way switch", "dimmer", "smoke detector", "ceiling fan",
    ],
  },
  /* A bare trade name is itself trade-exclusive vocabulary. */
  { trade: "electrical", weight: TRADE_NAME, terms: ["electrical"] },
  { trade: "electrical", weight: TYPICAL, terms: ["switch", "lighting", "amp service", "wire"] },
  {
    trade: "plumbing",
    weight: EXCLUSIVE,
    terms: [
      "shower valve", "mixing valve", "p-trap", "p trap", "supply line",
      "water line", "water heater", "tankless", "drain line", "waste line",
      "vent stack", "toilet", "water closet", "lavatory", "faucet", "hose bibb",
      "hose bib", "shut off valve", "shutoff valve", "gas line", "pex", "sanitary tee",
    ],
  },
  { trade: "plumbing", weight: TRADE_NAME, terms: ["plumbing"] },
  { trade: "plumbing", weight: TYPICAL, terms: ["drain", "pipe", "sink", "fixture rough"] },
  {
    trade: "framing",
    weight: EXCLUSIVE,
    terms: [
      "stud", "studs", "joist", "joists", "rafter", "truss", "header",
      "top plate", "bottom plate", "sill plate", "sole plate", "platform floor",
      "load bearing", "load-bearing", "shear wall", "sheathing", "subfloor",
      "sub floor", "blocking", "ledger", "beam", "post and beam", "rough carpentry",
      "structural framing",
    ],
  },
  { trade: "framing", weight: TYPICAL, terms: ["framing", "structural", "partition wall"] },
  {
    trade: "drywall",
    weight: EXCLUSIVE,
    terms: ["drywall", "sheetrock", "gypsum", "corner bead", "joint compound", "level 4 finish", "level 5 finish", "plaster"],
  },
  { trade: "drywall", weight: TYPICAL, terms: ["tape and mud", "texture"] },
  {
    trade: "roofing",
    weight: EXCLUSIVE,
    terms: [
      "shingle", "shingles", "underlayment", "ridge vent", "drip edge",
      "roof deck", "roofing", "ice and water", "step flashing", "valley flashing",
      "gutter", "downspout", "fascia", "soffit",
    ],
  },
  { trade: "roofing", weight: TYPICAL, terms: ["roof", "flashing"] },
  {
    trade: "sitework_concrete",
    weight: EXCLUSIVE,
    terms: [
      "footing", "footings", "concrete slab", "slab on grade", "rebar",
      "formwork", "form boards", "excavat", "site grading", "rough grading",
      "backfill", "gravel base", "compacted base", "driveway", "sidewalk",
      "curb", "flatwork", "stem wall",
    ],
  },
  { trade: "sitework_concrete", weight: TYPICAL, terms: ["concrete", "slab", "foundation", "masonry", "brick", "block wall", "stucco", "paver"] },
  {
    trade: "hvac",
    weight: EXCLUSIVE,
    terms: [
      "hvac", "mini split", "mini-split", "condenser", "air handler", "furnace",
      "ductwork", "duct", "register", "return air", "exhaust fan", "bath fan",
      "thermostat", "btu", "condensate",
    ],
  },
  { trade: "hvac", weight: TYPICAL, terms: ["mechanical", "ventilation", "air conditioning"] },
  {
    trade: "insulation",
    weight: EXCLUSIVE,
    terms: ["insulation", "batt", "batts", "blown in", "spray foam", "rigid foam", "r-13", "r-19", "r-21", "r-30", "vapor barrier", "radiant barrier"],
  },
  {
    trade: "tile",
    weight: EXCLUSIVE,
    terms: [
      "tile", "backsplash", "grout", "thinset", "cement board", "backer board",
      "schluter", "kerdi", "mortar bed", "shower pan", "shower surround",
      "niche", "mosaic", "porcelain", "ceramic",
    ],
  },
  {
    trade: "flooring",
    weight: EXCLUSIVE,
    terms: [
      "lvp", "lvt", "vinyl plank", "luxury vinyl", "hardwood", "engineered wood",
      "laminate flooring", "carpet", "carpet pad", "underlayment pad",
      "floating floor", "sheet vinyl", "transition strip", "shoe molding at floor",
      "flooring",
    ],
  },
  { trade: "flooring", weight: CONTEXT, terms: ["floor", "floors", "subfloor prep"] },
  {
    trade: "finish_carpentry",
    weight: TYPICAL,
    terms: [
      "baseboard", "base board", "casing", "crown", "crown molding", "molding",
      "moulding", "trim", "millwork", "cabinet", "cabinets", "cabinetry",
      "vanity", "shelving", "closet system", "built-in", "built in",
      "interior door", "door slab", "prehung", "pre-hung", "stair tread",
      "handrail", "railing", "newel", "wainscot", "chair rail", "door hardware",
      "countertop", "counter top",
    ],
  },
  {
    trade: "painting",
    weight: EXCLUSIVE,
    terms: ["primer", "topcoat", "sheen", "eggshell", "semi-gloss", "caulk and paint", "drop cloth", "paint finish"],
  },
  {
    trade: "exterior",
    weight: EXCLUSIVE,
    terms: ["siding", "cladding", "exterior door", "window unit", "window install", "deck board", "railing post", "fence", "landscap", "hardie"],
  },
  { trade: "exterior", weight: CONTEXT, terms: ["window", "windows", "deck"] },
  {
    trade: "demolition",
    weight: TYPICAL,
    terms: ["demolition", "debris removal", "haul away", "dumpster"],
  },
  {
    trade: "general_conditions",
    weight: TYPICAL,
    terms: [
      "general conditions", "mobilization", "permit", "supervision",
      "final clean", "cleanup", "clean up", "dust protection", "floor protection",
      "temporary power", "port a potty", "service call",
    ],
  },
  {
    trade: "specialty",
    weight: TYPICAL,
    terms: ["appliance", "specialty equipment", "solar", "elevator", "security system"],
  },
];

/* ------------------------------------------------------------------ *
 * 3. Scoring
 * ------------------------------------------------------------------ */

/** Score at or above which a single trade is trustworthy on its own. */
const HIGH_SCORE = 7;
const MEDIUM_SCORE = 4;
/**
 * A runner-up within this margin of the leader means the line carries real
 * evidence for two trades and must not be forced into one.
 */
const AMBIGUITY_GAP = 8;
/** ...but only when the runner-up is real evidence, not a context noun. */
const AMBIGUITY_FLOOR = 7;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Erase quality-level wording so it can never be read as work. */
export function stripQualityWording(text: string): string {
  let out = normalize(text);
  for (const re of QUALITY_PHRASES) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

/** Does the wording describe an action at all, or only a selection/level? */
export function hasWorkIntent(text: string): boolean {
  const t = stripQualityWording(text);
  if (!t) return false;
  return ACTION_VERBS.some((v) => new RegExp(`\\b${v}`).test(t));
}

/**
 * Classify a scope line into a canonical labor trade using action + object +
 * vocabulary precedence.
 *
 * Returns `trade: null` whenever the wording does not decide, which is the
 * behaviour the review UX depends on: no verdict means no finding.
 */
export function classifyTrade(
  ...parts: Array<string | null | undefined>
): TradeClassification {
  const raw = parts.filter(Boolean).join(" ");
  const text = stripQualityWording(raw);
  if (!text) return NONE;

  const scores = new Map<LaborTradeKey, number>();
  /* Trades backed by an action or a trade-exclusive noun, not by context. */
  const strong = new Set<LaborTradeKey>();
  const evidence: string[] = [];
  const add = (trade: LaborTradeKey, weight: number, phrase: string) => {
    scores.set(trade, (scores.get(trade) ?? 0) + weight);
    if (weight >= EXCLUSIVE) strong.add(trade);
    evidence.push(phrase);
  };

  /* Actions first — they are what the contractor is being paid to do. */
  for (const rule of ACTION_RULES) {
    if (rule.negations?.some((re) => re.test(text))) continue;
    const hit = rule.patterns.find((re) => re.test(text));
    if (!hit) continue;
    add(rule.trade, rule.weight, `action:${rule.trade}`);
  }

  /* Objects second — exclusive nouns confirm, shared nouns only tint. */
  for (const rule of OBJECT_RULES) {
    for (const term of rule.terms) {
      if (!text.includes(term)) continue;
      add(rule.trade, rule.weight, `object:${term}`);
      break;
    }
  }

  const candidates = [...scores.entries()]
    .map(([trade, score]) => ({ trade, score }))
    .sort((a, b) => b.score - a.score || LABOR_TRADES.indexOf(a.trade) - LABOR_TRADES.indexOf(b.trade));

  if (!candidates.length) return { ...NONE, evidence: [] };

  const top = candidates[0]!;
  const runnerUp = candidates[1];

  /*
   * A line with no action verb at all is a selection, an allowance note or a
   * heading — never a trade assignment. "Premium countertop level" lands here.
   */
  if (!hasWorkIntent(raw) && top.score < HIGH_SCORE) {
    return { trade: null, confidence: "none", ambiguous: false, candidates, evidence };
  }

  /*
   * Two trades are only "mixed" when BOTH stand on their own evidence and
   * neither clearly leads. A strong trade plus a passing context noun is not
   * ambiguity, it is a normal sentence.
   */
  const ambiguous =
    !!runnerUp &&
    strong.has(top.trade) &&
    strong.has(runnerUp.trade) &&
    runnerUp.score >= AMBIGUITY_FLOOR &&
    top.score - runnerUp.score <= AMBIGUITY_GAP;

  if (ambiguous) {
    /* Two real trades in one line: report both, force neither. */
    return { trade: top.trade, confidence: "low", ambiguous: true, candidates, evidence };
  }

  const confidence: TradeConfidence =
    top.score >= HIGH_SCORE ? "high" : top.score >= MEDIUM_SCORE ? "medium" : "low";

  return { trade: top.trade, confidence, ambiguous: false, candidates, evidence };
}

/**
 * The trade this wording points at, or null when it does not decide.
 * `minConfidence` lets a caller demand certainty: the validation gate asks for
 * `high` so it only speaks up about things it is sure of.
 */
export function inferTradeKey(
  text: string | null | undefined,
  description?: string | null,
  minConfidence: TradeConfidence = "medium",
): LaborTradeKey | null {
  const result = classifyTrade(text, description);
  if (result.ambiguous) return null;
  const rank: Record<TradeConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
  if (rank[result.confidence] >= rank[minConfidence]) return result.trade;
  /*
   * Legacy keyword matching stays as the floor, never as the authority: it
   * only answers where the precedence model declined to.
   */
  if (rank[minConfidence] <= rank.medium && hasWorkIntent(`${text ?? ""} ${description ?? ""}`)) {
    const legacy = normalizeTradeKey(`${text ?? ""} ${description ?? ""}`.trim());
    return legacy === UNASSIGNED_TRADE ? null : legacy;
  }
  return null;
}

/**
 * The trade an item should be grouped under: an existing canonical assignment
 * always wins, and inference only fills a genuine blank. Nothing here ever
 * overwrites a trade a contractor (or the catalog) already chose.
 */
export function resolveTradeKey(
  assignedRaw: string | null | undefined,
  title?: string | null,
  description?: string | null,
): LaborTradeKey {
  const assigned = normalizeTradeKey(assignedRaw);
  if (assigned !== UNASSIGNED_TRADE) return assigned;
  return inferTradeKey(title, description, "medium") ?? UNASSIGNED_TRADE;
}
