/**
 * ORIGIN AND QUANTITY PROVENANCE (trade-agnostic).
 *
 * Two questions must always be answerable about any row in a project:
 *
 *   1. WHERE did this row come from? (`OriginType` + reference + timestamp)
 *   2. WHERE did its number come from? (`QuantityBasis` + human basis + the
 *      formula that lets it be re-derived when the measurement changes)
 *
 * Without (1) a template-applied row is indistinguishable from contractor
 * intent, and cleanup becomes guesswork. Without (2) a derived quantity
 * silently hardens into a "contractor-entered" number that no recalculation
 * is ever allowed to correct.
 *
 * Pure module — no React, no Supabase, no IO.
 */

export const ORIGIN_TYPES = [
  "contractor",
  "template",
  "ai_inference",
  "checklist",
  "copied_estimate",
  "scope_sync",
  "geometry",
  "system",
  "legacy",
] as const;

export type OriginType = (typeof ORIGIN_TYPES)[number];

/** Safe default for anything a person typed directly. */
export const DEFAULT_ORIGIN: OriginType = "contractor";

export function isOriginType(value: unknown): value is OriginType {
  return typeof value === "string" && (ORIGIN_TYPES as readonly string[]).includes(value);
}

export function normalizeOrigin(value: unknown): OriginType {
  return isOriginType(value) ? value : DEFAULT_ORIGIN;
}

export interface OriginStamp {
  origin_type: OriginType;
  origin_ref: string | null;
  origin_at: string;
}

/** Build the column stamp every write path applies. Never optional in practice. */
export function originStamp(type: OriginType, ref?: string | null): OriginStamp {
  return {
    origin_type: normalizeOrigin(type),
    origin_ref: ref ?? null,
    origin_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Quantity basis
 * ------------------------------------------------------------------ */

export const QUANTITY_BASES = [
  "measurement",
  "geometry_derived",
  "contractor_entered",
  "assumed",
  "catalog_default",
] as const;

export type QuantityBasis = (typeof QUANTITY_BASES)[number];

export function isQuantityBasis(value: unknown): value is QuantityBasis {
  return typeof value === "string" && (QUANTITY_BASES as readonly string[]).includes(value);
}

/** Derived quantities stay derived; only these two are contractor authority. */
export function isContractorAuthored(basis: unknown): boolean {
  return basis === "contractor_entered";
}

export function isRederivable(basis: unknown): boolean {
  return basis === "geometry_derived";
}

/** Geometry kinds a stored formula can be re-derived from. */
export const GEOMETRY_KINDS = [
  "floor_area",
  "ceiling_area",
  "wall_area",
  "perimeter_lf",
  "volume",
] as const;

export type GeometryKind = (typeof GEOMETRY_KINDS)[number];

export interface QuantityFormula {
  kind: GeometryKind;
  /** Waste percentage added on top of the raw geometry. */
  wastePct?: number;
}

export interface GeometryInput {
  lengthFt?: number | null;
  widthFt?: number | null;
  ceilingHeightFt?: number | null;
}

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export interface DerivedQuantity {
  quantity: number;
  /** Human-readable audit basis shown to the contractor. */
  basisNote: string;
}

/**
 * Re-derive a quantity from geometry. Mirrors `rederive_measurement_quantities`
 * in the database so client previews and server truth cannot drift.
 */
export function deriveQuantity(
  formula: QuantityFormula,
  geometry: GeometryInput,
): DerivedQuantity | null {
  const length = n(geometry.lengthFt);
  const width = n(geometry.widthFt);
  const height = n(geometry.ceilingHeightFt);
  const waste = Math.max(0, n(formula.wastePct));

  let base = 0;
  let note = "";
  switch (formula.kind) {
    case "floor_area":
    case "ceiling_area":
      base = length * width;
      note = `${length} ft x ${width} ft = ${round2(base)} SF`;
      break;
    case "wall_area":
      base = 2 * (length + width) * height;
      note = `perimeter ${round2(2 * (length + width))} LF x ${height} ft height = ${round2(base)} SF`;
      break;
    case "perimeter_lf":
      base = 2 * (length + width);
      note = `perimeter of ${length} ft x ${width} ft = ${round2(base)} LF`;
      break;
    case "volume":
      base = length * width * height;
      note = `${length} x ${width} x ${height} = ${round2(base)} CF`;
      break;
    default:
      return null;
  }

  if (base <= 0) return null;
  const quantity = round2(base * (1 + waste / 100));
  if (waste > 0) note += `; +${waste}% waste = ${quantity}`;
  return { quantity, basisNote: note };
}
