/**
 * Saved-ballpark visibility regressions.
 *
 * A ballpark-mode estimate is a real saved estimate: it must survive the
 * dashboard listing, unpriced/unmatched lines, repeated saves and reload,
 * without the legacy scope-derived preliminary range competing with it.
 */
import { describe, expect, it } from "vitest";
import { readBallparkSummary } from "../services/ballparkSummary";
import { listRecentEstimatesSchema, updateEstimateSchema } from "../services/schemas";
import en from "@/i18n/locales/en-US/workspace.json";
import es from "@/i18n/locales/es-US/workspace.json";
import estimateTabSource from "../components/EstimateTab.tsx?raw";
import startSource from "@/start.ts?raw";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  kind: "ballpark" as const,
  mode: "ballpark" as const,
  currency: "USD",
  calculatedAt: "2026-08-03T00:00:00.000Z",
  savedAt: "2026-08-03T00:00:00.000Z",
  intakeMethod: "onsite" as const,
  band: { low: 34500, expected: 38750, high: 43000 },
  confidence: "medium" as const,
  unknownWidenPct: 12,
  assumptions: [],
  unknowns: [],
  quantities: [],
  geometry: { lengthFt: 16, widthFt: 18, ceilingHeightFt: 8 },
  ...overrides,
});

describe("ballpark summary", () => {
  it("reads the saved band regardless of detailed pricing", () => {
    expect(readBallparkSummary(snapshot())).toMatchObject({
      low: 34500,
      expected: 38750,
      high: 43000,
      confidence: "medium",
    });
  });

  it("ignores a tiered (detailed) snapshot so detailed estimates are unaffected", () => {
    expect(
      readBallparkSummary({
        currency: "USD",
        calculatedAt: "2026-08-03T00:00:00.000Z",
        tiers: [{ tier: "better", low: 1, mid: 2, high: 3 }],
      }),
    ).toBeNull();
    expect(readBallparkSummary(null)).toBeNull();
  });

  it("survives reload: the same persisted JSON re-reads to the same range", () => {
    const roundTripped = JSON.parse(JSON.stringify(snapshot()));
    expect(readBallparkSummary(roundTripped)).toEqual(readBallparkSummary(snapshot()));
  });
});

describe("recent estimates listing", () => {
  it("is workspace-wide and filters by nothing but a row limit", () => {
    const input = listRecentEstimatesSchema.parse({});
    expect(input).toEqual({ limit: 6 });
    expect(Object.keys(listRecentEstimatesSchema.parse({ limit: 10 }))).toEqual(["limit"]);
  });

  it("repeated saves stay idempotent: one snapshot field, same shape", () => {
    const first = updateEstimateSchema.parse({
      estimateId: "9c2a4e70-1d5b-4c3a-8f2e-2f0f8b0f1a11",
      rangeSnapshot: snapshot(),
    });
    const second = updateEstimateSchema.parse({
      estimateId: "9c2a4e70-1d5b-4c3a-8f2e-2f0f8b0f1a11",
      rangeSnapshot: snapshot({ savedAt: "2026-08-04T00:00:00.000Z" }),
    });
    expect(Object.keys(second)).toEqual(Object.keys(first));
  });

  it("ships bilingual dashboard copy for the ballpark row", () => {
    for (const bundle of [en, es]) {
      expect(bundle.cards.recentEstimates.ballpark).toBeTruthy();
      expect(bundle.cards.recentEstimates.expected).toContain("{{value}}");
      expect(bundle.cards.recentEstimates.updated).toContain("{{date}}");
    }
  });
});

describe("estimate page consistency", () => {
  it("suppresses the legacy preliminary range panel in ballpark mode", () => {
    expect(estimateTabSource).toMatch(/\{isBallpark \? null : \(\s*<EstimateRangePanel/);
  });

  it("keeps the auth guardrail intact", () => {
    expect(startSource).toMatch(/functionMiddleware:\s*\[attachConfiguredAuth\]/);
    expect(startSource).not.toMatch(/^import .*attachSupabaseAuth/m);
  });
});
