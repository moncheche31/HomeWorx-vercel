/**
 * Productivity semantics.
 *
 * The single most expensive class of bug in this engine has always been a unit
 * convention read the wrong way round: a catalog row that means "0.011 hours
 * per square foot" stored where the engine expects total hours, or a
 * "90 square feet per hour" production rate multiplied instead of inverted.
 * Both produce a number that looks like a real estimate and is off by orders
 * of magnitude.
 *
 * So conventions are never implied here. A productivity value must arrive
 * labelled as HOURS_PER_UNIT, UNITS_PER_HOUR or TOTAL_HOURS, and only this
 * module converts between them.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export const PRODUCTIVITY_CONVENTIONS = ["hours_per_unit", "units_per_hour", "total_hours"] as const;
export type ProductivityConvention = (typeof PRODUCTIVITY_CONVENTIONS)[number];

const round4 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface ProductivityRate {
  convention: ProductivityConvention;
  /** The number as authored under its own convention. */
  value: number;
  /** Where it came from — catalog id, knowledge-base row, contractor. */
  source?: string | null;
}

/**
 * Hours per unit under any convention. TOTAL_HOURS needs the quantity to be
 * expressed per unit, which is why quantity is required for that case.
 */
export function toHoursPerUnit(rate: ProductivityRate, quantity?: number): number {
  const value = num(rate.value);
  if (value <= 0) return 0;
  switch (rate.convention) {
    case "hours_per_unit":
      return round4(value);
    case "units_per_hour":
      return round4(1 / value);
    case "total_hours": {
      const qty = num(quantity);
      return qty > 0 ? round4(value / qty) : 0;
    }
  }
}

export interface DerivedLaborHours {
  totalHours: number;
  hoursPerUnit: number;
  setupHours: number;
  convention: ProductivityConvention;
  /** Human-auditable formula string shown to the contractor. */
  formula: string;
}

/**
 * THE derivation. total = (setup + quantity × hoursPerUnit) × productivity.
 *
 * A TOTAL_HOURS rate is authoritative and never re-multiplied by quantity —
 * that is exactly the double-count this module exists to prevent.
 */
export function deriveLaborHours(input: {
  rate: ProductivityRate;
  quantity: number;
  setupHours?: number;
  productivityMultiplier?: number;
}): DerivedLaborHours {
  const qty = Math.max(0, num(input.quantity));
  const setup = Math.max(0, num(input.setupHours));
  const multiplier =
    input.productivityMultiplier && input.productivityMultiplier > 0
      ? input.productivityMultiplier
      : 1;

  if (input.rate.convention === "total_hours") {
    const total = round4((Math.max(0, num(input.rate.value)) + setup) * multiplier);
    return {
      totalHours: total,
      hoursPerUnit: qty > 0 ? round4(total / qty) : 0,
      setupHours: setup,
      convention: "total_hours",
      formula:
        setup > 0
          ? `${round4(num(input.rate.value))} hr total + ${round4(setup)} hr setup`
          : `${round4(num(input.rate.value))} hr total`,
    };
  }

  const perUnit = toHoursPerUnit(input.rate);
  const total = round4((setup + qty * perUnit) * multiplier);
  const body = `${round4(qty)} × ${round4(perUnit)} hr/unit`;
  return {
    totalHours: total,
    hoursPerUnit: perUnit,
    setupHours: setup,
    convention: input.rate.convention,
    formula: setup > 0 ? `${round4(setup)} hr setup + ${body}` : body,
  };
}

/**
 * A contractor-entered total is authoritative. This helper exists so callers
 * cannot "helpfully" re-derive over the top of one.
 */
export function resolveAuthoritativeHours(input: {
  contractorHours?: number | null;
  derived: DerivedLaborHours;
}): { hours: number; basis: "contractor" | "derived"; formula: string } {
  const typed = input.contractorHours;
  if (typed != null && Number.isFinite(typed) && typed >= 0) {
    return { hours: round4(typed), basis: "contractor", formula: "contractor-entered total" };
  }
  return { hours: input.derived.totalHours, basis: "derived", formula: input.derived.formula };
}
