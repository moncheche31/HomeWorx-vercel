/**
 * Labor-hour integrity: PER-UNIT rates are not TOTAL hours.
 *
 * The defect this module exists to end: a catalog productivity rate
 * (`0.011 hr / SF`) was stored in a line's `labor_hours` column, which the
 * engine reads as the TOTAL hours for the task. A 1,039 SF paint wall then
 * carried 0.011 hours of labor — about forty seconds — and the estimate lost
 * roughly eleven hours of real work. The same line's own pricing provenance
 * recorded `computedLaborHours: 11.4292`, so the correct number was known and
 * simply not stored.
 *
 * Two rules drive everything here:
 *
 * 1. EVIDENCE, NOT THRESHOLDS. A tiny number is not automatically wrong — a
 *    ten-minute task is real. A line is only repaired when its OWN provenance
 *    proves the stored value is a per-unit rate: an expected total exists, the
 *    stored value matches the per-unit rate rather than the total, and the
 *    quantity is greater than one. Everything else that merely looks odd is
 *    FLAGGED for the contractor, never silently rewritten.
 * 2. CONTRACTOR AUTHORITY IS ABSOLUTE. A number the contractor typed or
 *    confirmed is never touched, however small — not by this module, not by a
 *    backfill, not by a later recalculation.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */
import { roundQuarterHour } from "./laborTime";

const round4 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Units whose quantity is a measured extent, so hours must scale with it. */
export const MEASURED_UNITS = new Set([
  "linear_foot",
  "square_foot",
  "cubic_foot",
  "cubic_yard",
  "sheet",
  "board_foot",
  "gallon",
  "pound",
]);

/** Where a line's stored total hours came from. Provenance, not a guess. */
export type LaborHoursBasis =
  /** The contractor typed or confirmed the hours. Authoritative. */
  | "contractor"
  /** quantity x hours-per-unit from the catalog / knowledge base. */
  | "derived_per_unit"
  /** A flat task time that does not scale with quantity. */
  | "flat_task"
  /** Unknown — legacy rows written before provenance existed. */
  | "unknown";

export interface LaborHoursProvenance {
  basis: LaborHoursBasis;
  /** The per-unit productivity rate, when the hours scale with quantity. */
  hoursPerUnit: number | null;
  /** Non-scaling setup / mobilization time folded into the total. */
  setupHours: number;
  /** The quantity the total was computed from. */
  quantity: number;
  /** Human-auditable formula, e.g. `0.5 + 1039.02 x 0.011`. */
  formula: string;
  /** True once a contractor has explicitly accepted the number. */
  isConfirmed: boolean;
}

/**
 * THE canonical total-hours formula. Everything that needs total hours calls
 * this; nothing multiplies a rate by a quantity on its own.
 *
 *   total = (setup + quantity x hoursPerUnit) x productivity
 */
export function computeTotalLaborHours(input: {
  quantity: number;
  hoursPerUnit: number;
  setupHours?: number;
  productivity?: number;
}): number {
  const quantity = Math.max(0, num(input.quantity));
  const perUnit = Math.max(0, num(input.hoursPerUnit));
  const setup = Math.max(0, num(input.setupHours));
  const productivity = input.productivity && input.productivity > 0 ? input.productivity : 1;
  /* Quarter-hour invariant: total labor time is always a 15-minute increment. */
  return roundQuarterHour((setup + quantity * perUnit) * productivity);
}

/** Renders the formula behind a total so the contractor can audit it. */
export function laborHoursFormula(input: {
  quantity: number;
  hoursPerUnit: number;
  setupHours?: number;
}): string {
  const setup = Math.max(0, num(input.setupHours));
  const body = `${round4(num(input.quantity))} × ${round4(num(input.hoursPerUnit))} hr/unit`;
  return setup > 0 ? `${round4(setup)} hr setup + ${body}` : body;
}

/* ------------------------------------------------------------------ *
 * Integrity assessment
 * ------------------------------------------------------------------ */

export type LaborHoursVerdict =
  /** Nothing to do. */
  | "ok"
  /** Contractor-owned value. Never modified. */
  | "contractor_override"
  /** Proven: the stored total is actually the per-unit rate. Repairable. */
  | "per_unit_stored_as_total"
  /** Stored total disagrees with its own derivation evidence. Repairable. */
  | "derived_total_mismatch"
  /** Looks impossible for the quantity, but no evidence proves it. Flag only. */
  | "suspicious_unverifiable"
  /** No hours at all on a line that should have some. Flag only. */
  | "missing_hours";

export interface LaborHoursLine {
  id: string;
  description?: string | null;
  quantity: number;
  unitKey: string | null;
  /** The value stored as TOTAL hours today. */
  laborHours: number;
  /** Per-unit rate from the catalog / knowledge base, when known. */
  catalogHoursPerUnit?: number | null;
  /** Total hours the pricing bridge computed, when recorded in provenance. */
  computedLaborHours?: number | null;
  /** `contractor`, `knowledge_base`, `unmatched`, ... */
  pricingSource?: string | null;
  /** Contractor explicitly priced or confirmed this line. */
  isContractorOwned?: boolean;
  laborHoursBasis?: LaborHoursBasis | null;
}

export interface LaborHoursAssessment {
  id: string;
  verdict: LaborHoursVerdict;
  /** True when a repair is provable from this line's own evidence. */
  isRepairable: boolean;
  storedHours: number;
  /** The hours the line should carry. Null when nothing proves a value. */
  expectedHours: number | null;
  /** The per-unit rate the evidence implies. */
  hoursPerUnit: number | null;
  basis: LaborHoursBasis;
  formula: string | null;
  /** Plain-language reason, for the contractor-facing audit list. */
  reason: string;
}

/** Stored value within this ratio of the per-unit rate is that rate, not a total. */
const RATE_MATCH_TOLERANCE = 0.02;
/** A repair must move the number materially; otherwise it is just rounding. */
const MATERIAL_REPAIR_RATIO = 1.25;

function nearly(a: number, b: number, tolerance = RATE_MATCH_TOLERANCE): boolean {
  if (b === 0) return Math.abs(a) < 1e-6;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

/**
 * Decides what — if anything — is wrong with one line's labor hours, using
 * only that line's own evidence. Never consults a global threshold table.
 */
export function assessLaborHours(line: LaborHoursLine): LaborHoursAssessment {
  const stored = num(line.laborHours);
  const quantity = num(line.quantity);
  const computed = line.computedLaborHours == null ? null : num(line.computedLaborHours);
  const catalogRate = line.catalogHoursPerUnit == null ? null : num(line.catalogHoursPerUnit);
  const contractorOwned =
    line.isContractorOwned === true ||
    line.pricingSource === "contractor" ||
    line.laborHoursBasis === "contractor";

  const base = {
    id: line.id,
    storedHours: stored,
    hoursPerUnit: catalogRate,
    formula: null as string | null,
  };

  /* Rule 2: contractor authority. A typed 0.1 hr stays 0.1 hr. */
  if (contractorOwned) {
    return {
      ...base,
      verdict: "contractor_override",
      isRepairable: false,
      expectedHours: stored,
      basis: "contractor",
      reason: "Contractor-entered hours are authoritative and are never recalculated.",
    };
  }

  /* The per-unit rate implied by whatever evidence the line carries. */
  const impliedPerUnit =
    catalogRate != null && catalogRate > 0
      ? catalogRate
      : computed != null && computed > 0 && quantity > 0
        ? round4(computed / quantity)
        : null;

  const expected =
    computed != null && computed > 0
      ? roundQuarterHour(computed)
      : impliedPerUnit != null && quantity > 0
        ? computeTotalLaborHours({ quantity, hoursPerUnit: impliedPerUnit })
        : null;

  const measured = !!line.unitKey && MEASURED_UNITS.has(line.unitKey);

  if (stored <= 0) {
    return {
      ...base,
      verdict: expected && expected > 0 ? "missing_hours" : "ok",
      isRepairable: false,
      expectedHours: expected,
      basis: "unknown",
      reason:
        expected && expected > 0
          ? "The line carries no labor hours although its pricing evidence implies some."
          : "No labor hours and no evidence that any are required.",
    };
  }

  if (expected != null && quantity > 1) {
    const looksLikeRate = impliedPerUnit != null && nearly(stored, impliedPerUnit);
    const materiallyLow = expected >= stored * MATERIAL_REPAIR_RATIO;

    /* Proven: the stored "total" IS the per-unit rate. */
    if (looksLikeRate && materiallyLow) {
      return {
        ...base,
        verdict: "per_unit_stored_as_total",
        isRepairable: true,
        expectedHours: expected,
        hoursPerUnit: impliedPerUnit,
        basis: "derived_per_unit",
        formula: laborHoursFormula({ quantity, hoursPerUnit: impliedPerUnit! }),
        reason:
          "The stored total equals the per-unit productivity rate, so the quantity was never applied.",
      };
    }

    /* The line's own derivation disagrees with what is stored. */
    if (!nearly(stored, expected, 0.05) && materiallyLow) {
      return {
        ...base,
        verdict: "derived_total_mismatch",
        isRepairable: true,
        expectedHours: expected,
        hoursPerUnit: impliedPerUnit,
        basis: "derived_per_unit",
        formula:
          impliedPerUnit != null
            ? laborHoursFormula({ quantity, hoursPerUnit: impliedPerUnit })
            : null,
        reason:
          "The stored total does not match the hours this line's own pricing evidence computed.",
      };
    }
  }

  /*
   * No evidence, but the shape is implausible: a measured quantity of real
   * size carrying less time than it takes to unload a van. Flagged, not fixed.
   */
  if (expected == null && measured && quantity >= 10 && stored < quantity * 0.002) {
    return {
      ...base,
      verdict: "suspicious_unverifiable",
      isRepairable: false,
      expectedHours: null,
      basis: "unknown",
      reason:
        "The hours look too small for this quantity, but nothing on the line proves the correct value.",
    };
  }

  return {
    ...base,
    verdict: "ok",
    isRepairable: false,
    expectedHours: stored,
    hoursPerUnit: impliedPerUnit,
    basis: line.laborHoursBasis ?? (impliedPerUnit != null ? "derived_per_unit" : "flat_task"),
    formula:
      impliedPerUnit != null && quantity > 1
        ? laborHoursFormula({ quantity, hoursPerUnit: impliedPerUnit })
        : null,
    reason: "Labor hours are consistent with the line's quantity and pricing evidence.",
  };
}

export interface LaborHoursAudit {
  assessments: LaborHoursAssessment[];
  /** Lines a backfill may safely rewrite. */
  repairable: LaborHoursAssessment[];
  /** Lines that need a human decision. */
  flagged: LaborHoursAssessment[];
  /** Lines left alone because the contractor owns them. */
  preserved: LaborHoursAssessment[];
  /** Hours the estimate is missing today, across every repairable line. */
  missingHours: number;
}

/** Audits a whole estimate. The backfill and the contractor UI share this. */
export function auditLaborHours(lines: LaborHoursLine[]): LaborHoursAudit {
  const assessments = lines.map(assessLaborHours);
  const repairable = assessments.filter((a) => a.isRepairable);
  return {
    assessments,
    repairable,
    flagged: assessments.filter(
      (a) => !a.isRepairable && (a.verdict === "suspicious_unverifiable" || a.verdict === "missing_hours"),
    ),
    preserved: assessments.filter((a) => a.verdict === "contractor_override"),
    missingHours: round4(
      repairable.reduce((sum, a) => sum + ((a.expectedHours ?? 0) - a.storedHours), 0),
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Repair reporting (shared by the server sweep and the contractor UI)
 * ------------------------------------------------------------------ */

/** One line's outcome from the workspace-wide labor-hour sweep. */
export interface LaborHoursRepairEntry {
  lineId: string;
  estimateId: string;
  description: string;
  quantity: number;
  oldHours: number;
  newHours: number;
  hoursPerUnit: number | null;
  /** repaired = proven; flagged = needs a human; preserved = contractor-owned. */
  action: "repaired" | "flagged" | "preserved";
  reason: string;
}

export interface LaborHoursRepairReport {
  dryRun: boolean;
  entries: LaborHoursRepairEntry[];
  repaired: number;
  flagged: number;
  preserved: number;
}
