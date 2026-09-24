/**
 * REMOTE VISION RATE AUTHORITY.
 *
 * Preliminary (photo/video/narrative) pricing must take its rates from the same
 * canonical assembly registry the detailed estimate prices from. The
 * illustrative ballpark pricebook is only a disclosed fallback for subjects the
 * canonical catalog does not cover yet — never a parallel price source for
 * subjects it does cover.
 */

import { describe, expect, it } from "vitest";
import { resolveFeatureAssembly } from "@/domains/remoteVision/featureAssembly";
import { canonicalForBallparkKey } from "@/domains/estimating/pricing/canonicalAssemblies";

describe("remote vision rate authority", () => {
  it("prices structural beams from the canonical registry, not the illustrative pricebook", () => {
    const { resolved, refusal } = resolveFeatureAssembly({
      featureKey: "structural.lvl_beam",
      unitKey: "linear_foot",
      quantity: 26,
    });
    const canonical = canonicalForBallparkKey("structural.beam_lvl");
    expect(refusal).toBeNull();
    expect(canonical).not.toBeNull();
    expect(resolved?.rateSource).toBe("canonical_registry");
    expect(resolved?.entry.laborHoursPerUnit).toBe(canonical!.laborHoursPerUnit);
    expect(resolved?.entry.materialCostPerUnit).toBe(canonical!.materialCostPerUnit);
  });

  it("prices posts/columns from the canonical registry with the stated count", () => {
    const { resolved } = resolveFeatureAssembly({
      featureKey: "structural.column",
      unitKey: "each",
      quantity: 2,
    });
    expect(resolved?.rateSource).toBe("canonical_registry");
    expect(resolved?.quantity).toBe(2);
  });

  it("prices built-in casework from the canonical registry", () => {
    const { resolved } = resolveFeatureAssembly({
      featureKey: "trim.builtin_casework",
      unitKey: "linear_foot",
      quantity: 10,
    });
    expect(resolved?.rateSource).toBe("canonical_registry");
  });

  it("discloses the illustrative fallback where the canonical catalog has no coverage", () => {
    const { resolved, refusal } = resolveFeatureAssembly({
      featureKey: "roofing.replace",
      unitKey: "square_foot",
      quantity: 1800,
    });
    expect(refusal).toBeNull();
    expect(resolved).not.toBeNull();
    if (canonicalForBallparkKey("roofing.shingle_replace")) {
      expect(resolved?.rateSource).toBe("canonical_registry");
    } else {
      expect(resolved?.rateSource).toBe("illustrative_pricebook");
    }
  });

  it("never invents an assembly for an unmapped feature", () => {
    const { resolved, refusal } = resolveFeatureAssembly({
      featureKey: "totally.unknown_feature",
      unitKey: "each",
      quantity: 1,
    });
    expect(resolved).toBeNull();
    expect(refusal).toBe("no_mapping");
  });
});
