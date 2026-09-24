/**
 * GENERIC WORK KNOWLEDGE — taxonomy layer.
 *
 * This module is the *library*, never the project. It knows what kinds of work
 * exist in residential construction and how to recognise them in evidence. It
 * holds NO project state: no answers, no selected fields, no quantities, no
 * remembered values from a previous job. Everything here is pure and
 * stateless, which is what makes "the next unseen project" work without a new
 * bugfix or another `if (projectName === ...)` branch.
 */

export type WorkDomain =
  /* Site & exterior */
  | "sitework"
  | "excavation"
  | "planting"
  | "concrete"
  | "roofing"
  /* Shell & structure */
  | "demolition"
  | "structure"
  | "framing"
  | "room_conversion"
  | "insulation"
  | "openings"
  /* Interior finishes */
  | "drywall"
  | "paint"
  | "finish_carpentry"
  | "cabinets"
  | "countertops"
  | "flooring"
  | "tile"
  | "waterproofing"
  | "closet"
  /* MEP */
  | "electrical"
  | "plumbing"
  | "hvac"
  /* Rooms that carry their own question sets */
  | "bath"
  | "kitchen";

export const ALL_WORK_DOMAINS: WorkDomain[] = [
  "sitework", "excavation", "planting", "concrete", "roofing",
  "demolition", "structure", "framing", "room_conversion", "insulation", "openings",
  "drywall", "paint", "finish_carpentry", "cabinets", "countertops", "flooring",
  "tile", "waterproofing", "closet",
  "electrical", "plumbing", "hvac",
  "bath", "kitchen",
];

/** Anything that can evidence work: a scope item, line item or feature key. */
export interface ScopeSignal {
  key?: string | null;
  title?: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  description?: string | null;
  /** Where this signal came from, for provenance. */
  source?: ScopeEvidenceSource;
}

export type ScopeEvidenceSource =
  | "scope_item"
  | "narrative"
  | "grounded"
  | "replay"
  | "measurement"
  | "project_name"
  /** Words the contractor spoke during a walkthrough / video narration. */
  | "spoken_narration"
  /**
   * Something a model or a person SAW in project media. An observation of
   * existing conditions is never, on its own, an instruction to do work.
   */
  | "visual_observation";

/**
 * Recognition rules. Deliberately data — adding a trade is a row here, not a
 * branch in a component.
 */
export const DOMAIN_PATTERNS: Array<{ domain: WorkDomain; pattern: RegExp }> = [
  { domain: "planting", pattern: /\b(tree|shrub|planting|plant a|sapling|root ?ball|rootball|nursery stock|b&b|balled|landscap\w*|sod|mulch|irrigation|staking)\b/ },
  { domain: "excavation", pattern: /\b(excavat\w*|dig|digging|trench\w*|auger|backfill|spoils|soil (removal|amendment)|grading|haul[- ]?off)\b/ },
  { domain: "sitework", pattern: /\b(site ?work|driveway|walkway|retaining wall|drainage|hardscape|utility locate|811|rough grading|final grading|regrade)\b/ },
  { domain: "concrete", pattern: /\b(concrete|slab|footing|pier|pour|rebar|form(work|s)?)\b/ },
  { domain: "roofing", pattern: /\b(roof\w*|shingle|underlayment sheet|flashing|ridge vent|soffit|fascia)\b/ },

  { domain: "demolition", pattern: /\b(demo|demolition|demolish|tear ?out|remove (the )?(wall|closet|cabinet|tile|fixture)|gut)\b/ },
  { domain: "structure", pattern: /\b(structural|beam|lvl|glulam|header|load[- ]bearing|bearing wall|shoring|temporary support|post|column support|engineer\w*|foundation)\b/ },
  { domain: "framing", pattern: /\b(framing|frame|stud wall|joist|rafter|blocking|sister|rough carpentry)\b/ },
  { domain: "room_conversion", pattern: /\b(conversion|convert|adu|addition|finish(ed)? (out|basement|attic|garage)|new room|garage conversion)\b/ },
  { domain: "insulation", pattern: /\b(insulat\w*|batts?|blown|r-\d+)\b/ },
  { domain: "openings", pattern: /\b(exterior door|interior door|new door|window|rough opening|jamb|casing)\b/ },

  { domain: "drywall", pattern: /\b(drywall|sheetrock|gypsum|texture|patch(ing)?|ceiling repair)\b/ },
  { domain: "paint", pattern: /\b(re[- ]?paint\w*|paint\w*|primer|caulk|stain)\b/ },
  { domain: "finish_carpentry", pattern: /\b(finish carpentry|trim|baseboard|crown|bookcase|book shelf|bookshel\w*|built[- ]?in|column|wainscot|mantel|shelving unit)\b/ },
  { domain: "cabinets", pattern: /\b(cabinet|cabinetry|vanity|kitchen island|casework|filler panel)\b/ },
  { domain: "countertops", pattern: /\b(countertop|counter top|quartz|granite|solid surface|backsplash)\b/ },
  { domain: "flooring", pattern: /\b(floor(ing)?|lvp|hardwood|carpet|floor underlayment|subfloor)\b/ },
  { domain: "tile", pattern: /\b(tile|tiling|grout|thinset|mosaic)\b/ },
  { domain: "waterproofing", pattern: /\b(waterproof\w*|shower pan|membrane|vapor barrier|kerdi|redgard)\b/ },
  { domain: "closet", pattern: /\b(closet|wardrobe|pantry)\b/ },

  { domain: "electrical", pattern: /\b(electric\w*|outlet|receptacle|circuit|panel|lighting|light fixture|recessed|switch|gfci)\b/ },
  { domain: "plumbing", pattern: /\b(plumb\w*|sink|faucet|drain|supply line|water heater|shower valve|toilet|bathtub|tub|lavatory|rough[- ]in)\b/ },
  { domain: "hvac", pattern: /\b(hvac|mini[- ]?split|duct\w*|furnace|air handler|exhaust fan|ventilation)\b/ },

  { domain: "bath", pattern: /\b(bath(room)?|shower|tub|toilet|lavatory|powder room)\b/ },
  { domain: "kitchen", pattern: /\b(kitchen|range hood|dishwasher|sink cutout)\b/ },
];

/** Canonical trade key -> domain. Structured scope beats text every time. */
export const TRADE_DOMAIN: Record<string, WorkDomain> = {
  cabinetry: "cabinets",
  millwork: "finish_carpentry",
  countertops: "countertops",
  flooring: "flooring",
  tile: "tile",
  drywall: "drywall",
  painting: "paint",
  paint: "paint",
  insulation: "insulation",
  framing: "framing",
  rough_carpentry: "framing",
  finish_carpentry: "finish_carpentry",
  carpentry: "finish_carpentry",
  doors_windows: "openings",
  electrical: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  mechanical: "hvac",
  structural: "structure",
  concrete: "concrete",
  demolition: "demolition",
  sitework: "sitework",
  landscape: "planting",
  landscaping: "planting",
  excavation: "excavation",
  roofing: "roofing",
  waterproofing: "waterproofing",
};

/**
 * Phrase neutralisation. A cabinet DOOR is not an openings-trade door, a
 * countertop SINK CUTOUT is not plumbing scope, and "tree of life tile" is not
 * a tree. Noise is scrubbed before matching so one trade never drags another
 * trade's questions into the interview.
 */
const NOISE: Array<[RegExp, string]> = [
  [/\bcabinet(ry)?[\s-]+(door|drawer|hardware|front|panel)s?\b/g, "cabinet"],
  [/\bshower\s+door\b/g, "shower"],
  [/\bpocket\s+door\s+hardware\b/g, "hardware"],
  [/\btree\s+of\s+life\b/g, "decor"],
];

/*
 * GENERIC QUALIFIER GRAMMAR — not a phrase deny-list.
 *
 * A trade word is only work when it names the thing being worked on. The same
 * word used as a QUALIFIER ("mid grade materials", "countertop level finish",
 * "counter height outlets", "builder grade") describes quality, position or
 * dimension, and must never open a trade. Two shape rules cover that across
 * every trade, so a new adjective or a new trade never needs a new entry:
 *
 *   1. <quality adjective> + <word>      -> "mid grade", "builder grade"
 *   2. <word> + <measure/quality noun>   -> "countertop level", "counter height"
 */
const QUALITY_ADJECTIVES =
  "builder|mid|middle|contractor|standard|premium|luxury|high|low|economy|entry|top|base|upgraded|basic";
/** Nouns that turn the preceding word into a measurement or quality label. */
const QUALIFIER_NOUNS = "grade|level|tier|quality|height|depth|end|class";

const QUALIFIER_USES: RegExp[] = [
  new RegExp(`\\b(${QUALITY_ADJECTIVES})[\\s-]?(${QUALIFIER_NOUNS})\\b`, "g"),
  new RegExp(`\\b[a-z]+[\\s-](${QUALIFIER_NOUNS})\\b(?!\\s+(install|replace|repair|demo))`, "g"),
  /\bgrade[\s-]?(a|b|1|2)\b/g,
  /\b(at|above|below|over|under)( the)? [a-z]+s\b/g,
  /\beasy access\b/g,
  /\bto grade\b/g,
];

/**
 * Strip qualifier uses so a common adjective can never open a trade. Kept as
 * an exported name because callers and tests depend on it.
 */
export function scrubNonWorkPhrases(text: string): string {
  let out = text;
  for (const pattern of QUALIFIER_USES) out = out.replace(pattern, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Verbs that express work intent. Prose evidence needs an action AND an
 * object before it can corroborate a trade on its own; without one it stays
 * weak and never opens an interview by itself.
 *
 * The list is generic trade vocabulary, and an optional `re-` prefix is built
 * in ("repaint", "re-tile"), so a trade never needs its own entry.
 */
const ACTION_VERBS =
  /\b(re-?)?(install|replace|repair|remove|demo|demolish|gut|build|frame|paint|tile|pour|patch|finish|add|convert|rebuild|refinish|seal|insulate|wire|plumb|hang|set|mount|grade|excavate|dig|auger|roof|resurface|texture|sand|prime|trim|move|relocate|upgrade|renovate|remodel|restore|extend|enclose|waterproof|level|plant|stake|amend|mulch|haul|run|connect|cut|stain|caulk|clean|swap|fix|place|apply|pull|tie|drill)\w*\b/;

/**
 * Noun-phrase work intent: a contractor routinely writes a line as a scope of
 * supply with no verb at all ("new vanity, toilet and exhaust fan"). A
 * determiner of provision is therefore intent too — but only that small,
 * generic set, so a bare noun ("nice countertops in the photo") still cannot
 * open a trade.
 */
const PROVISION_MARKERS = /\b(new|additional|replacement|extra)\s+[a-z]/;

export function hasWorkIntent(text: string): boolean {
  /* Scrub first: "mid grade" must not read as the verb "grade". */
  const scrubbed = scrubNonWorkPhrases(text.toLowerCase());
  return ACTION_VERBS.test(scrubbed) || PROVISION_MARKERS.test(scrubbed);
}


/**
 * Strip simple English plurals so a singular lexicon entry still matches
 * "cabinets", "windows", "countertops". Trade-agnostic: no per-domain rules,
 * and words shorter than four letters are left alone ("gas", "its").
 */
export function depluralize(text: string): string {
  return text.replace(/\b([a-z]{3,}?)(ies|es|s)\b/g, (_m, stem: string, suffix: string) => {
    if (suffix === "ies") return `${stem}y`;
    return stem;
  });
}


export function normalizeSignalText(signal: ScopeSignal): string {
  let text = [signal.key, signal.title, signal.categoryKey, signal.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const [pattern, replacement] of NOISE) text = text.replace(pattern, replacement);
  return scrubNonWorkPhrases(text);
}

/**
 * Corroboration strength.
 *
 * `strong`  — the domain is backed by structured scope (a trade key or a scope
 *             row) or by more than one independent mention.
 * `weak`    — a single prose mention only (narrative sentence or project
 *             name). Enough to remember, never enough on its own to open an
 *             interview for a trade the job may not contain.
 */
export type DomainStrength = "strong" | "weak";

/**
 * Sources that are structured enough to stand alone.
 *
 * Structured rows carry a trade key or an explicit scope row, so a noun is
 * enough: the contractor already filed it under a trade. FREE PROSE is not in
 * this set. A narrative sentence or a project name is a description, and a
 * lone noun inside one ("nice countertops in the photo") must never open a
 * trade, so prose is additionally required to express work intent before it
 * can match at all.
 */
const STRUCTURED_SOURCES = new Set<ScopeEvidenceSource>([
  "scope_item",
  "grounded",
  "measurement",
  "replay",
]);

/** Sources that are free prose and therefore need action + object to count. */
const PROSE_SOURCES = new Set<ScopeEvidenceSource>([
  "narrative",
  "project_name",
  "spoken_narration",
  "visual_observation",
]);

/**
 * Sources that describe what EXISTS rather than what the contractor wants done.
 * A visible lawn does not open landscaping; a visible panel does not open
 * electrical. Observations may corroborate stated scope, never create it — so
 * they can never be the sole justification for a domain.
 */
const OBSERVATION_SOURCES = new Set<ScopeEvidenceSource>(["visual_observation"]);

export function isObservationSource(source: ScopeEvidenceSource): boolean {
  return OBSERVATION_SOURCES.has(source);
}



export interface DomainEvidence {
  domain: WorkDomain;
  /** Why this domain is considered in scope on THIS project. */
  evidence: string;
  source: ScopeEvidenceSource;
  matchedBy: "trade" | "text";
  /** Whether the current evidence corroborates the domain. */
  strength: DomainStrength;
  /** How many independent signals mentioned this domain. */
  hits: number;
  /**
   * True when at least one non-observation source (a scope row, a written or
   * spoken instruction) put this domain in play. Observation-only domains are
   * context, never scope.
   */
  stated: boolean;
}

/**
 * Classify CURRENT evidence into work domains, keeping the evidence that
 * justified each one. Provenance is a first-class output: a question that
 * cannot name the scope item that justifies it must not be asked.
 */
export function classifyWorkDomains(signals: ScopeSignal[]): DomainEvidence[] {
  const order: WorkDomain[] = [];
  const acc = new Map<
    WorkDomain,
    {
      evidence: string;
      source: ScopeEvidenceSource;
      matchedBy: "trade" | "text";
      hits: number;
      structured: boolean;
      stated: boolean;
    }
  >();

  const push = (
    domain: WorkDomain,
    evidence: string,
    source: ScopeEvidenceSource,
    matchedBy: "trade" | "text",
  ) => {
    /*
     * A narrative line only reaches this point when it cleared the work-intent
     * gate (action + recognized object), so it IS a work instruction and
     * stands on its own — "re-tile floor and walls" needs no second mention.
     * Spoken walkthrough narration is the same instruction in a different
     * medium. A project NAME never qualifies, and neither does a VISUAL
     * observation: seeing a thing is not being told to work on it.
     */
    const observed = OBSERVATION_SOURCES.has(source);
    const structured =
      !observed &&
      (matchedBy === "trade" ||
        STRUCTURED_SOURCES.has(source) ||
        source === "narrative" ||
        source === "spoken_narration");

    const existing = acc.get(domain);
    if (!existing) {
      order.push(domain);
      acc.set(domain, { evidence, source, matchedBy, hits: 1, structured, stated: !observed });
      return;
    }
    existing.hits += 1;
    existing.structured = existing.structured || structured;
    existing.stated = existing.stated || !observed;
    if (!STRUCTURED_SOURCES.has(existing.source) && structured) {
      existing.evidence = evidence;
      existing.source = source;
      existing.matchedBy = matchedBy;
    }
  };

  for (const signal of signals) {
    const source = signal.source ?? "scope_item";
    const trade = signal.tradeKey ? TRADE_DOMAIN[signal.tradeKey] : undefined;
    if (trade) push(trade, signal.title ?? signal.tradeKey ?? "", source, "trade");
    /*
     * Qualifier scrubbing happens inside `normalizeSignalText`, so a word used
     * as a quality/measurement label ("mid grade", "counter height") is gone
     * before any trade pattern sees it.
     *
     * Free prose then has to clear a second bar: an action verb must be present
     * ("install countertops", "replace roof shingles"), otherwise a passing
     * noun in a sentence or a project name cannot open a trade at all. A row
     * the contractor filed under a trade needs no verb — the filing IS the
     * intent — so structured sources skip this check.
     */
    const text = normalizeSignalText(signal);
    if (!text) continue;
    if (PROSE_SOURCES.has(source) && !hasWorkIntent(text)) continue;

    /*
     * Trade nouns are written in the plural constantly ("cabinets", "windows",
     * "countertops"). The lexicon stores singulars with word boundaries, so a
     * plural would silently miss its own trade. Matching therefore runs against
     * both the text and a de-pluralized copy — generic, so no trade needs its
     * own hand-written plural rule.
     */
    const singular = depluralize(text);
    for (const { domain, pattern } of DOMAIN_PATTERNS) {
      if (pattern.test(text) || pattern.test(singular)) {
        push(domain, signal.title ?? text.slice(0, 120), source, "text");
      }
    }

  }



  return order.map((domain) => {
    const e = acc.get(domain)!;
    return {
      domain,
      evidence: e.evidence,
      source: e.source,
      matchedBy: e.matchedBy,
      hits: e.hits,
      stated: e.stated,
      /* An observation-only domain can never be strong: it is context. */
      strength: (e.stated && (e.structured || e.hits > 1) ? "strong" : "weak") as DomainStrength,
    };
  });
}

/** Domains only, in a stable order. */
export function deriveWorkDomains(signals: ScopeSignal[]): WorkDomain[] {
  return classifyWorkDomains(signals).map((e) => e.domain);
}

/**
 * Domains the current evidence actually corroborates. Falls back to every
 * matched domain when NOTHING is corroborated, so a prose-only project (a
 * single narrative sentence) still gets its interview instead of a clarifier.
 *
 * Observation-only domains are excluded from BOTH paths: what a camera saw is
 * never on its own a reason to ask questions, add measurements or price work.
 */
export function corroboratedDomains(evidence: DomainEvidence[]): WorkDomain[] {
  const stated = evidence.filter((e) => e.stated);
  const strong = stated.filter((e) => e.strength === "strong");
  return (strong.length > 0 ? strong : stated).map((e) => e.domain);
}
