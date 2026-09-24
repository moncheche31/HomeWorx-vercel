import { ROOM_RULES, WORK_RULES, localized, ruleLabelFor, workRuleFor, type WorkRule } from "./lexicon";
import { resolveActionKey } from "./actionVerb";
import { stripSpatialContext } from "./spatialContext";
import { admitScope } from "@/domains/scopeAdmission";
import { splitClauses } from "@/domains/workRecognition/recognize";
import { mergeEstimatorReading } from "./estimatorReading";


import {
  groundScope,
  reconcileCabinetRun,
  runScopeSanityGate,
  UPPER_CABINET_FEATURE_KEY,
  type GroundingCandidate,
} from "@/domains/scopeGrounding";
import type {
  DetectedFeatureBase,
  DetectedMechanicalChange,
  DetectedRoom,
  DetectedStructuralChange,
  RemoteVisionLocale,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from "./types";

/** Observation id used when stated scope matched no assembly at all. */
export const UNRECOGNIZED_SCOPE_OBSERVATION_ID = "observation:unrecognized_scope";

/** Any verb that means the contractor is asking for work to be performed. */
const STATED_ACTION =
  /\b(install\w*|replac\w*|remov\w*|build\w*|fabricat\w*|construct\w*|repair\w*|paint\w*|add(s|ing)?|demo\w*|renovat\w*|remodel\w*)\b/i;

const NUMBER_NEAR = /(\d[\d,]*(?:\.\d+)?)/;

/*
 * Spoken scope uses words, not digits ("remove the two closets", "about six
 * foot length of wall"). Normalizing them to digits is what lets the ordinary
 * quantity parser see contractor evidence instead of a catalog default.
 */
const SPOKEN_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, sixteen: 16,
  eighteen: 18, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, doce: 12, veinte: 20,
};

const SPOKEN_NUMBER_RE = new RegExp(`\\b(${Object.keys(SPOKEN_NUMBERS).join("|")})\\b`, "gi");

export function normalizeSpokenNumbers(sentence: string): string {
  return sentence.replace(
    SPOKEN_NUMBER_RE,
    (word) => String(SPOKEN_NUMBERS[word.toLowerCase()] ?? word),
  );
}

function emptyResult(providerId: string): VisionAnalysisResult {
  return {
    rooms: [],
    materials: [],
    cabinets: [],
    flooring: [],
    lighting: [],
    windows: [],
    doors: [],
    appliances: [],
    fixtures: [],
    structuralChanges: [],
    mechanicalChanges: [],
    confidence: 0,
    providerId,
  };
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Media presence raises confidence — a future model raises it much further. */
export function mediaConfidenceBoost(request: VisionAnalysisRequest): number {
  let boost = 0;
  if (request.media.some((m) => m.kind === "before_photo")) boost += 0.1;
  if (request.media.some((m) => m.kind === "after_rendering")) boost += 0.1;
  if (request.media.some((m) => m.kind === "floor_plan")) boost += 0.05;
  // A prerecorded walkthrough is stronger evidence than a single still, but it
  // still contributes only a small bounded boost — it carries no measurements.
  const video = request.media.filter((m) => m.kind === "walkthrough_video");
  if (video.length > 0) {
    const frames = video.reduce((sum, m) => sum + (m.keyframeCount ?? 0), 0);
    boost += frames > 0 ? 0.15 : 0.1;
  }
  return Math.min(0.3, Math.round(boost * 100) / 100);
}

const UNIT_TOKENS: Record<string, RegExp> = {
  square_foot: /\b(sq\.? ?ft|square (feet|foot)|sf)\b/i,
  /*
   * Contractors dictate lengths as "26 foot LVL", "14-foot LVL" or "six foot
   * length of wall", never as "26 linear feet". Accepting only the formal token
   * discarded every spoken measurement and fell back to a catalog default.
   */
  linear_foot: /\b(lin\.? ?ft|linear (feet|foot)|lf)\b|\b\d[\d,]*(?:\.\d+)?[-\s]?(ft|foot|feet|')\b/i,
};

/**
 * A bare number is NOT a quantity. Area/length assemblies only accept a number
 * that was written with a matching unit; counted assemblies accept a plain
 * integer. Everything else falls back to the catalog default, which grounding
 * then marks as a default.
 */
function quantityInSentence(rule: WorkRule, rawSentence: string): number | null {
  const sentence = normalizeSpokenNumbers(rawSentence);
  const unitGuard = rule.unitKey ? UNIT_TOKENS[rule.unitKey] : undefined;
  if (unitGuard && !unitGuard.test(sentence)) return null;
  const m = sentence.match(NUMBER_NEAR);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Every start index where this rule's own subject is mentioned. */
function subjectPositions(subject: RegExp, text: string): number[] {
  const flags = subject.flags.includes("g") ? subject.flags : `${subject.flags}g`;
  const re = new RegExp(subject.source, flags);
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

/** A number with its optional trailing measurement token, e.g. "14-foot", "2". */
const MEASURED_NUMBER =
  /(\d[\d,]*(?:\.\d+)?)\s*[-–]?\s*(sq\.? ?ft|square (?:feet|foot)|sf|lin\.? ?ft|linear (?:feet|foot)|lf|ft|foot|feet|')?/gi;

const SUBJECT_PROXIMITY_CHARS = 40;

/**
 * Spoken scope packs several actions into one sentence: "Remove 8 feet of
 * bearing wall and install 14-foot LVL with two posts." Reading the FIRST
 * number in the sentence gave every clause the demolition length (and turned
 * "two posts" into 8 posts), so each rule takes the number sitting next to its
 * OWN subject instead.
 */
function quantityNearSubject(rule: WorkRule, rawSentence: string): number | null {
  const subject = rule.measurementSubject;
  if (!subject) return null;
  const sentence = normalizeSpokenNumbers(rawSentence);
  const positions = subjectPositions(subject, sentence);
  if (positions.length === 0) return null;
  const unitGuard = rule.unitKey ? UNIT_TOKENS[rule.unitKey] : undefined;

  /*
   * English puts the measurement BEFORE its subject ("8 feet of bearing wall",
   * "14-foot LVL", "two posts"), so a preceding number wins over a following
   * one at the same distance. Without that, "Remove 8 feet of wall and install
   * 14-foot LVL" gave the demolition line the beam's length.
   */
  const pick = (preceding: boolean): number | null => {
    let best: { value: number; distance: number } | null = null;
    for (const match of sentence.matchAll(MEASURED_NUMBER)) {
      const value = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(value) || value <= 0) continue;
      /* A measured assembly needs the unit ON the number; a count never eats "8 feet". */
      if (unitGuard && !unitGuard.test(match[0])) continue;
      if (!unitGuard && match[2]) continue;
      const index = match.index ?? 0;
      const distances = positions
        .filter((p) => (preceding ? p >= index : p < index))
        .map((p) => Math.abs(p - index));
      if (distances.length === 0) continue;
      const distance = Math.min(...distances);
      if (distance > SUBJECT_PROXIMITY_CHARS) continue;
      if (!best || distance < best.distance) best = { value, distance };
    }
    return best?.value ?? null;
  };

  return pick(true) ?? pick(false);
}


function detectQuantity(
  rule: WorkRule,
  rawSentence: string,
  lines: string[] = [],
): { quantity: number | null; explicit: boolean } {
  if (rule.unitKey === "lump_sum") return { quantity: rule.quantity, explicit: false };
  /*
   * Some work is inherently one thing (closing up ONE opening). Numbers in the
   * same sentence describe something else ("a breakfast bar that seats 3") and
   * must never become its count.
   */
  if (rule.fixedQuantity) return { quantity: rule.quantity, explicit: false };


  /* Clause-scoped evidence first: the number attached to this rule's subject. */
  const near = quantityNearSubject(rule, rawSentence);
  if (near !== null) return { quantity: near, explicit: true };

  const direct = quantityInSentence(rule, rawSentence);
  if (direct !== null) return { quantity: direct, explicit: true };

  /*
   * Contractors state the dimension in a NEIGHBOURING sentence: "We're gonna
   * remove that green wall. It's about six foot length of wall." The evidence
   * is only accepted when that sentence is about this rule's own subject, so
   * one trade's measurement can never become another trade's quantity.
   */
  const subject = rule.measurementSubject;
  if (subject) {
    const target = rawSentence.trim();
    const index = lines.findIndex((l) => l.trim() === target);
    const window = index >= 0 ? lines.slice(Math.max(0, index - 2), index + 3) : lines;
    for (const line of window) {
      if (line.trim() === target) continue;
      const normalized = normalizeSpokenNumbers(line);
      if (!subject.test(normalized)) continue;
      const value = quantityNearSubject(rule, line) ?? quantityInSentence(rule, line);
      if (value !== null) return { quantity: value, explicit: true };
    }
  }

  return { quantity: rule.quantity, explicit: false };
}


/**
 * Version 1 "vision": deterministic keyword analysis of what the contractor
 * said, enriched only by which media types were uploaded. Same output shape a
 * future image model will produce.
 */
/** Route one detected feature into the bucket its rule belongs to. */
function pushDetected(
  result: VisionAnalysisResult,
  rule: WorkRule,
  base: DetectedFeatureBase,
): void {
  switch (rule.bucket) {
    case "structuralChanges":
      result.structuralChanges.push({
        ...base,
        changeKind: rule.changeKind ?? "other",
      } as DetectedStructuralChange);
      break;
    case "mechanicalChanges":
      result.mechanicalChanges.push({
        ...base,
        discipline: rule.discipline ?? "other",
      } as DetectedMechanicalChange);
      break;
    case "materials":
      result.materials.push({ ...base, materialCategory: rule.materialCategory ?? "other" });
      break;
    case "cabinets":
      result.cabinets.push(base);
      break;
    case "flooring":
      result.flooring.push(base);
      break;
    case "lighting":
      result.lighting.push(base);
      break;
    case "windows":
      result.windows.push(base);
      break;
    case "doors":
      result.doors.push(base);
      break;
    case "appliances":
      result.appliances.push(base);
      break;
    case "fixtures":
      result.fixtures.push(base);
      break;
  }
}

export function analyzeDescription(
  request: VisionAnalysisRequest,
  providerId = "deterministic.description.v1",
): VisionAnalysisResult {
  const locale: RemoteVisionLocale = request.locale;
  const result = emptyResult(providerId);
  const text = request.description ?? "";
  if (!text.trim()) return result;

  const lines = sentences(text);
  const boost = mediaConfidenceBoost(request);
  const mediaIds = request.media.map((m) => m.id);

  // Rooms
  for (const room of ROOM_RULES) {
    const hit = lines.find((l) => room.match.test(l)) ?? (room.match.test(text) ? text : null);
    if (!hit) continue;
    const detected: DetectedRoom = {
      id: `room:${room.roomTypeKey}`,
      featureKey: `room.${room.roomTypeKey}`,
      label: localized(room.label, locale),
      roomTypeKey: room.roomTypeKey,
      confidence: round2(Math.min(0.95, 0.6 + boost)),
      source: "description",
      evidence: hit.trim(),
      mediaIds,
      quantity: null,
      unitKey: null,
    };
    result.rooms.push(detected);
  }

  // Work features — every keyword hit is a CANDIDATE, never scope on its own.
  /*
   * Matching runs against the sentence with LOCATING phrases removed, so a noun
   * that only appears as a location ("the wall behind the refrigerator") cannot
   * generate work. Evidence and quantities still read the original sentence.
   */
  const matched = WORK_RULES.map((rule) => ({
    rule,
    hit: lines.find((l) => rule.match.test(stripSpatialContext(l))),
  })).filter((h): h is { rule: WorkRule; hit: string } => Boolean(h.hit));
  /*
   * CLAUSE-SCOPED SUPERSESSION.
   *
   * A specific rule wins over the generic one it supersedes ONLY inside the
   * clause they share. Applying it project-wide is what deleted siding from
   * "new siding, new windows, new fascia": naming fascia anywhere erased every
   * siding mention. A victim survives whenever it owns at least one clause the
   * superseding rule does not match.
   */
  const allClauses = lines.flatMap((line) => splitClauses(stripSpatialContext(line)));
  const superseded = new Set<string>();
  for (const victim of matched) {
    const owners = matched.filter((o) =>
      o.rule.featureKey !== victim.rule.featureKey &&
      (o.rule.supersedes ?? []).includes(victim.rule.featureKey),
    );
    if (owners.length === 0) continue;
    const victimClauses = allClauses.filter((c) => victim.rule.match.test(c));
    /* No clause of its own (the match spanned a clause break): old behaviour. */
    const ownedEverywhere =
      victimClauses.length === 0 ||
      victimClauses.every((clause) => owners.some((o) => o.rule.match.test(clause)));
    if (ownedEverywhere) superseded.add(victim.rule.featureKey);
  }
  const keywordHits = matched.filter((h) => !superseded.has(h.rule.featureKey));

  /*
   * THE SCOPE ADMISSION GATE. A keyword hit becomes scope only when contractor
   * intent (action + object in the same clause), an explicit media reference for
   * already-admitted work, or a construction dependency justifies it. Anything
   * else comes back as a suggestion and is never priced.
   */
  const admission = admitScope({
    text,
    candidates: keywordHits.map(({ rule, hit }) => ({
      featureKey: rule.featureKey,
      label: ruleLabelFor(rule, hit, locale),
      sentence: hit.trim(),
      source: "description" as const,
    })),
  });
  const admittedByKey = new Map(admission.admitted.map((a) => [a.featureKey, a]));
  const hits = keywordHits.filter((h) => admittedByKey.has(h.rule.featureKey));

  const candidates: GroundingCandidate[] = hits.map(({ rule, hit }) => {
    const detected = detectQuantity(rule, hit, lines);
    const admittedItem = admittedByKey.get(rule.featureKey);
    /* "build an access door" is exactly one door — not a catalog default of 5. */
    /*
     * "build an access door, approximately 19 inches by 42 inches" is ONE door.
     * A stated dimension may never bind to a count unit, so an explicitly
     * singular count wins over any number found in the sentence.
     */
    const singular = admittedItem?.singularCount === true && rule.unitKey === "each";
    return {
      featureKey: rule.featureKey,
      label: ruleLabelFor(rule, hit, locale),
      sentence: hit.trim(),
      defaultQuantity: singular ? 1 : detected.quantity,
      /*
       * A number the contractor SAID is evidence, not a catalog default. Losing
       * that flag let room-count scaling multiply a stated 26 ft beam into 52 ft.
       */
      quantityIsStated: singular ? true : detected.explicit,
      unitKey: rule.unitKey,
      quantityBasis: rule.quantityBasis ?? "measured",
      source: "description",
    };
  });

  /*
   * ESTIMATOR READING. The lexicon matched words; the estimator pass read the
   * job. It may only fill gaps the recognizer left, and only stated work can
   * become priced scope — prerequisites and media findings come back as
   * approval-gated suggestions.
   */
  const estimator = mergeEstimatorReading({
    reading: request.estimatorReading ?? null,
    candidates,
    locale,
  });

  const grounded = groundScope({
    text,
    candidates: estimator.candidates,
    confirmedMeasurements: request.confirmedMeasurements,
    visual: { uppersVisible: null, cabinetrySpansRun: null },
    upperCabinetLabel: localized(
      WORK_RULES.find((r) => r.featureKey === UPPER_CABINET_FEATURE_KEY)?.label ?? {
        "en-US": "Upper cabinetry",
        "es-US": "Gabinetes superiores",
      },
      locale,
    ),
  });
  for (const proposal of estimator.suggestions) {
    if (grounded.observations.some((o) => o.id === proposal.id)) continue;
    grounded.observations.push(proposal);
  }
  /*
   * Suggestions are visible, never committed: they reach the contractor as
   * observations with a question attached, exactly like media-only findings.
   */
  for (const suggestion of admission.suggested) {
    if (grounded.observations.some((o) => o.id === `observation:${suggestion.featureKey}`)) continue;
    grounded.observations.push({
      id: `observation:${suggestion.featureKey ?? suggestion.code}`,
      label: suggestion.label,
      reason: suggestion.reason,
      evidence: suggestion.evidence,
      question: suggestion.question,
    });
  }
  /*
   * Never drop stated scope silently. When the contractor clearly asked for
   * work and nothing at all could be recognized, that fact is recorded so the
   * scenario reports "pricing incomplete" instead of a clean $0 estimate.
   */
  if (
    grounded.explicit.length === 0 &&
    grounded.incidental.length === 0 &&
    STATED_ACTION.test(text)
  ) {
    grounded.observations.push({
      id: UNRECOGNIZED_SCOPE_OBSERVATION_ID,
      label: "Scope we could not price automatically",
      reason:
        "The contractor described work that no assembly in the catalog matches, so it must be priced by hand instead of being left out.",
      evidence: text.slice(0, 400),
      question: "How should this work be priced?",
    });
  }
  const priced = [...grounded.explicit, ...grounded.incidental];


  for (const { rule, hit } of hits) {
    const item = priced.find((i) => i.featureKey === rule.featureKey);
    if (!item) continue;
    const { explicit } = detectQuantity(rule, hit, lines);
    const base: DetectedFeatureBase = {
      id: item.id,
      featureKey: rule.featureKey,
      label: ruleLabelFor(rule, hit, locale),
      confidence: round2(Math.min(0.95, (explicit || !item.provenance.isDefault ? 0.7 : 0.5) + boost)),
      source: "description",
      evidence: hit.trim(),
      mediaIds,
      quantity: item.quantity,
      pricingQuantity: item.pricingQuantity,
      unitKey: item.unitKey,
      scopeClass: item.scopeClass,
      provenance: item.provenance,
      /* The contractor's own verb outranks the trade default. */
      actionKey: resolveActionKey(hit, rule.actionKey),
      detail: item.detail ?? null,
    };


    pushDetected(result, rule, base);
  }

  /*
   * Scope the estimator pass added (work the lexicon missed) still has to reach
   * the contractor's Detected/Interpreted scope review — a grounded, priced item
   * that never surfaces in the UI is exactly how scope goes missing.
   */
  const keywordKeys = new Set(hits.map((h) => h.rule.featureKey));
  for (const item of priced) {
    if (keywordKeys.has(item.featureKey)) continue;
    const rule = workRuleFor(item.featureKey);
    if (!rule) continue;
    pushDetected(result, rule, {
      id: item.id,
      featureKey: item.featureKey,
      label: localized(rule.label, locale),
      confidence: round2(Math.min(0.9, 0.6 + boost)),
      source: "description",
      evidence: item.evidence ?? "",
      mediaIds,
      quantity: item.quantity,
      pricingQuantity: item.pricingQuantity,
      unitKey: item.unitKey,
      scopeClass: item.scopeClass,
      provenance: item.provenance,
      actionKey: resolveActionKey(item.evidence ?? text, rule.actionKey),
      detail: item.detail ?? null,
    });
  }

  /*
   * Uppers are their own run and their own quantity. When grounding derived an
   * upper run that no keyword rule matched, it still has to reach pricing as a
   * separate line — never folded into the base cabinet line.
   */
  const upperItem = grounded.explicit.find((i) => i.featureKey === UPPER_CABINET_FEATURE_KEY);
  const upperRule = WORK_RULES.find((r) => r.featureKey === UPPER_CABINET_FEATURE_KEY);
  if (upperItem && upperRule && !result.cabinets.some((c) => c.featureKey === UPPER_CABINET_FEATURE_KEY)) {
    result.cabinets.push({
      id: upperItem.id,
      featureKey: UPPER_CABINET_FEATURE_KEY,
      label: localized(upperRule.label, locale),
      confidence: round2(Math.min(0.9, 0.6 + boost)),
      source: "description",
      evidence: upperItem.evidence ?? "",
      mediaIds,
      quantity: upperItem.quantity,
      pricingQuantity: upperItem.pricingQuantity,
      unitKey: upperItem.unitKey,
      scopeClass: upperItem.scopeClass,
      provenance: upperItem.provenance,
      actionKey: resolveActionKey(upperItem.evidence ?? text, upperRule.actionKey),
      detail: upperItem.detail ?? null,
    });
  }

  const run = reconcileCabinetRun(text);
  result.grounded = grounded;
  result.sanity = runScopeSanityGate(grounded, { knownRunInches: run.wallInches });

  const all = collectFeatures(result);
  result.confidence = all.length
    ? round2(all.reduce((sum, f) => sum + f.confidence, 0) / all.length)
    : 0;
  return result;
}


/** Flat view of every detection, in a stable order. */
/**
 * Drop scope the contractor removed in the "Scope interpreted from your input"
 * review. Removal is a contractor decision, so it wins over any inference.
 */
export function excludeFeatures(
  result: VisionAnalysisResult,
  featureKeys: readonly string[],
): VisionAnalysisResult {
  if (featureKeys.length === 0) return result;
  const drop = new Set(featureKeys);
  const keep = <T extends { featureKey: string }>(list: T[]) =>
    list.filter((f) => !drop.has(f.featureKey));
  const grounded = result.grounded
    ? {
        ...result.grounded,
        explicit: result.grounded.explicit.filter((i) => !drop.has(i.featureKey)),
        incidental: result.grounded.incidental.filter((i) => !drop.has(i.featureKey)),
      }
    : result.grounded;
  return {
    ...result,
    structuralChanges: keep(result.structuralChanges),
    mechanicalChanges: keep(result.mechanicalChanges),
    cabinets: keep(result.cabinets),
    materials: keep(result.materials),
    flooring: keep(result.flooring),
    lighting: keep(result.lighting),
    windows: keep(result.windows),
    doors: keep(result.doors),
    appliances: keep(result.appliances),
    fixtures: keep(result.fixtures),
    ...(grounded ? { grounded } : {}),
  };
}

export function collectFeatures(result: VisionAnalysisResult): DetectedFeatureBase[] {
  return [
    ...result.structuralChanges,
    ...result.mechanicalChanges,
    ...result.cabinets,
    ...result.materials,
    ...result.flooring,
    ...result.lighting,
    ...result.windows,
    ...result.doors,
    ...result.appliances,
    ...result.fixtures,
  ];
}
