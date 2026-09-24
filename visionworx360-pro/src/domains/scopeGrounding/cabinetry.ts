import { formatInches, formatInchesOnly } from "@/domains/measurement";
import { extractMeasurements, inchesToFeet } from "./measure";

/**
 * Cabinet-run reconciliation.
 *
 * Cabinet quantities are arithmetic, not guesswork: a wall width and a list of
 * component widths must add up. When they do not, the difference is reported
 * as a clarification (filler / spacing) instead of being invented away.
 */

export interface CabinetComponent {
  count: number;
  widthInches: number;
  kind: "base" | "upper";
  /** Named specialty feature (bread box, wine cabinet, glass doors, ...). */
  descriptor: string | null;
  evidence: string;
}


export interface CabinetRunReconciliation {
  /** Wall the run sits on, in inches. */
  wallInches: number | null;
  wallDisplay: string | null;
  /** Wall width in feet — the ONLY legitimate linear-foot quantity. */
  runFeet: number | null;
  components: CabinetComponent[];
  fillerInches: number;
  baseTotalInches: number;
  upperTotalInches: number;
  /** wall - base total (0 when it reconciles). */
  baseUnresolvedInches: number | null;
  /** wall - upper total. */
  upperUnresolvedInches: number | null;
  reconciled: boolean;
}

const WORD_NUMBERS: Record<string, number> = {
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
  couple: 2,
};

function wordCount(token: string | undefined): number {
  if (!token) return 1;
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  return WORD_NUMBERS[token.toLowerCase()] ?? 1;
}

/**
 * A cabinet is not always called a cabinet. Contractors list "a 15 inch bread
 * box", "a 30 inch upper", "a 24 inch vanity" — dropping those loses real boxes
 * out of the run and makes the wall fail to reconcile.
 */
const CABINET_WORD = /\bcabinet(s|ry)?\b|\bupper(s)?\b|\bbread\s?box\b|\bpantry\b|\bvanity\b/i;
const MEASURED = /(\d+(?:\.\d+)?)\s*(?:-|\s)*(?:"|inch(?:es)?|in\.?)\b/i;

const WIDE = /(\d+(?:\.\d+)?)\s*(?:-|\s)*inch(?:es)?\s*(?:-|\s)*wide/i;
const FILLER = /\b([a-z]+|\d+(?:\.\d+)?)\s*(?:-|\s)*inch(?:es)?\s+filler/i;
const BOTH_ENDS = /\b(either|each|both)\s+(end|ends|side|sides)\b/i;
const LEADING_COUNT = /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const OF_THEM = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+(them|those|these)\b/i;
const WALL_WORD = /\bwall\b/i;
const NOT_WIDTH = /\b(deep|depth|tall|high|height|long)\b/i;

/**
 * Dictation does not contain semicolons. A contractor says "three 30 inch base
 * cabinets, a 15 inch bread box and a 30 inch wine cabinet" in one breath, so
 * commas are real clause boundaries here. "and" only separates items when BOTH
 * sides carry their own measurement — otherwise "one glass door and one raised
 * panel door" would tear a single cabinet's description in half.
 */
export function cabinetClauses(text: string): string[] {
  return text
    .split(/[.;:,\n]/)
    .flatMap((piece) => splitOnItemAnd(piece))
    .map((c) => c.trim())
    .filter(Boolean);
}

function splitOnItemAnd(piece: string): string[] {
  const parts = piece.split(/\s+\band\b\s+/i);
  if (parts.length < 2) return parts;
  const out: string[] = [parts[0]];
  for (let i = 1; i < parts.length; i += 1) {
    const previous = out[out.length - 1];
    if (MEASURED.test(previous) && MEASURED.test(parts[i])) {
      out.push(parts[i]);
    } else {
      out[out.length - 1] = `${previous} and ${parts[i]}`;
    }
  }
  return out;
}


/** Widths only: a 24" depth or a 30" height is never a run dimension. */
export function widthMentionsIn(clause: string) {
  return extractMeasurements(clause).filter((m) => {
    if (m.dimensionHint === "height" || m.dimensionHint === "depth" || m.dimensionHint === "length") {
      return false;
    }
    const trailing = clause.slice(m.index + m.raw.length, m.index + m.raw.length + 12);
    if (NOT_WIDTH.test(trailing)) return false;
    if (new RegExp(`${m.raw}\\s+filler`, "i").test(clause)) return false;
    return true;
  });
}

/** Reconcile everything the contractor said about a cabinet run. */
export function reconcileCabinetRun(text: string): CabinetRunReconciliation {
  const all = cabinetClauses(text);

  /*
   * The wall is the run's control dimension, so it may only come from a clause
   * that talks about a wall and does NOT talk about a cabinet. The largest such
   * width wins: a cabinet component can never be promoted to "the wall".
   */
  const wallCandidates = all
    .filter((clause) => WALL_WORD.test(clause) && !CABINET_WORD.test(clause))
    .flatMap((clause) => widthMentionsIn(clause))
    .filter((m) => m.subject === "wall" || m.subject === null);
  const wallInches = wallCandidates.length
    ? Math.max(...wallCandidates.map((m) => m.inches))
    : null;

  const components: CabinetComponent[] = [];
  let fillerInches = 0;
  let section: "base" | "upper" = "base";

  for (const clause of all) {
    if (/\bupper|\bwall cabinet/i.test(clause)) section = "upper";
    if (/\bbase cabinet/i.test(clause)) section = "base";

    // "three of them" refers back to the cabinet just described.
    const ofThem = clause.match(OF_THEM);
    if (ofThem && components.length) {
      components[components.length - 1].count = wordCount(ofThem[1]);
      continue;
    }

    const filler = clause.match(FILLER);
    if (filler) {
      const each = wordCount(filler[1]);
      fillerInches += each * (BOTH_ENDS.test(clause) ? 2 : 1);
    }

    if (!CABINET_WORD.test(clause)) continue;
    if (/\bexisting\b/i.test(clause) && !/\badd\b|\binstall\b/i.test(clause)) continue;

    const wide = clause.match(WIDE);
    let widthInches: number | null = wide ? Number(wide[1]) : null;

    if (widthInches === null) {
      /*
       * Cabinet boxes are an inch-scale product. A length written in FEET
       * ("8 feet of base cabinets") is the run, not a box, so it must not
       * become a component width and then double-count against the run.
       */
      const mentions = widthMentionsIn(clause).filter((m) => {
        if (/'|\bft\b|\bfeet\b|\bfoot\b/i.test(m.raw)) return false;
        /* "the 94 inch kitchen wall" measures the run, not a cabinet box. */
        const trailing = clause.slice(m.index, m.index + m.raw.length + 24);
        return !/\bwall\b|\brun\b|\bspan\b/i.test(trailing);
      });
      widthInches = mentions.length ? mentions[0].inches : null;
    }
    if (widthInches === null || widthInches <= 0) continue;
    // The wall itself is never one of the boxes that sit against it.
    if (wallInches !== null && widthInches === wallInches && WALL_WORD.test(clause)) continue;

    const before = clause.slice(0, clause.toLowerCase().indexOf(String(widthInches)));
    /*
     * "three 30 inch cabinets" puts the count next to the width; "3 base
     * cabinets 30 inches wide each" puts it at the head of the clause. Both are
     * the same order, so fall back to a leading count when nothing is adjacent.
     */
    const countToken =
      before.match(new RegExp(`${LEADING_COUNT.source}\\s*$`, "i"))?.[1] ??
      before.match(/^\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i)?.[1];
    const kind: "base" | "upper" = /\bbase\b/i.test(clause) ? "base" : section;


    components.push({
      count: wordCount(countToken),
      widthInches,
      kind,
      descriptor: describeComponent(clause),
      evidence: clause,
    });
  }

  const total = (kind: "base" | "upper") =>
    components.filter((c) => c.kind === kind).reduce((sum, c) => sum + c.count * c.widthInches, 0);

  const baseTotalInches = total("base") + fillerInches;
  const upperTotalInches = total("upper");

  const baseUnresolvedInches =
    wallInches !== null && baseTotalInches > 0 ? round2(wallInches - baseTotalInches) : null;
  const upperUnresolvedInches =
    wallInches !== null && upperTotalInches > 0 ? round2(wallInches - upperTotalInches) : null;

  return {
    wallInches,
    wallDisplay: wallInches !== null ? formatInches(wallInches) : null,
    runFeet: wallInches !== null ? inchesToFeet(wallInches) : null,
    components,
    fillerInches,
    baseTotalInches,
    upperTotalInches,
    baseUnresolvedInches,
    upperUnresolvedInches,
    reconciled: baseUnresolvedInches !== null && Math.abs(baseUnresolvedInches) < 0.5,
  };
}


/**
 * Specialty features the contractor named for a single cabinet. These are the
 * details that make a quote recognizable to the homeowner, so they must
 * survive the arithmetic instead of collapsing into "cabinetry".
 */
const DESCRIPTORS: { match: RegExp; label: string }[] = [
  { match: /\bbread\s?box\b/i, label: "bread box" },
  { match: /\bwine\b/i, label: "wine storage" },
  { match: /\bglass\b[^,;]*\bdoor/i, label: "glass doors" },
  { match: /\braised[- ]panel\b/i, label: "raised-panel door" },
  { match: /\bpantry\b/i, label: "pantry" },
  { match: /\bdrawer\s?(bank|base|stack)\b/i, label: "drawer bank" },
  { match: /\blazy\s?susan\b/i, label: "lazy susan" },
  { match: /\bsink\s+base\b/i, label: "sink base" },
];

function describeComponent(clause: string): string | null {
  const labels = DESCRIPTORS.filter((d) => d.match.test(clause)).map((d) => d.label);
  return labels.length ? labels.join(" and ") : null;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function describeGroup(components: CabinetComponent[], kind: "base" | "upper"): string | null {
  const group = components.filter((c) => c.kind === kind);
  if (!group.length) return null;
  const parts = group.map((c) => {
    const width = formatInchesOnly(c.widthInches);
    const noun = plural(c.count, kind === "base" ? "base cabinet" : "upper cabinet");
    const head = `${c.count} ${width} ${noun}`;
    return c.descriptor ? `${head} with ${c.descriptor}` : head;
  });
  return parts.join(", ");
}

/**
 * One human sentence describing exactly the cabinets the contractor listed —
 * counts, widths, fillers and named specialty features. Null when nothing was
 * itemized, so generic cabinet jobs stay generic.
 */
export function describeCabinetRun(run: CabinetRunReconciliation): string | null {
  if (!run.components.length) return null;
  const segments: string[] = [];
  const base = describeGroup(run.components, "base");
  const upper = describeGroup(run.components, "upper");
  if (base) segments.push(base);
  if (run.fillerInches > 0) segments.push(`${formatInchesOnly(run.fillerInches)} of filler strips`);
  if (upper) segments.push(upper);
  return segments.length ? segments.join("; ") : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

