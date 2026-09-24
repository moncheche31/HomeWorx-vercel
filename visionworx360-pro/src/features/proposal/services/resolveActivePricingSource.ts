import { assessDetailedIntegrity, calculateEstimate, type DetailedIntegrity } from "@/domains/estimating";
import { readBallparkSummary, type BallparkSummary } from "@/features/estimating/services/ballparkSummary";
import type { EstimateDTO, EstimateLineDTO } from "@/features/estimating/types";

export type ActivePricingSource =
  | { kind: "ballpark"; range: BallparkSummary }
  | { kind: "detailed_complete"; total: number; integrity: DetailedIntegrity }
  | {
      kind: "detailed_incomplete";
      partialTotal: number;
      ballpark: BallparkSummary | null;
      integrity: DetailedIntegrity;
    };

const EMPTY_COST = {
  laborHours: 0,
  laborRate: 0,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
};

/**
 * The only proposal pricing selector. Estimate mode is authoritative: retained
 * detailed work can never bleed into a Ballpark proposal, while Detailed mode
 * must pass current-scope price coverage before its total is customer-ready.
 */
export function resolveActivePricingSource(input: {
  estimate: EstimateDTO;
  lines: EstimateLineDTO[];
  includedScopeItemIds?: string[];
}): ActivePricingSource | null {
  const ballpark = readBallparkSummary(input.estimate.rangeSnapshot);
  if (input.estimate.intakeMode === "ballpark") {
    return ballpark ? { kind: "ballpark", range: ballpark } : null;
  }

  const activeLines = input.lines.filter((line) => !line.archivedAt);
  const coveredScopeIds = new Set(
    activeLines.map((line) => line.scopeItemId).filter((id): id is string => Boolean(id)),
  );
  const missingScopeLines = (input.includedScopeItemIds ?? [])
    .filter((id) => !coveredScopeIds.has(id))
    .map(() => EMPTY_COST);
  const totals = calculateEstimate(activeLines, input.estimate.taxRate);
  const integrity = assessDetailedIntegrity({
    lines: [...activeLines, ...missingScopeLines],
    grandTotal: totals.grandTotal,
    ballpark,
  });

  return integrity.isIncomplete
    ? { kind: "detailed_incomplete", partialTotal: totals.grandTotal, ballpark, integrity }
    : { kind: "detailed_complete", total: totals.grandTotal, integrity };
}
