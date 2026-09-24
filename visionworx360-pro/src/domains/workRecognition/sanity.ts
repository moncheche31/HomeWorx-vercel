import { plausibleMax } from "./units";
import type { ResolvedWorkItem, UnitFamily, ZoneGeometry } from "./types";

/**
 * Generic quantity sanity, by unit family.
 *
 * This replaces the per-trade thresholds that only ever protected cabinetry.
 * The gate has no idea which trade it is checking: it compares the resolved
 * quantity against what the job's own geometry makes plausible for that unit
 * family, so a 192 sq ft deck cannot become 900 sq ft and six windows cannot
 * become sixty.
 */

export type SanitySeverity = "block" | "confirm" | "info";

export interface SanityFinding {
  id: string;
  workTypeKey: string;
  severity: SanitySeverity;
  message: string;
  quantity: number | null;
  unitKey: string;
  family: UnitFamily;
}

/** Largest authoritative area the contractor established for this job. */
export function projectAreaSf(zones: ZoneGeometry[]): number | null {
  const areas = zones.map((z) => z.areaSf).filter((a): a is number => typeof a === "number" && a > 0);
  if (!areas.length) return null;
  return Math.round(areas.reduce((a, b) => a + b, 0));
}

export function checkQuantitySanity(
  items: ResolvedWorkItem[],
  zones: ZoneGeometry[],
): SanityFinding[] {
  const area = projectAreaSf(zones);
  const findings: SanityFinding[] = [];

  for (const item of items) {
    const quantity = item.quantity;
    if (quantity === null) {
      findings.push({
        id: `${item.workTypeKey}:missing`,
        workTypeKey: item.workTypeKey,
        severity: "confirm",
        message: `${item.label} has no quantity yet — it cannot be priced until one is confirmed.`,
        quantity: null,
        unitKey: item.unitKey,
        family: item.family,
      });
      continue;
    }

    const { max, basis } = plausibleMax(item.family, area, item.unitKey);
    if (quantity > max) {
      findings.push({
        id: `${item.workTypeKey}:implausible`,
        workTypeKey: item.workTypeKey,
        severity: "block",
        message: `${item.label} came out at ${quantity} ${item.unitKey.replace(/_/g, " ")}, which is beyond what ${basis} supports. Confirm the measurement before pricing.`,
        quantity,
        unitKey: item.unitKey,
        family: item.family,
      });
      continue;
    }

    /* Cross-unit conversion check: a roofing square is 100 SF. If the item
       reports squares but the number only makes sense as square feet, the
       conversion was skipped somewhere upstream. */
    if (item.unitKey === "roofing_square" && area && quantity > (area * 2) / 100 * 5) {
      findings.push({
        id: `${item.workTypeKey}:unit-conversion`,
        workTypeKey: item.workTypeKey,
        severity: "block",
        message: `${item.label} reports ${quantity} squares (${Math.round(quantity * 100)} SF of roof). Check that square feet were converted to squares.`,
        quantity,
        unitKey: item.unitKey,
        family: item.family,
      });
      continue;
    }

    if (item.isAllowance) {
      findings.push({
        id: `${item.workTypeKey}:allowance`,
        workTypeKey: item.workTypeKey,
        severity: "confirm",
        message: `${item.label} is priced from an allowance, not a measurement.`,
        quantity,
        unitKey: item.unitKey,
        family: item.family,
      });
    }
  }

  return findings;
}

export function hasBlockingFinding(findings: SanityFinding[]): boolean {
  return findings.some((f) => f.severity === "block");
}
