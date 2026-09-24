/**
 * REGRESSION — Pembroke Exterior Remodel ($76,698 ballpark saved as $1,013).
 *
 * The ballpark priced roofing / siding / fascia / landscaping / deck from
 * standard allowances, but the commit sent `quantity: null` for each of them.
 * They persisted as `quantity 1` placeholders with `resolution_status:
 * 'unresolved'`, and `estimate_invariant_cost` — which sums RESOLVED lines
 * only — dropped six of seven lines from the canonical total.
 *
 * The allowance quantity must travel with the commit, flagged `assumed`.
 */

import { describe, expect, it } from "vitest";
import {
  commitFromReplay,
  groundedToCanonicalItems,
  tradeForFeatureKey,
} from "@/domains/remoteVision/commitPayload";
import type { GroundedScopeItem } from "@/domains/scopeGrounding/types";

const item = (over: Partial<GroundedScopeItem>): GroundedScopeItem =>
  ({
    id: over.featureKey ?? "x",
    featureKey: "roofing.replace",
    label: "Roofing",
    unitKey: "square_foot",
    quantity: null,
    pricingQuantity: null,
    ...over,
  }) as GroundedScopeItem;

describe("ballpark allowance quantities survive commit", () => {
  it("commits the allowance quantity instead of a null placeholder", () => {
    const [line] = groundedToCanonicalItems(
      [item({})],
      [],
      [
        {
          featureKey: "roofing.replace",
          label: "Roofing",
          quantity: 2250,
          unitKey: "square_foot",
          basisKey: "whole_structure",
        },
      ],
    );
    expect(line.quantity).toBe(2250);
    expect(line.pricingQuantity).toBe(2250);
    expect(line.unitKey).toBe("square_foot");
    /* Assumed, never contractor authority — it still needs review. */
    expect(line.quantityBasis).toBe("assumed");
    expect(line.confirmed).toBe(false);
    expect(line.quantityBasisNote).toContain("2250");
  });

  it("never overrides a quantity the contractor actually stated", () => {
    const [line] = groundedToCanonicalItems(
      [item({ quantity: 2, pricingQuantity: 2, unitKey: "each", featureKey: "column.install" })],
      [],
      [
        {
          featureKey: "column.install",
          label: "Columns",
          quantity: 99,
          unitKey: "each",
          basisKey: "standard",
        },
      ],
    );
    expect(line.quantity).toBe(2);
    expect(line.quantityBasis).toBeUndefined();
  });

  it("leaves unmatched features unpriced rather than inventing a size", () => {
    const [line] = groundedToCanonicalItems([item({ featureKey: "mystery.work" })], [], []);
    expect(line.quantity).toBeNull();
    expect(line.quantityBasis).toBeUndefined();
  });

  it("preserves selected scenario allowances through replay recovery", () => {
    const payload = commitFromReplay("7fade42d-d808-4f7a-a97a-a95211f16174", {
      grounded: [item({ featureKey: "landscaping.install", label: "Landscaping" })],
      scenarios: [{
        level: "economy",
        label: "Economy",
        costLow: 12000,
        costHigh: 16000,
        confidence: 0.5,
        durationDays: 5,
        drivers: [{
          featureKey: "landscaping.install",
          label: "Landscaping",
          costLow: 12000,
          costHigh: 16000,
          laborHours: 40,
          crewHours: 40,
          needsReview: true,
          assemblyKey: "landscaping.install",
          pricingBasis: "book_nce2026",
          quantityBasis: "ballpark_allowance",
        }],
        allowanceFeatures: [{
          featureKey: "landscaping.install",
          label: "Landscaping",
          quantity: 2700,
          unitKey: "square_foot",
          basisKey: "site_area",
        }],
      }],
    });
    expect(payload?.items?.[0]).toMatchObject({
      tradeKey: "exterior",
      quantity: 2700,
      quantityBasis: "assumed",
    });
  });

  it("routes landscaping into the exterior trade", () => {
    expect(tradeForFeatureKey("landscaping.install")).toBe("exterior");
  });
});
