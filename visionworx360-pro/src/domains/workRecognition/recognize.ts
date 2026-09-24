import type { ActionKey, RecognizedAction, RecognizedExclusion } from "./types";
import { WORK_PATTERNS, type WorkPattern } from "./patterns";

/**
 * Intent recognition: clauses -> (action, subject, stated count).
 *
 * The recognizer never prices and never guesses a quantity. It answers one
 * question per clause: "did the contractor ask for this work, and with what
 * verb?" Quantity resolution is a separate stage so the authority hierarchy
 * stays in exactly one place.
 */

/** Split on sentence ends, commas, and coordinating conjunctions. */
export function splitClauses(text: string): string[] {
  return (text ?? "")
    .split(/(?<=[.!?;])\s+|,\s+|\s+\band\s+|\s+\bthen\s+|\s+\by\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

const ACTION_RULES: Array<{ action: ActionKey; match: RegExp }> = [
  {
    action: "replace",
    match:
      /\b(replace|replacing|replacement|swap(ped|ping)?\s*out|reemplaz\w+|sustitu\w+)\b|\b(tear|rip|take|pull)\s+out\b[^.]*\b(and|then)\b[^.]*\b(new|install)\b/i,
  },
  { action: "refinish", match: /\b(refinish|resurface|sand\s+and\s+(stain|seal)|relijar)\b/i },
  { action: "paint", match: /\b(paint(ing)?|repaint|prime and paint|pintar|repintar)\b/i },
  { action: "relocate", match: /\b(relocat\w+|move|moved|moving|raise|raised|raising|reroute|shift|mover|reubicar)\b/i },
  { action: "repair", match: /\b(repair|patch|fix|reparar|arreglar)\b/i },
  {
    /* A rebuild is constructive work, so it is read before the demolition verb
       that usually shares the sentence ("demo the old deck and rebuild it"). */
    action: "build",
    match: /\b(re-?build(s|ing)?|re-?construct(s|ing)?|reconstruir)\b/i,
  },
  {
    action: "remove",
    match:
      /\b(remove|removal|demo(s|ing|ed)?|demolish|demolition|tear\s+(out|down)|rip\s+out|haul\s+away|quitar|demoler)\b/i,
  },
  { action: "install", match: /\b(insulat(e|es|ing)|hang(ing)? drywall|sheetrock(ing)?)\b/i },
  { action: "build", match: /\b(build|building|frame|framing|construct|pour|construir)\b/i },
  { action: "modify", match: /\b(modify|widen|enlarge|extend|reconfigur\w+|modificar)\b/i },
  {
    action: "install",
    match:
      /\b(add|adding|install\w*|new|put\s+in|hang|set|run\s+(new\s+)?|agregar|añadir|instalar|nuev[oa])\b/i,
  },
];

export function detectAction(clause: string, fallback: ActionKey): RecognizedAction {
  for (const rule of ACTION_RULES) {
    const hit = clause.match(rule.match);
    if (hit) return { action: rule.action, evidence: hit[0].trim(), isDefault: false };
  }
  return { action: fallback, evidence: "", isDefault: true };
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
};

/**
 * A count stated immediately before the subject: "six windows", "(3) doors",
 * "3 new outlets". A number separated from the subject by a unit ("8 foot
 * wall") is a dimension, not a count, and is ignored here.
 */
export function statedCount(clause: string, subject: RegExp): number | null {
  const hit = clause.match(new RegExp(subject.source, "i"));
  if (!hit || hit.index === undefined) return null;
  const before = clause.slice(0, hit.index);
  if (/\b(foot|feet|ft|inch|inches|'|")\s*$/i.test(before)) return null;
  /* A size is not a count: "a 10x14 deck" is one stated dimension pair, not
     "1 deck" — and certainly not a quantity that outranks an actioned clause. */
  if (/\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot)?\s*$/i.test(before)) {
    return null;
  }
  /* Scan back up to three words; the nearest number wins. */
  const words = before.trim().split(/\s+/).slice(-3).reverse();
  for (const word of words) {
    const token = word.replace(/[()]/g, "").toLowerCase();
    const numeric = /^\d{1,3}$/.test(token)
      ? Number(token)
      : NUMBER_WORDS[token];
    if (!numeric) continue;
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 200) return null;
    return numeric;
  }
  return null;
}



/** A length stated anywhere in the clause: "40 feet of wire", "12 ft of pipe". */
export function statedLength(clause: string): number | null {
  const hit = clause.match(/(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot|linear feet|lf)\b/i);
  if (!hit) return null;
  const value = Number(hit[1]);
  return Number.isFinite(value) && value > 0 && value < 5000 ? value : null;
}

/**
 * A length stated for THIS subject only.
 *
 * Scanning the whole transcript for any length let one trade's measurement
 * become another trade's priced quantity: a "26 foot LVL" silently became
 * 26 linear feet of built-in bookcases. A dimension is evidence for the work
 * it was spoken about, so only sentences that also name the subject count.
 */
/** "six foot" -> "6 foot", so spoken dimensions read like typed ones. */
function spokenNumbersToDigits(text: string): string {
  return text.replace(/\b[a-zá-ú]+\b/gi, (word) => {
    const value = NUMBER_WORDS[word.toLowerCase()];
    return value ? String(value) : word;
  });
}

export function statedLengthForSubject(text: string, subject: RegExp): number | null {
  const sentences = String(text ?? "")
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const re = new RegExp(subject.source, "i");
  for (const sentence of sentences) {
    if (!re.test(sentence)) continue;
    /* Contractors speak dimensions as words: "about six foot length of wall". */
    const length = statedLength(spokenNumbersToDigits(sentence));
    if (length !== null) return length;
  }
  return null;
}

/* --------------------------------------------------------- exclusions */

const EXCLUSION_TRIGGER =
  /\b(no|not|without|excluding|exclude[sd]?|skip(ping)?|leave|leaving|keep(ing)?|reuse|reusing|don'?t|do not|homeowner (will|is)|owner (will|is)|customer (will|is)|by others|sin|excluyendo)\b/i;

/** Subject -> the work-type prefixes an exclusion suppresses. */
const EXCLUSION_SUBJECTS: Array<{ id: string; label: string; match: RegExp; suppresses: string[] }> =
  [
    { id: "painting", label: "Painting", match: /paint(ing)?|pintura/i, suppresses: ["paint."] },
    { id: "flooring", label: "Flooring", match: /floor(ing)?|piso/i, suppresses: ["flooring."] },
    {
      id: "demolition",
      label: "Demolition",
      match: /demo(lition)?|tear[- ]out/i,
      suppresses: ["demolition."],
    },
    {
      id: "electrical",
      label: "Electrical",
      match: /electric(al)?|outlets?|wiring/i,
      suppresses: ["electrical."],
    },
    {
      id: "plumbing",
      label: "Plumbing",
      match: /plumb(ing)?|sink|toilet|fixtures?/i,
      suppresses: ["plumbing."],
    },
    { id: "roofing", label: "Roofing", match: /roof(ing)?/i, suppresses: ["roofing."] },
    { id: "siding", label: "Siding", match: /siding/i, suppresses: ["siding."] },
    { id: "windows", label: "Windows", match: /windows?/i, suppresses: ["windows."] },
    { id: "doors", label: "Doors", match: /doors?/i, suppresses: ["doors."] },
    { id: "railing", label: "Railing", match: /rail(ing)?s?/i, suppresses: ["deck.railing"] },
    { id: "stairs", label: "Stairs", match: /stairs?|steps?/i, suppresses: ["deck.stairs"] },
    { id: "ceilings", label: "Ceilings", match: /ceilings?/i, suppresses: ["paint.ceilings"] },
    { id: "trim", label: "Trim", match: /trim|baseboards?/i, suppresses: ["trim."] },
    { id: "hvac", label: "HVAC", match: /hvac|duct(work)?|furnace/i, suppresses: ["hvac."] },
    { id: "drywall", label: "Drywall", match: /drywall|sheetrock/i, suppresses: ["drywall."] },
    { id: "permits", label: "Permits", match: /permits?/i, suppresses: ["permit."] },
  ];

export function detectExclusions(text: string): RecognizedExclusion[] {
  const found = new Map<string, RecognizedExclusion>();
  for (const clause of splitClauses(text)) {
    if (!EXCLUSION_TRIGGER.test(clause)) continue;
    for (const subject of EXCLUSION_SUBJECTS) {
      if (!subject.match.test(clause)) continue;
      if (found.has(subject.id)) continue;
      found.set(subject.id, {
        id: subject.id,
        label: subject.label,
        suppresses: subject.suppresses,
        evidence: clause,
      });
    }
  }
  return [...found.values()];
}

/* ------------------------------------------------------- candidates */

export interface WorkCandidate {
  pattern: WorkPattern;
  clause: string;
  action: RecognizedAction;
  statedCount: number | null;
  /** A length stated in the same clause ("run 40 feet of wire"). */
  statedLengthFt: number | null;
  /** Subject matched but no action was stated -> observation, never priced. */
  isObservationOnly: boolean;
}

export function recognizeCandidates(text: string): WorkCandidate[] {
  const clauses = splitClauses(text);
  const candidates: WorkCandidate[] = [];

  for (const clause of clauses) {
    for (const pattern of WORK_PATTERNS) {
      if (!pattern.subject.test(clause)) continue;
      if (pattern.disqualifiers?.test(clause)) continue;
      if (pattern.requirePhrase && !pattern.requirePhrase.test(clause)) continue;
      const action = detectAction(clause, pattern.defaultAction);
      /* Some task families only exist under a specific verb: demolition is
         only demolition when removal was actually requested. */
      if (pattern.requiredActions && !pattern.requiredActions.includes(action.action)) continue;
      const isObservationOnly = pattern.requireAction && action.isDefault;
      candidates.push({
        pattern,
        clause,
        action,
        statedCount: statedCount(clause, pattern.subject),
        statedLengthFt: statedLength(clause),
        isObservationOnly,
      });
    }
  }

  return candidates;
}
