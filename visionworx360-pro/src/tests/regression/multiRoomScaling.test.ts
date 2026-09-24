/**
 * Multi-room / whole-house failure modes.
 *
 * Before this, every catalog default was a single-room number: "paint all
 * three bedrooms" priced one bedroom, and any unmeasured default of any size
 * shipped silently. Both are pilot-blocking on real jobs.
 */
import { describe, expect, it } from "vitest";
import {
  detectRoomScaling,
  groundScope,
  runScopeSanityGate,
  type GroundedScope,
  type GroundingCandidate,
} from "@/domains/scopeGrounding";
import { WORK_RULES } from "@/domains/remoteVision/lexicon";

/** Mirrors how `analyzeDescription` feeds the grounder: keyword hits only. */
function ground(text: string): GroundedScope {
  const lines = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const candidates: GroundingCandidate[] = WORK_RULES.flatMap((rule) => {
    const hit = lines.find((l) => rule.match.test(l));
    if (!hit) return [];
    return [{
      featureKey: rule.featureKey,
      label: rule.label["en-US"],
      sentence: hit.trim(),
      defaultQuantity: rule.quantity ?? null,
      unitKey: rule.unitKey ?? null,
      source: "description" as const,
    }];
  });
  return groundScope({ text, candidates });
}

describe("room-count detection", () => {
  it("counts distinct rooms named in one sentence", () => {
    const s = detectRoomScaling("Paint the kitchen, both bathrooms and the living room.");
    expect(s.roomCount).toBeGreaterThan(1);
    expect(s.multiplier).toBeGreaterThan(1);
  });

  it("treats numbered rooms as a count", () => {
    const s = detectRoomScaling("Replace flooring in three bedrooms.");
    expect(s.roomCount).toBe(3);
    expect(s.multiplier).toBe(3);
  });

  it("recognizes whole-area language", () => {
    const s = detectRoomScaling("New LVP throughout the whole house.");
    expect(s.wholeArea).toBe(true);
    expect(s.multiplier).toBeGreaterThan(1);
  });

  it("stays at 1x for a single-room job", () => {
    const s = detectRoomScaling("Retile the shower in the hall bathroom.");
    expect(s.multiplier).toBe(1);
  });

  it("never runs away on absurd input", () => {
    const s = detectRoomScaling("kitchen ".repeat(200));
    expect(s.multiplier).toBeLessThanOrEqual(12);
  });

  it("is safe on empty input", () => {
    expect(detectRoomScaling("").multiplier).toBe(1);
    expect(detectRoomScaling(null).roomCount).toBe(0);
  });
});

describe("grounding discloses scaling instead of hiding it", () => {
  it("records room scaling on the grounded scope", () => {
    const scope = ground("Paint three bedrooms and install new flooring in each.");
    expect(scope.roomScaling.multiplier).toBeGreaterThan(1);
  });

  it("raises a clarification the contractor must answer", () => {
    const scope = ground("Paint three bedrooms and install new flooring in each.");
    expect(scope.clarifications.some((c) => c.topic === "room_count")).toBe(true);
  });

  it("leaves single-room jobs unscaled and unclarified", () => {
    const scope = ground("Paint the hall bathroom.");
    expect(scope.roomScaling.multiplier).toBe(1);
    expect(scope.clarifications.some((c) => c.topic === "room_count")).toBe(false);
  });

  it("scaled quantities are still marked as defaults, never measurements", () => {
    const scope = ground("Paint three bedrooms.");
    for (const item of scope.explicit) {
      if (item.provenance.rationale.includes("multiplied by")) {
        expect(item.provenance.isDefault).toBe(true);
        expect(item.provenance.source).toBe("assembly_default");
      }
    }
  });
});

describe("sanity gate covers every trade, not just cabinets", () => {
  it("flags a large unmeasured default for confirmation", () => {
    const scope = ground("New LVP flooring throughout the entire house.");
    const { findings } = runScopeSanityGate(scope, {});
    const big = scope.explicit.some(
      (i) => i.provenance.isDefault && (i.quantity ?? 0) >= 400 && i.unitKey === "square_foot",
    );
    if (big) {
      expect(findings.some((f: { kind: string; severity: string }) => f.kind === "unconfirmed_default")).toBe(true);
    }
  });

  it("does not block on warnings alone", () => {
    const scope = ground("New LVP flooring throughout the entire house.");
    const result = runScopeSanityGate(scope, {});
    expect(result.findings.every((f: { kind: string; severity: string }) => f.severity !== "blocker")).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it("stays quiet on a small measured job", () => {
    const scope = ground("Install 120 square feet of tile in the hall bathroom.");
    const { findings } = runScopeSanityGate(scope, {});
    expect(findings.some((f: { kind: string; severity: string }) => f.kind === "unconfirmed_default")).toBe(false);
  });
});
