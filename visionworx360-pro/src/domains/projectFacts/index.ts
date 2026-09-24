/**
 * Canonical project facts — the single source of truth for "what do we
 * already know about this project?".
 *
 * Every intake/clarification entry point (Scope of Work -> Answer More
 * Questions, Estimate -> More Options -> Full Interview, the guided ballpark
 * intake and the photo clarification path) resolves against THIS module before
 * it is allowed to display a question. There is exactly one questionnaire
 * brain: a fact known here suppresses the matching question everywhere.
 *
 * Facts are semantic keys ("insulation.walls"), never display strings, so
 * rewording a prompt can never make an answered question reappear.
 */

export type ProjectFactSource =
  | "geometry"
  | "scope"
  | "narrative"
  | "answer"
  | "assumption";

export interface KnownFact {
  key: string;
  value: string | number | boolean;
  source: ProjectFactSource;
}

export interface CanonicalProjectFacts {
  /** Lowercased haystack of every persisted textual fact. */
  text: string;
  /** True when project measurements/geometry are persisted. */
  hasGeometry: boolean;
  facts: Record<string, KnownFact>;
}

export interface FactGeometry {
  lengthFt?: number | null;
  widthFt?: number | null;
  ceilingHeightFt?: number | null;
  interiorPartitionLf?: number | null;
  openings?: unknown[] | null;
}

export interface FactScopeItem {
  title: string;
  materialSelection?: string | null;
  customerNotes?: string | null;
  isIncluded?: boolean;
}

/** A persisted interview answer, in the shape the ballpark session stores. */
export interface FactAnswer {
  status?: string;
  value?: unknown;
}

export interface ProjectFactInput {
  projectName?: string | null;
  items?: FactScopeItem[];
  narrativeText?: string | null;
  geometry?: FactGeometry | null;
  /** Persisted ballpark interview answers, keyed by question id. */
  priorAnswers?: Record<string, FactAnswer | undefined> | null;
  /** Persisted narrative-scope answers, keyed by question id. */
  narrativeAnswers?: Record<string, string> | null;
  /** Ballpark derived assumptions already persisted on the estimate. */
  assumptions?: { key?: string | null; basis?: string | null }[] | null;
}

/* ------------------------------------------------------------------ */
/* Semantic fact keys                                                  */
/* ------------------------------------------------------------------ */

export const FACT_KEYS = {
  length: "dimensions.length",
  width: "dimensions.width",
  ceiling: "dimensions.ceiling",
  partitions: "partitions",
  doors: "openings.doors",
  windows: "openings.windows",
  bathroom: "bathroom",
  closet: "closet",
  raisedFloor: "floor.raised",
  insulationWalls: "insulation.walls",
  insulationCeiling: "insulation.ceiling",
  insulationFloor: "insulation.floor",
  drywall: "drywall",
  flooring: "flooring",
  plumbing: "plumbing",
  electrical: "electrical",
  finish: "finish.level",
  useOfSpace: "useOfSpace",
} as const;

/** Text evidence that a decision is already made, per semantic fact. */
const TEXT_EVIDENCE: { fact: string; re: RegExp }[] = [
  { fact: FACT_KEYS.bathroom, re: /bath|shower|toilet|vanity|lavabo|ba(n|ñ)o/ },
  { fact: FACT_KEYS.closet, re: /closet|clóset|wardrobe/ },
  { fact: FACT_KEYS.raisedFloor, re: /raised floor|subfloor|sub-floor|sleeper|floor system|piso elevado/ },
  { fact: FACT_KEYS.insulationWalls, re: /insulat[a-z]*[^.]{0,20}wall|wall[^.]{0,20}insulat|aisl[a-z]*[^.]{0,20}pared/ },
  { fact: FACT_KEYS.insulationCeiling, re: /insulat[a-z]*[^.]{0,20}(ceiling|attic|roof)|(ceiling|attic)[^.]{0,20}insulat|aisl[a-z]*[^.]{0,20}techo/ },
  { fact: FACT_KEYS.insulationFloor, re: /insulat[a-z]*[^.]{0,20}floor|floor[^.]{0,20}insulat|aisl[a-z]*[^.]{0,20}piso/ },
  { fact: FACT_KEYS.drywall, re: /drywall|sheetrock|gypsum|tablaroca|panel de yeso/ },
  { fact: FACT_KEYS.flooring, re: /hardwood|lvp|luxury vinyl|vinyl|tile|carpet|laminate|epoxy|polished concrete|flooring|floor covering|piso/ },
  { fact: FACT_KEYS.plumbing, re: /plumb|supply line|shut ?off|shutoff|water line|drain|fontaner|plomer/ },
  { fact: FACT_KEYS.electrical, re: /electric|circuit|receptacle|outlet|gfci|panel|subpanel|lighting|el(e|é)ctric/ },
  { fact: FACT_KEYS.finish, re: /builder grade|standard finish|premium|high.?end|mid.?grade|acabado/ },
  { fact: FACT_KEYS.useOfSpace, re: /bedroom|adu|office|studio|gym|suite|living space|guest room|conversion|rec(reation)? room|habitaci(o|ó)n|oficina/ },
  { fact: FACT_KEYS.doors, re: /\bdoors?\b|puerta/ },
  { fact: FACT_KEYS.windows, re: /\bwindows?\b|ventana/ },
  { fact: FACT_KEYS.partitions, re: /partition|framed? (a )?wall|new wall|interior wall|muro|tabique/ },
];

function push(parts: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) parts.push(value);
}

function record(
  facts: Record<string, KnownFact>,
  key: string,
  value: string | number | boolean,
  source: ProjectFactSource,
) {
  /* First writer wins: sources are added strongest-first (explicit answers and
     persisted geometry before inferred text evidence). */
  if (!facts[key]) facts[key] = { key, value, source };
}

/** Map a ballpark interview question id onto the semantic fact it asks about. */
export const BALLPARK_QUESTION_FACT: Record<string, string> = {
  lengthFt: FACT_KEYS.length,
  widthFt: FACT_KEYS.width,
  ceilingHeightFt: FACT_KEYS.ceiling,
  useOfSpace: FACT_KEYS.useOfSpace,
  bathroom: FACT_KEYS.bathroom,
  closet: FACT_KEYS.closet,
  partitions: FACT_KEYS.partitions,
  partitionLfKnown: FACT_KEYS.partitions,
  raisedFloor: FACT_KEYS.raisedFloor,
  insulationWalls: FACT_KEYS.insulationWalls,
  insulationCeiling: FACT_KEYS.insulationCeiling,
  insulationFloor: FACT_KEYS.insulationFloor,
  drywall: FACT_KEYS.drywall,
  flooringQuality: FACT_KEYS.flooring,
  plumbing: FACT_KEYS.plumbing,
  electrical: FACT_KEYS.electrical,
  newDoors: FACT_KEYS.doors,
  newWindows: FACT_KEYS.windows,
  finishLevel: FACT_KEYS.finish,
};

/** Higher = a bigger swing in scope or cost band; drives the 0-5 cap. */
const QUESTION_IMPACT: Record<string, number> = {
  lengthFt: 100,
  widthFt: 99,
  ceilingHeightFt: 80,
  useOfSpace: 92,
  bathroom: 90,
  plumbing: 88,
  electrical: 86,
  partitions: 78,
  partitionLfKnown: 40,
  raisedFloor: 72,
  drywall: 60,
  insulationWalls: 55,
  insulationCeiling: 54,
  insulationFloor: 53,
  flooringQuality: 58,
  newDoors: 45,
  newWindows: 44,
  closet: 35,
  finishLevel: 65,
};

/**
 * Resolve every persisted source into one fact set.
 *
 * Order matters: explicit answers and persisted geometry are recorded before
 * textual inference so provenance reports the strongest source.
 */
export function resolveProjectFacts(input: ProjectFactInput): CanonicalProjectFacts {
  const facts: Record<string, KnownFact> = {};
  const parts: string[] = [];

  /* 1. Prior interview answers — the contractor said it explicitly. */
  for (const [questionId, answer] of Object.entries(input.priorAnswers ?? {})) {
    if (!answer || answer.status !== "answered") continue;
    if (answer.value === null || answer.value === undefined || answer.value === "") continue;
    const factKey = BALLPARK_QUESTION_FACT[questionId] ?? `answer.${questionId}`;
    record(facts, factKey, answer.value as string | number | boolean, "answer");
    push(parts, String(answer.value));
  }

  /* 2. Narrative-scope answers (topic decisions). */
  for (const [id, value] of Object.entries(input.narrativeAnswers ?? {})) {
    if (!value?.trim()) continue;
    record(facts, `narrative.${id}`, value, "answer");
    push(parts, value);
  }

  /* 3. Persisted project geometry. */
  const g = input.geometry ?? null;
  const hasGeometry = !!(g && (g.lengthFt || g.widthFt));
  if (g?.lengthFt) record(facts, FACT_KEYS.length, g.lengthFt, "geometry");
  if (g?.widthFt) record(facts, FACT_KEYS.width, g.widthFt, "geometry");
  if (g?.ceilingHeightFt) record(facts, FACT_KEYS.ceiling, g.ceilingHeightFt, "geometry");
  if (g?.interiorPartitionLf) record(facts, FACT_KEYS.partitions, g.interiorPartitionLf, "geometry");
  if (Array.isArray(g?.openings) && g.openings.length > 0) {
    const openings = g.openings as { kind?: string; count?: number }[];
    const doors = openings.filter((o) => (o?.kind ?? "").toLowerCase().includes("door")).length;
    const windows = openings.filter((o) => (o?.kind ?? "").toLowerCase().includes("window")).length;
    if (doors > 0) record(facts, FACT_KEYS.doors, doors, "geometry");
    if (windows > 0) record(facts, FACT_KEYS.windows, windows, "geometry");
  }

  /* 4. Ballpark derived assumptions already persisted on the estimate. */
  for (const assumption of input.assumptions ?? []) {
    if (assumption?.key) record(facts, `assumption.${assumption.key}`, true, "assumption");
    push(parts, assumption?.basis ?? "");
  }

  /* 5. Structured scope + narrative prose. */
  for (const item of input.items ?? []) {
    if (item.isIncluded === false) continue;
    push(parts, item.title);
    push(parts, item.materialSelection);
    push(parts, item.customerNotes);
  }
  push(parts, input.narrativeText);
  push(parts, input.projectName);

  const text = parts.join(" \n ").toLowerCase();
  for (const evidence of TEXT_EVIDENCE) {
    if (evidence.re.test(text)) record(facts, evidence.fact, true, "scope");
  }

  return { text, hasGeometry, facts };
}

export function isFactKnown(facts: CanonicalProjectFacts, key: string): boolean {
  return Boolean(facts.facts[key]);
}

export interface EligibleQuestion {
  id: string;
  factKey: string;
  impact: number;
}

/**
 * Which interview questions are still worth asking.
 *
 * A question is suppressed when its semantic fact is already known from ANY
 * canonical source. Nothing is asked twice just because a modal reopened.
 */
export function eligibleBallparkQuestions(
  questionIds: string[],
  facts: CanonicalProjectFacts,
  limit = 5,
): EligibleQuestion[] {
  return questionIds
    .map((id) => ({
      id,
      factKey: BALLPARK_QUESTION_FACT[id] ?? `answer.${id}`,
      impact: QUESTION_IMPACT[id] ?? 10,
    }))
    .filter((q) => !isFactKnown(facts, q.factKey))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, limit);
}

export function eligibleBallparkQuestionIds(
  questionIds: string[],
  facts: CanonicalProjectFacts,
  limit = 5,
): string[] {
  return eligibleBallparkQuestions(questionIds, facts, limit).map((q) => q.id);
}

/**
 * Did the interview actually change a fact?
 *
 * Completing an interview without changing anything must NOT rewrite pricing:
 * that is what let a stale intake range overwrite the corrected, scope-derived
 * active ballpark.
 */
export function substantiveAnswerChanges(
  before: Record<string, FactAnswer | undefined> | null | undefined,
  after: Record<string, FactAnswer | undefined> | null | undefined,
): string[] {
  const changed: string[] = [];
  const normalize = (a: FactAnswer | undefined) =>
    a && a.status === "answered" && a.value !== null && a.value !== undefined
      ? String(a.value).trim().toLowerCase()
      : null;
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    const prev = normalize(before?.[key]);
    const next = normalize(after?.[key]);
    /* Clearing an answer is not a new fact; only new or altered values are. */
    if (next !== null && next !== prev) changed.push(key);
  }
  return changed.sort();
}

export function hasSubstantiveAnswerChange(
  before: Record<string, FactAnswer | undefined> | null | undefined,
  after: Record<string, FactAnswer | undefined> | null | undefined,
): boolean {
  return substantiveAnswerChanges(before, after).length > 0;
}
