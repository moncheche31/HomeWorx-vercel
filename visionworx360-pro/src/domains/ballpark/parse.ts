/**
 * Voice answer parsing for the ballpark interview.
 *
 * Jobsite speech is messy: "sixteen by eighteen", "eight foot ceiling",
 * "twelve and a half feet", "un bano completo". Parsing is deterministic and
 * conservative — anything it cannot read confidently returns null so the
 * contractor types it instead of the app inventing a number.
 */

import { parseImperialLength } from "@/domains/measurement";
import type {
  BallparkLocale,
  BallparkOption,
  BallparkQuestion,
} from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Strip accents / punctuation so "bañó," and "bano" compare equal. */
export function normalizeSpeech(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    /* A decimal separator between digits is part of the number: stripping it
       turned "9.5" into "9 5" and every fractional answer was truncated. */
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[,!?;:]/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/(^|[^\d])\./g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNITS_EN: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS_EN: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

const UNITS_ES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90,
};

const WORD_NUMBERS: Record<string, number> = { ...UNITS_EN, ...TENS_EN, ...UNITS_ES };

/**
 * Convert every spoken number in the text to digits, including compounds
 * ("twenty four" → 24, "treinta y dos" → 32) and halves ("twelve and a half").
 */
export function wordsToNumbers(text: string): string {
  const words = normalizeSpeech(text).split(" ");
  const out: string[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const tens = TENS_EN[word] ?? (UNITS_ES[word] !== undefined && UNITS_ES[word] % 10 === 0 && UNITS_ES[word] >= 30 ? UNITS_ES[word] : undefined);

    if (tens !== undefined) {
      /* "twenty four" / "treinta y dos" */
      const nextIndex = words[i + 1] === "y" ? i + 2 : i + 1;
      const next = words[nextIndex];
      const unit = next ? (UNITS_EN[next] ?? UNITS_ES[next]) : undefined;
      if (unit !== undefined && unit > 0 && unit < 10) {
        out.push(String(tens + unit));
        i = nextIndex;
        continue;
      }
      out.push(String(tens));
      continue;
    }

    const value = WORD_NUMBERS[word];
    if (value !== undefined) {
      out.push(String(value));
      continue;
    }
    out.push(word);
  }

  return out
    .join(" ")
    /* "12 and a half" / "12 y medio" → 12.5 */
    .replace(/(\d+(?:\.\d+)?)\s+(?:and a half|y medio|y media)\b/g, (_m, n: string) => String(Number(n) + 0.5));
}

const FEET_WORD = String.raw`(?:'|’|feet|foot|ft|pies|pie)`;
const INCH_WORD = String.raw`(?:"|”|inches|inch|in\b|pulgadas|pulgada)`;

/**
 * Read one length in feet: 16, 16', "16 feet 6 inches", "8 foot", "94 inches".
 *
 * Spoken/typed text is number-worded first ("ninety four inches"), then handed
 * to the SHARED imperial parser so speech, typing and the measurement fields
 * all agree. Before this, an inches-only answer fell through to the bare
 * number branch and "94 inches" was recorded as 94 FEET.
 */
export function parseFeet(text: string | null | undefined): number | null {
  const src = wordsToNumbers(String(text ?? ""));

  const inchesOnly = new RegExp(String.raw`(\d+(?:\.\d+)?)(?:\s+(\d+)\s*/\s*(\d+))?\s*${INCH_WORD}`, "i").exec(src);
  const feetAndInches = new RegExp(
    String.raw`(\d+(?:\.\d+)?)\s*${FEET_WORD}\s*(?:(?:and|y)\s*)?(\d+(?:\.\d+)?)(?:\s+(\d+)\s*/\s*(\d+))?\s*(?:${INCH_WORD})?`,
    "i",
  ).exec(src);

  if (feetAndInches) {
    const parsed = parseImperialLength(
      `${feetAndInches[1]}' ${feetAndInches[2]}${feetAndInches[3] ? ` ${feetAndInches[3]}/${feetAndInches[4]}` : ""}"`,
    );
    if (parsed) return parsed.feet;
  }
  if (inchesOnly) {
    const parsed = parseImperialLength(
      `${inchesOnly[1]}${inchesOnly[2] ? ` ${inchesOnly[2]}/${inchesOnly[3]}` : ""}"`,
    );
    if (parsed) return parsed.feet;
  }

  const plain = /(\d+(?:\.\d+)?)/.exec(src);
  if (!plain) return null;
  const value = Number(plain[1]);
  return value > 0 ? round2(value) : null;
}

/**
 * Read a whole count: "two doors", "dos puertas", "none" → 0.
 *
 * A count is whole by definition. "9.5" is NOT a count of 9 — truncating it
 * would store a number the contractor never said, so it returns null and the
 * contractor is asked again (or the answer is held for review).
 */
export function parseCount(text: string | null | undefined): number | null {
  const src = wordsToNumbers(String(text ?? ""));
  if (/\b(none|no|zero|ninguna|ninguno|nada|cero)\b/.test(src)) return 0;
  const match = /(\d+(?:\.\d+)?)/.exec(src);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  return Number.isInteger(value) ? value : null;
}


/** Read "sixteen by eighteen" / "16 x 18" / "dieciseis por dieciocho". */
export function parseDimensionPair(
  text: string | null | undefined,
): { lengthFt: number; widthFt: number } | null {
  const src = wordsToNumbers(String(text ?? ""));
  const match = new RegExp(
    String.raw`(\d+(?:\.\d+)?)\s*${FEET_WORD}?\s*(?:x|×|by|por)\s*(\d+(?:\.\d+)?)`,
    "i",
  ).exec(src);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!(a > 0) || !(b > 0)) return null;
  return { lengthFt: round2(Math.max(a, b)), widthFt: round2(Math.min(a, b)) };
}

const UNKNOWN_WORDS = [
  "unknown", "not sure", "unsure", "dont know", "do not know", "no idea",
  "no se", "no estoy seguro", "ni idea", "desconocido",
];

/** True when the contractor explicitly said they do not know. */
export function isUnknownSpeech(text: string | null | undefined): boolean {
  const src = normalizeSpeech(String(text ?? ""));
  if (!src) return false;
  return UNKNOWN_WORDS.some((w) => src.includes(w));
}

/** Pick the option whose spoken words appear in the transcript. */
export function matchOption(
  options: BallparkOption[],
  text: string | null | undefined,
  locale: BallparkLocale,
): BallparkOption | null {
  const src = normalizeSpeech(String(text ?? ""));
  if (!src) return null;
  let best: { option: BallparkOption; length: number } | null = null;
  for (const option of options) {
    const phrases = [...(option.match[locale] ?? []), ...(option.match["en-US"] ?? [])];
    for (const phrase of phrases) {
      const needle = normalizeSpeech(phrase);
      if (!needle) continue;
      const hit = new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(src);
      if (hit && (!best || needle.length > best.length)) {
        best = { option, length: needle.length };
      }
    }
  }
  return best?.option ?? null;
}

/** Drop a trailing plural "s"/"es" so "closets" matches "closet". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Contractor phrasing rarely repeats the option wording exactly ("we're doing
 * a full bath in there", "walls only please"). After the strict whole-phrase
 * match fails, accept a phrase that merely appears inside the answer, or an
 * option whose own value words do.
 */
export function matchOptionLoose(
  options: BallparkOption[],
  text: string | null | undefined,
  locale: BallparkLocale,
): BallparkOption | null {
  const strict = matchOption(options, text, locale);
  if (strict) return strict;

  const src = normalizeSpeech(String(text ?? ""));
  if (!src) return null;
  const tokens = new Set(src.split(" ").map(singular));

  let best: { option: BallparkOption; length: number } | null = null;
  const consider = (option: BallparkOption, length: number) => {
    if (!best || length > best.length) best = { option, length };
  };

  for (const option of options) {
    const phrases = [
      ...(option.match[locale] ?? []),
      ...(option.match["en-US"] ?? []),
      option.value.replace(/[_-]+/g, " "),
    ];
    for (const phrase of phrases) {
      const needle = normalizeSpeech(phrase);
      if (needle.length < 3) continue;
      if (src.includes(needle)) {
        consider(option, needle.length);
        continue;
      }
      /*
       * Word-level overlap: every word of a short option phrase is present.
       * Words shorter than three characters carry the meaning of negations and
       * quantifiers ("no bath", "sin bano"), so a phrase that contains one is
       * NEVER matched by overlap — dropping "no" turned "5'x11' bathroom" into
       * the "no bathroom" option. Such phrases must match verbatim.
       */
      const rawWords = needle.split(" ").filter((w) => w.length > 0);
      const words = rawWords.map(singular).filter((w) => w.length >= 3);
      if (words.length !== rawWords.length) continue;
      if (words.length > 0 && words.every((w) => tokens.has(w))) {
        consider(option, needle.length);
      }

    }
  }
  return best ? (best as { option: BallparkOption }).option : null;
}

export interface ParsedSpeechAnswer {
  /** null value + `unknown: true` means "the contractor said they don't know". */
  value: string | number | null;
  unknown: boolean;
  /** Set when a paired dimension ("16 by 18") filled two questions at once. */
  pair?: { lengthFt: number; widthFt: number } | null;
}

/**
 * Parse one spoken or typed reply against one question. Speech and keyboard
 * share this single path, so anything a contractor can say they can also type.
 * Returns `value: null` only when the words genuinely cannot be read for this
 * question type — never a fabricated number.
 */
export function parseAnswer(
  question: BallparkQuestion,
  transcript: string,
  locale: BallparkLocale,
): ParsedSpeechAnswer {
  const text = String(transcript ?? "");
  if (isUnknownSpeech(text)) {
    /* "unsure" is a real choice on yes/no questions, not a missing answer. */
    const explicit = question.options
      ? matchOption(question.options.filter((o) => o.value === "unsure"), text, locale)
      : null;
    if (explicit) return { value: explicit.value, unknown: false };
    return { value: null, unknown: true };
  }

  switch (question.kind) {
    case "dimension": {
      const pair = parseDimensionPair(text);
      if (pair) {
        /* "18 by 16" on a paired question fills both; elsewhere take the
           dimension the question is actually asking about. */
        if (question.acceptsPair) return { value: pair.lengthFt, unknown: false, pair };
        return { value: parseFeet(text), unknown: false };
      }
      return { value: parseFeet(text), unknown: false };
    }
    case "count":
      return { value: parseCount(text), unknown: false };
    case "choice": {
      const option = matchOptionLoose(question.options ?? [], text, locale);
      return { value: option?.value ?? null, unknown: false };
    }
    case "text": {
      const trimmed = text.trim();
      return { value: trimmed.length > 0 ? trimmed : null, unknown: false };
    }
    default: {
      /* Unknown question kinds keep the answer verbatim rather than losing it. */
      const trimmed = text.trim();
      return { value: trimmed.length > 0 ? trimmed : null, unknown: false };
    }
  }
}

