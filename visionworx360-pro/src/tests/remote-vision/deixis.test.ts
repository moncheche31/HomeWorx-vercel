/**
 * PHASE 2 — object-level identity and deictic binding.
 *
 * Locks the authority boundary: a bound object adds LOCATION to a contractor
 * phrase, never scope, quantity or price.
 */

import { describe, expect, it } from "vitest";
import {
  collectTaggedObjects,
  extractDeicticPhrases,
  resolveDeicticReferences,
} from "@/domains/remoteVision/deixis";
import {
  sanitizeUnderstanding,
  type VisualObservation,
  type VisualRegion,
} from "@/domains/remoteVision/visualUnderstanding";

function region(partial: Partial<VisualRegion>): VisualRegion {
  return {
    objectId: "obj-1",
    mediaId: "photo-1",
    label: "door",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.3,
    ...partial,
  };
}

function observation(partial: Partial<VisualObservation>): VisualObservation {
  return {
    subjectKey: null,
    object: "door",
    nature: "observed_existing",
    actionKey: null,
    mediaIds: ["photo-1"],
    confidence: 0.7,
    note: null,
    regions: [],
    ...partial,
  };
}

describe("deictic phrase extraction", () => {
  it("finds pointing phrases in spoken order", () => {
    const phrases = extractDeicticPhrases("We replace that french door and refinish the trim.");
    expect(phrases.map((p) => p.head)).toEqual(["french door", "trim"]);
    expect(phrases[0]!.index).toBeLessThan(phrases[1]!.index);
  });

  it("ignores non-object pointing words", () => {
    const phrases = extractDeicticPhrases("Do the same thing on the rest of the project.");
    expect(phrases.map((p) => p.head)).not.toContain("same thing");
    expect(phrases.map((p) => p.head)).not.toContain("project");
  });
});

describe("deictic binding to tagged objects", () => {
  it("binds a phrase to the single matching object", () => {
    const observations = [
      observation({ object: "french door", regions: [region({ objectId: "door-a", label: "french door" })] }),
      observation({ object: "baseboard trim", regions: [region({ objectId: "trim-a", label: "baseboard trim" })] }),
    ];
    const bindings = resolveDeicticReferences("Replace that french door.", observations);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.status).toBe("bound");
    expect(bindings[0]!.objectId).toBe("door-a");
    expect(bindings[0]!.mediaId).toBe("photo-1");
  });

  it("refuses to guess when two objects match equally", () => {
    const observations = [
      observation({ object: "door", regions: [region({ objectId: "door-a" }), region({ objectId: "door-b" })] }),
    ];
    const bindings = resolveDeicticReferences("Replace that door.", observations);
    expect(bindings[0]!.status).toBe("ambiguous");
    expect(bindings[0]!.objectId).toBeNull();
    expect(bindings[0]!.candidateObjectIds).toEqual(["door-a", "door-b"]);
  });

  it("leaves a phrase unresolved when no object matches", () => {
    const observations = [observation({ object: "door", regions: [region({})] })];
    const bindings = resolveDeicticReferences("Rebuild that deck railing.", observations);
    expect(bindings[0]!.status).toBe("unresolved");
    expect(bindings[0]!.objectId).toBeNull();
  });

  it("never single-binds a plural reference", () => {
    const observations = [observation({ object: "window", regions: [region({ objectId: "win-a", label: "window" })] })];
    const bindings = resolveDeicticReferences("Replace those windows.", observations);
    expect(bindings[0]!.status).toBe("ambiguous");
  });

  it("returns nothing when the narration has no pointing phrase", () => {
    const observations = [observation({ regions: [region({})] })];
    expect(resolveDeicticReferences("Install new flooring throughout.", observations)).toEqual([]);
  });
});

describe("region sanitation", () => {
  const kinds = { "photo-1": "before_photo" } as const;

  it("drops boxes pointing at media we did not analyze", () => {
    const raw = {
      observations: [observation({ regions: [region({ mediaId: "ghost-photo" })] })],
      transformations: [],
      hiddenConditionWarnings: [],
      measurementTargets: [],
    };
    const clean = sanitizeUnderstanding(raw, { ...kinds });
    expect(clean.observations[0]!.regions).toEqual([]);
  });

  it("clamps boxes into the image and drops degenerate ones", () => {
    const raw = {
      observations: [
        observation({
          regions: [
            region({ objectId: "wide", x: 0.8, width: 0.9 }),
            region({ objectId: "flat", height: 0 }),
          ],
        }),
      ],
      transformations: [],
      hiddenConditionWarnings: [],
      measurementTargets: [],
    };
    const clean = sanitizeUnderstanding(raw, { ...kinds });
    const regions = clean.observations[0]!.regions!;
    expect(regions).toHaveLength(1);
    expect(regions[0]!.x + regions[0]!.width).toBeLessThanOrEqual(1);
  });

  it("guarantees unique object ids", () => {
    const raw = {
      observations: [
        observation({
          regions: [region({ objectId: "dupe" }), region({ objectId: "dupe", y: 0.5 })],
        }),
      ],
      transformations: [],
      hiddenConditionWarnings: [],
      measurementTargets: [],
    };
    const clean = sanitizeUnderstanding(raw, { ...kinds });
    const ids = clean.observations[0]!.regions!.map((r) => r.objectId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("tagged object collection", () => {
  it("deduplicates the same object across observations", () => {
    const observations = [
      observation({ regions: [region({ objectId: "door-a" })] }),
      observation({ object: "door casing", regions: [region({ objectId: "door-a" })] }),
    ];
    expect(collectTaggedObjects(observations)).toHaveLength(1);
  });
});
