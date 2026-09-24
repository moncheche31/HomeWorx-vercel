import { describe, expect, it } from "vitest";
import { analyzeDescription, collectFeatures } from "@/domains/remoteVision/analyze";
import { buildRemoteNarrative } from "@/domains/remoteVision/narrative";
import { bookRowContextConflicts } from "@/features/estimating/services/assemblyExpansion.core";

/**
 * Judy's deck: "white vinyl trim around the deck edge".
 *
 * The written scope shown for approval must read back the contractor's own
 * words. It previously came back as "baseboard and casing trim" — two
 * interior-only terms on an exterior deck job.
 */
const NARRATION =
  "Okay, what we're doing here is we're demoing the old deck. It's a 10 by 14 deck, and we're going " +
  "to rebuild it in the same spot. Another 10 by 14 deck with composite decking, vinyl railings, " +
  "white vinyl trim around the deck edge.";


describe("exterior trim keeps the contractor's wording", () => {
  const result = analyzeDescription({
    description: NARRATION,
    media: [],
    locale: "en-US",
  } as never);
  const features = collectFeatures(result);

  it("recognizes exterior trim, not interior trim", () => {
    const keys = features.map((f) => f.featureKey);
    expect(keys).toContain("trim.exterior");
    expect(keys).not.toContain("trim.replace");
  });

  it("writes the scope in his words, never baseboard or casing", () => {
    const doc = buildRemoteNarrative({
      projectName: "Judy's deck",
      locale: "en-US",
      result,
      assumptions: [],
    });
    const text = JSON.stringify(doc).toLowerCase();
    expect(text).toContain("vinyl trim");
    expect(text).not.toContain("baseboard");
    expect(text).not.toContain("casing");
  });
});

describe("book rows cannot cross the building envelope", () => {
  const component = { name: "vinyl trim board", searchTerms: ["exterior pvc trim board"] };

  it("rejects an interior baseboard row for exterior trim", () => {
    expect(
      bookRowContextConflicts(component, {
        description: "Baseboard and casing, pine, 3-1/4\"",
        section: "Interior trim",
      }),
    ).toBe(true);
  });

  it("accepts an exterior trim row", () => {
    expect(
      bookRowContextConflicts(component, {
        description: "PVC trim board, 1 x 6",
        section: "Siding and exterior trim",
      }),
    ).toBe(false);
  });

  it("rejects an exterior siding row for interior baseboard work", () => {
    expect(
      bookRowContextConflicts(
        { name: "baseboard", searchTerms: ["interior casing"] },
        { description: "Vinyl siding, standard", section: "Siding" },
      ),
    ).toBe(true);
  });
});
