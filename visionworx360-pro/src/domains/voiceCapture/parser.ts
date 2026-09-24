import {
  ACTION_PHRASES,
  CONTEXT_PREFIXES,
  NUMBER_WORDS,
  ROOM_ALIASES,
  SEGMENT_SPLIT,
  UNIT_PHRASES,
} from "./lexicon";
import { matchAssemblies } from "./matching";
import type {
  VoiceConfidence,
  VoiceDraftItem,
  VoiceMeasurement,
  VoiceParseOptions,
  VoiceParseResult,
  VoiceRoomRef,
} from "./types";

/**
 * Deterministic transcript → draft scope items.
 *
 * Rule-based only: no AI interpretation, no network calls, fully synchronous
 * and side-effect free so it can be unit tested and later swapped for an
 * AI-backed implementation behind `ScopeInterpretationProvider`.
 */

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function splitUtterances(transcript: string): string[] {
  return transcript
    .split(SEGMENT_SPLIT)
    .map((s) => s.replace(/^\s*(?:and|also|next|y|luego)\s+/i, "").trim())
    .filter((s) => s.length > 0);
}

/* ----------------------------- quantities ----------------------------- */

/**
 * Sizes are not counts.
 *
 * `Vanity 60" double sink` describes one 60-inch vanity, not sixty vanities,
 * and `16' x 18'` is a room, not a quantity. Reading a size as a count is how
 * a single line can inflate a ballpark by an order of magnitude, so any number
 * carrying a size marker is skipped here rather than corrected downstream.
 */
const INCH_MARK = /^\s*(?:"|”|“|''|″|-?\s*(?:in|ins|inch|inches|pulgadas?)\b)/i;
const FOOT_MARK = /^\s*(?:'|’|′)/;
const DIMENSION_JOIN = /^\s*(?:x|×|by|por)\s*\d/i;
const DIMENSION_LEAD = /(?:\d|x|×|by|por)\s*$/i;

export function isSizeNumber(text: string, index: number, raw: string): boolean {
  const before = text.slice(0, index);
  const after = text.slice(index + raw.length);
  if (INCH_MARK.test(after)) return true;
  /* A foot mark only means "size" as part of a dimension pair (16' x 18'). */
  if (FOOT_MARK.test(after) && DIMENSION_JOIN.test(after.replace(FOOT_MARK, ""))) return true;
  if (DIMENSION_JOIN.test(after)) return true;
  if (/[\d.]\s*(?:x|×|by|por)\s*$/i.test(before)) return true;
  if (/\/\s*$/.test(before) || /^\s*\//.test(after)) return true; // 3/4" stock
  if (FOOT_MARK.test(after) && DIMENSION_LEAD.test(before)) return true;
  return false;
}

export function detectQuantity(text: string): { quantity: number | null; matchedText: string | null } {
  const digitRe = /\b(\d+(?:\.\d+)?)\b/g;
  let digitValue: number | null = null;
  let digitText: string | null = null;
  let digitIndex = -1;
  let m = digitRe.exec(text);
  while (m) {
    if (!isSizeNumber(text, m.index, m[1])) {
      digitValue = Number(m[1]);
      digitText = m[1];
      digitIndex = m.index;
      break;
    }
    m = digitRe.exec(text);
  }

  const words = normalize(text).split(" ");
  let wordValue: number | null = null;
  let wordText: string | null = null;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i].replace(/[^\p{L}]/gu, "");
    if (w in NUMBER_WORDS) {
      let value = NUMBER_WORDS[w];
      let raw = w;
      const next = words[i + 1]?.replace(/[^\p{L}]/gu, "");
      if (next && next in NUMBER_WORDS && NUMBER_WORDS[next] < 10 && value >= 20) {
        value += NUMBER_WORDS[next];
        raw = `${w} ${next}`;
      }
      wordValue = value;
      wordText = raw;
      break;
    }
  }
  if (digitValue !== null && (!wordValue || digitIndex < normalize(text).indexOf(wordText ?? ""))) {
    return { quantity: digitValue, matchedText: digitText };
  }
  if (wordValue !== null) return { quantity: wordValue, matchedText: wordText };
  return { quantity: null, matchedText: null };
}


/* -------------------------------- units ------------------------------- */

export function detectUnit(text: string): string | null {
  const lower = normalize(text);
  const found = UNIT_PHRASES.filter(([phrase]) => lower.includes(phrase)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return found ? found[1] : null;
}

/* ----------------------------- measurements ---------------------------- */

const MEASUREMENT_PATTERNS: Array<{ re: RegExp; kind: VoiceMeasurement["kind"]; unit: VoiceMeasurement["unit"] }> = [
  { re: /\b(\d+(?:\.\d+)?)\s*(?:by|x|por)\s*(\d+(?:\.\d+)?)\b/gi, kind: "area_dimensions", unit: "unknown" },
  { re: /\b(\d+(?:\.\d+)?)[-\s]*(?:foot|feet|ft|pies?)\b/gi, kind: "length", unit: "foot" },
  { re: /\b(\d+(?:\.\d+)?)[-\s]*(?:inch|inches|in|pulgadas?)\b/gi, kind: "size", unit: "inch" },
];

export function detectMeasurements(text: string): VoiceMeasurement[] {
  const out: VoiceMeasurement[] = [];
  for (const { re, kind, unit } of MEASUREMENT_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    let m = rx.exec(text);
    while (m) {
      const values = m.slice(1).filter(Boolean).map(Number);
      const isCeiling = /ceiling|techo/i.test(text) && kind === "length";
      out.push({ raw: m[0].trim(), kind: isCeiling ? "height" : kind, values, unit });
      m = rx.exec(text);
    }
  }
  return out;
}

/* -------------------------------- rooms -------------------------------- */

function roomCandidates(rooms: VoiceRoomRef[]): Array<{ alias: string; room: VoiceRoomRef }> {
  const fromProject = rooms.flatMap((room) =>
    [room.name, ...(room.aliases ?? [])].map((alias) => ({ alias: normalize(alias), room })),
  );
  const fromLexicon = ROOM_ALIASES.map(([alias, name]) => ({
    alias,
    room: { id: null, name } as VoiceRoomRef,
  }));
  return [...fromProject, ...fromLexicon].sort((a, b) => b.alias.length - a.alias.length);
}

export function detectRoom(text: string, rooms: VoiceRoomRef[]): VoiceRoomRef | null {
  const lower = normalize(text);
  const hit = roomCandidates(rooms).find(({ alias }) =>
    alias.length > 2 && new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$|s\\b)`).test(lower),
  );
  return hit ? hit.room : null;
}

function isContextOnly(text: string, room: VoiceRoomRef | null): boolean {
  if (!room) return false;
  const lower = normalize(text).replace(/[^\p{L}\p{N}\s]/gu, "");
  const stripped = CONTEXT_PREFIXES.reduce(
    (acc, p) => (acc.startsWith(p) ? acc.slice(p.length).trim() : acc),
    lower,
  );
  const roomWords = normalize(room.name);
  return stripped === roomWords || stripped === `${roomWords}` || stripped.length <= roomWords.length + 2;
}

/* ------------------------------- actions ------------------------------- */

export function detectAction(text: string): string | null {
  const lower = normalize(text);
  const hit = ACTION_PHRASES.filter(([phrase]) => new RegExp(`(^|\\s)${phrase}(s|ed|ing)?(\\s|$)`).test(lower))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : null;
}

/* -------------------------------- title -------------------------------- */

function toTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/* ------------------------------ confidence ----------------------------- */

export function scoreConfidence(input: {
  topScore: number;
  ambiguous: boolean;
  hasAction: boolean;
  wordCount: number;
}): { confidence: VoiceConfidence; reasonKeys: string[] } {
  const reasons: string[] = [];
  if (input.ambiguous) reasons.push("multipleMatches");
  if (!input.hasAction) reasons.push("noAction");
  if (input.wordCount < 2) reasons.push("tooShort");
  if (input.topScore === 0) reasons.push("noMatch");

  if (input.topScore >= 0.7 && !input.ambiguous && input.hasAction && input.wordCount >= 2) {
    return { confidence: "high", reasonKeys: reasons.length ? reasons : ["strongMatch"] };
  }
  if (input.topScore >= 0.45 || (input.hasAction && input.topScore > 0)) {
    return { confidence: "medium", reasonKeys: reasons.length ? reasons : ["partialMatch"] };
  }
  return { confidence: "low", reasonKeys: reasons.length ? reasons : ["noMatch"] };
}

/* -------------------------------- parse -------------------------------- */

export function parseTranscript(
  transcript: string,
  options: VoiceParseOptions = {},
): VoiceParseResult {
  const rooms = options.rooms ?? [];
  const assemblies = options.assemblies ?? [];
  const idFactory = options.idFactory ?? ((i: number) => `voice-draft-${i}`);

  const drafts: VoiceDraftItem[] = [];
  const contextUtterances: string[] = [];
  let currentRoom: VoiceRoomRef | null = null;

  splitUtterances(transcript).forEach((utterance, index) => {
    const detectedRoom = detectRoom(utterance, rooms);
    if (detectedRoom) currentRoom = detectedRoom;
    if (detectedRoom && isContextOnly(utterance, detectedRoom)) {
      contextUtterances.push(utterance);
      return;
    }

    const { quantity } = detectQuantity(utterance);
    const measurements = detectMeasurements(utterance);
    const actionKey = detectAction(utterance);
    const matches = matchAssemblies(utterance, assemblies);
    const top = matches[0];
    const ambiguous = matches.length > 1 && top && matches[1].score >= top.score - 0.08;
    const wordCount = utterance.trim().split(/\s+/).length;

    const { confidence, reasonKeys } = scoreConfidence({
      topScore: top?.score ?? 0,
      ambiguous: Boolean(ambiguous),
      hasAction: Boolean(actionKey),
      wordCount,
    });

    const unitKey = detectUnit(utterance) ?? (top?.unitKey ?? null);

    drafts.push({
      id: idFactory(index),
      sourceText: utterance,
      utteranceIndex: index,
      title: toTitle(utterance),
      actionKey,
      quantity: quantity ?? (measurements.length === 0 ? null : null),
      unitKey,
      measurements,
      roomId: currentRoom?.id ?? null,
      roomName: currentRoom?.name ?? null,
      tradeKey: top?.tradeKey ?? null,
      categoryKey: top?.categoryKey ?? null,
      subcategoryKey: top?.subcategoryKey ?? null,
      origin: top ? "knowledge_base" : "custom",
      assemblyKey: top && !ambiguous ? top.assemblyKey : null,
      matches,
      needsReview: Boolean(ambiguous) || confidence !== "high",
      confidence,
      reasonKeys,
      status: "pending",
      selected: confidence === "high",
    });
  });

  return { drafts, contextUtterances };
}

/** Merge two drafts into one (review action). Pure. */
export function mergeDrafts(a: VoiceDraftItem, b: VoiceDraftItem): VoiceDraftItem {
  return {
    ...a,
    title: `${a.title} — ${b.title}`,
    sourceText: `${a.sourceText} ${b.sourceText}`,
    quantity: a.quantity ?? b.quantity,
    unitKey: a.unitKey ?? b.unitKey,
    measurements: [...a.measurements, ...b.measurements],
    needsReview: true,
    confidence: a.confidence === "high" && b.confidence === "high" ? "high" : "medium",
  };
}

/** Split a draft's text on a separator into two drafts (review action). Pure. */
export function splitDraft(draft: VoiceDraftItem, separator = " and "): VoiceDraftItem[] {
  const idx = draft.sourceText.toLowerCase().indexOf(separator);
  if (idx < 0) return [draft];
  const first = draft.sourceText.slice(0, idx).trim();
  const second = draft.sourceText.slice(idx + separator.length).trim();
  return [
    { ...draft, id: `${draft.id}-a`, sourceText: first, title: toTitle(first), needsReview: true },
    { ...draft, id: `${draft.id}-b`, sourceText: second, title: toTitle(second), needsReview: true },
  ];
}
