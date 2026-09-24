import { formatInches } from "@/domains/measurement";
import {
  cabinetClauses,
  reconcileCabinetRun,
  widthMentionsIn,
  type CabinetRunReconciliation,
} from "./cabinetry";
import { inchesToFeet } from "./measure";
import type { QuantitySource, ScopeClarification } from "./types";

/**
 * RUN GEOMETRY — the generalized ballpark rule behind the cabinet fix.
 *
 * Overall contractor-stated geometry is authoritative enough to price. A wall
 * or run length ("the wall is 94 inches", "8 feet and 6 feet around the
 * corner") IS the quantity. Individual component sizes — cabinet widths,
 * fillers, specialty boxes — refine the scope description and are checked
 * against the run, but they can never establish, override or corrupt it.
 *
 * Two numbers are kept apart on purpose:
 *   exact    — the measurement as stated. 94" / 7.833 LF. Never rounded.
 *   pricing  — what the ballpark prices. Rounded UP to the next whole foot.
 * The pricing number is never written back into geometry or displayed as the
 * measured wall.
 */

/** One straight leg of a run. An L-shaped kitchen has two. */
export interface RunSegment {
  inches: number;
  feet: number;
  display: string;
  evidence: string;
}

export interface RunQuantity {
  exactInches: number;
  /** 94" -> 7.833. Never rounded up. */
  exactFeet: number;
  /** 7.833 -> 8. Ballpark pricing only. */
  pricingFeet: number;
  /** `7' 10"` — how the measurement is shown to a human. */
  display: string;
  source: QuantitySource;
  evidence: string;
  segments: RunSegment[];
  /** Disclosed inference, e.g. uppers assumed to follow the base run. */
  assumption: string | null;
}

/** Minimal shape of a durable `project_measurement_items` row. */
export interface ConfirmedRunMeasurement {
  label?: string | null;
  subject?: string | null;
  inches: number;
  display?: string | null;
  rawText?: string | null;
  status?: string | null;
}

/**
 * What the photos/renderings suggest. Contextual support only: it may confirm
 * that cabinetry spans the stated run or that uppers exist, and it may never
 * introduce or change a dimension.
 */
export interface CabinetVisualContext {
  uppersVisible?: boolean | null;
  cabinetrySpansRun?: boolean | null;
}

export interface CabinetRunPlan {
  base: RunQuantity | null;
  upper: RunQuantity | null;
  reconciliation: CabinetRunReconciliation;
  clarifications: ScopeClarification[];
}

export interface CabinetRunPlanInput {
  text: string;
  /** Durable, contractor-confirmed measurements. Outranks the transcript. */
  confirmedMeasurements?: ConfirmedRunMeasurement[];
  visual?: CabinetVisualContext;
}

const RUN_SUBJECT = /\b(wall|run|galley|perimeter)\b/i;
const CABINET_CONTEXT = /\bcabinet(s|ry)?\b|\bupper(s)?\b|\bbase\b|\bkitchen\b|\bvanity\b/i;
const UPPER_CLAUSE = /\bupper(s)?\b|\bwall cabinet/i;
const FEET_WRITTEN = /'|\bft\b|\bfeet\b|\bfoot\b/i;
const NOT_WIDTH = /\b(deep|depth|tall|high|height)\b/i;

/** Round UP to the next whole linear foot. Pricing only — never geometry. */
export function toPricingLinearFeet(feet: number): number {
  if (!Number.isFinite(feet) || feet <= 0) return 0;
  return Math.max(1, Math.ceil(feet - 1e-6));
}

function segment(inches: number, evidence: string): RunSegment {
  return {
    inches,
    feet: inchesToFeet(inches),
    display: formatInches(inches),
    evidence,
  };
}

function quantityFrom(
  segments: RunSegment[],
  source: QuantitySource,
  evidence: string,
  assumption: string | null = null,
): RunQuantity | null {
  if (!segments.length) return null;
  const exactInches = Math.round(segments.reduce((sum, s) => sum + s.inches, 0) * 100) / 100;
  if (exactInches <= 0) return null;
  const exactFeet = inchesToFeet(exactInches);
  return {
    exactInches,
    exactFeet,
    pricingFeet: toPricingLinearFeet(exactFeet),
    display: formatInches(exactInches),
    source,
    evidence,
    segments,
    assumption,
  };
}

/**
 * Confirmed durable measurements beat any re-parse of the transcript. A
 * contractor who confirmed "back kitchen wall — 94 in" has already answered the
 * question; re-reading the dictation can only make that number worse.
 */
function confirmedRunSegments(items: ConfirmedRunMeasurement[]): RunSegment[] {
  return items
    .filter((i) => (i.status ?? "confirmed") === "confirmed")
    .filter((i) => Number.isFinite(i.inches) && i.inches > 0)
    .filter((i) => RUN_SUBJECT.test(`${i.subject ?? ""} ${i.label ?? ""}`))
    .map((i) => segment(i.inches, i.rawText || i.label || i.display || formatInches(i.inches)));
}

/**
 * Run legs stated in the transcript.
 *
 * Two shapes qualify, and nothing else:
 *   - a wall/run subject ("the wall is 94 inches", "the run is 12 feet")
 *   - a foot-scale length in cabinet context ("8 feet of base cabinets")
 * Cabinet component widths are inch-scale and never reach either branch, which
 * is what keeps a 30" box from becoming the run.
 */
function transcriptRunSegments(text: string, upperOnly: boolean): RunSegment[] {
  const out: RunSegment[] = [];
  for (const clause of cabinetClauses(text)) {
    const isUpper = UPPER_CLAUSE.test(clause);
    if (upperOnly !== isUpper) continue;
    if (NOT_WIDTH.test(clause) && !RUN_SUBJECT.test(clause)) continue;

    for (const mention of widthMentionsIn(clause)) {
      /* "94 inch kitchen wall" and "the wall is 94 inches" are both the run. */
      const trailing = clause.slice(mention.index, mention.index + mention.raw.length + 24);
      const namedRun =
        RUN_SUBJECT.test(clause) &&
        (mention.subject === null || RUN_SUBJECT.test(mention.subject) || RUN_SUBJECT.test(trailing));
      const footScale = FEET_WRITTEN.test(mention.raw) && CABINET_CONTEXT.test(clause);
      if (!namedRun && !footScale) continue;
      out.push(segment(mention.inches, clause.trim()));
    }
  }
  return out;
}

function describeSegments(segments: RunSegment[]): string {
  return segments.map((s) => s.display).join(" + ");
}

/**
 * Resolve the priceable cabinet runs.
 *
 * Order of authority: confirmed measurement > contractor transcript >
 * component arithmetic. Uppers get their own quantity — never folded into the
 * base line — and inherit the base run only when the evidence says they span
 * the same wall, with that inference disclosed as an assumption.
 */
export function planCabinetRuns(input: CabinetRunPlanInput): CabinetRunPlan {
  const text = input.text ?? "";
  const reconciliation = reconcileCabinetRun(text);
  const clarifications: ScopeClarification[] = [];

  const confirmed = confirmedRunSegments(input.confirmedMeasurements ?? []);
  const spoken = transcriptRunSegments(text, false);

  let base: RunQuantity | null = null;
  if (confirmed.length) {
    base = quantityFrom(
      confirmed,
      "typed_measurement",
      `Confirmed measurement: ${describeSegments(confirmed)}`,
    );
    if (spoken.length) {
      const spokenTotal = spoken.reduce((sum, s) => sum + s.inches, 0);
      if (base && Math.abs(spokenTotal - base.exactInches) >= 1) {
        clarifications.push({
          id: "clarify:run_measurement_conflict",
          topic: "cabinet_run",
          message: `Priced from the confirmed measurement ${base.display}. The description mentions ${formatInches(spokenTotal)} — confirm which is right before the estimate goes out.`,
          evidence: base.evidence,
        });
      }
    }
  } else if (spoken.length) {
    base = quantityFrom(spoken, "spoken_measurement", describeSegments(spoken));
  } else if (reconciliation.baseTotalInches > 0) {
    /* No overall run stated — fall back to adding the boxes up. */
    base = quantityFrom(
      [segment(reconciliation.baseTotalInches, "component widths")],
      "component_arithmetic",
      "Run added up from the individual cabinet widths the contractor listed.",
    );
  }

  /* ------------------------------------------------------------- uppers */
  const explicitUpper = transcriptRunSegments(text, true);
  const upperMentioned =
    UPPER_CLAUSE.test(text) ||
    reconciliation.components.some((c) => c.kind === "upper") ||
    input.visual?.uppersVisible === true;

  let upper: RunQuantity | null = null;
  if (explicitUpper.length) {
    upper = quantityFrom(explicitUpper, "spoken_measurement", describeSegments(explicitUpper));
  } else if (upperMentioned && base) {
    const seen = input.visual?.uppersVisible === true ? " Uppers are visible in the uploaded media." : "";
    upper = quantityFrom(
      base.segments,
      base.source,
      base.evidence,
      `Upper cabinets assumed to run the full ${base.display} — the same wall as the base cabinets.${seen}`,
    );
  }

  /* ----------------------------------------------------- clarifications */
  const gap = (kind: "base" | "upper", stated: number, run: RunQuantity | null) => {
    if (!run || stated <= 0) return;
    const difference = Math.round((run.exactInches - stated) * 100) / 100;
    if (Math.abs(difference) < 0.5) return;
    clarifications.push({
      id: `clarify:${kind}_run_gap`,
      topic: "cabinet_run",
      message:
        difference > 0
          ? `${kind === "base" ? "Base" : "Upper"} cabinet widths total ${formatInches(stated)} against the ${run.display} run — ${formatInches(difference)} is assumed to be filler or spacing. The run quantity is unchanged.`
          : `${kind === "base" ? "Base" : "Upper"} cabinet widths total ${formatInches(stated)}, which is ${formatInches(-difference)} MORE than the ${run.display} run. Confirm the layout before pricing.`,
      evidence: run.display,
    });
  };
  gap("base", reconciliation.baseTotalInches, base);
  gap("upper", reconciliation.upperTotalInches, upper);

  return { base, upper, reconciliation, clarifications };
}
