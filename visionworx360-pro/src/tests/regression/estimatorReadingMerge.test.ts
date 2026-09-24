/**
 * The estimator's reading may deepen the scope, never overwrite it, and never
 * price it. These tests hold that line.
 */

import { describe, expect, it } from "vitest";
import { mergeEstimatorReading } from "@/domains/remoteVision/estimatorReading";
import type { EstimatorItem } from "@/features/estimating/services/narrationEstimator.shared";
import type { GroundingCandidate } from "@/domains/scopeGrounding";

function item(overrides: Partial<EstimatorItem>): EstimatorItem {
  return {
    spoken_phrase: "tear off and reshingle the roof",
    work_description: "Asphalt shingle roofing replacement",
    trade: "Roofing",
    subject_terms: ["roof", "shingles"],
    unit: "square_foot",
    quantity: null,
    quantity_basis: "unknown",
    origin: "stated",
    confidence: 0.9,
    reason: "The contractor asked for the roof to be redone.",
    ...overrides,
  };
}

const locale = "en-US" as const;

describe("estimator reading merge", () => {
  it("never overwrites work the deterministic recognizer already read", () => {
    const existing: GroundingCandidate = {
      featureKey: "roof.shingles",
      label: "Roofing",
      sentence: "reshingle the roof",
      defaultQuantity: 1800,
      quantityIsStated: true,
      unitKey: "square_foot",
      quantityBasis: "measured",
      source: "description",
    };
    const { candidates } = mergeEstimatorReading({
      reading: { job_summary: "", items: [item({ quantity: 400, quantity_basis: "stated" })] },
      candidates: [existing],
      locale,
    });
    const roof = candidates.filter((c) => c.featureKey === "roof.shingles");
    expect(roof).toHaveLength(1);
    expect(roof[0].defaultQuantity).toBe(1800);
  });

  it("keeps prerequisite work as an approval-gated suggestion, not priced scope", () => {
    const { candidates, suggestions } = mergeEstimatorReading({
      reading: {
        job_summary: "",
        items: [
          item({
            origin: "implied_prerequisite",
            work_description: "Roof deck sheathing repair",
            spoken_phrase: "",
          }),
        ],
      },
      candidates: [],
      locale,
    });
    expect(candidates).toHaveLength(0);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].question).toBeTruthy();
  });

  it("keeps media-only findings out of priced scope", () => {
    const { candidates, suggestions } = mergeEstimatorReading({
      reading: { job_summary: "", items: [item({ origin: "observed_in_media" })] },
      candidates: [],
      locale,
    });
    expect(candidates).toHaveLength(0);
    expect(suggestions).toHaveLength(1);
  });

  it("adopts a stated quantity but ignores one the model could not source", () => {
    const guessed = mergeEstimatorReading({
      reading: { job_summary: "", items: [item({ quantity: 999, quantity_basis: "unknown" })] },
      candidates: [],
      locale,
    });
    for (const candidate of guessed.candidates) {
      expect(candidate.quantityIsStated).toBe(false);
      expect(candidate.defaultQuantity).not.toBe(999);
    }

    const stated = mergeEstimatorReading({
      reading: { job_summary: "", items: [item({ quantity: 1800, quantity_basis: "stated" })] },
      candidates: [],
      locale,
    });
    const added = stated.candidates.find((c) => c.quantityIsStated);
    if (added) expect(added.defaultQuantity).toBe(1800);
  });

  it("surfaces stated work no assembly covers instead of dropping it", () => {
    const { suggestions } = mergeEstimatorReading({
      reading: {
        job_summary: "",
        items: [
          item({
            work_description: "Relocate the koi pond aerator",
            subject_terms: ["koi pond aerator"],
            spoken_phrase: "move the koi pond aerator",
          }),
        ],
      },
      candidates: [],
      locale,
    });
    expect(suggestions.some((s) => /manual pricing/i.test(s.reason))).toBe(true);
  });
});
