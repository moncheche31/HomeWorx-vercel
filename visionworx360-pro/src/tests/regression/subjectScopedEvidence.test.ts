/**
 * SUBJECT-SCOPED MEASUREMENT EVIDENCE + ALLOWANCE SEMANTICS.
 *
 * The "Built in bookcases" job exposed two defects that both produced
 * indefensible numbers:
 *
 *   1. Any measurement anywhere in the transcript could become any line's
 *      quantity, so a spoken "26 foot LVL" became 26 linear feet of built-in
 *      bookcases while wall and closet demolition fell back to catalog
 *      defaults even though the contractor stated ~6 ft for each.
 *   2. Work with no derivable size (custom casework, an un-engineered LVL) was
 *      priced as if its catalog default were measured truth.
 *
 * The contract locked here: a measurement is evidence only for the subject it
 * was spoken about, and un-stated custom work prices as a labelled ballpark
 * allowance that always needs review — never as measured truth and never $0.
 */

import { describe, expect, it } from "vitest";
import { analyzeDescription, buildScenarios, collectFeatures } from "@/domains/remoteVision";
import { statedLengthForSubject } from "@/domains/workRecognition/recognize";
import type { VisionAnalysisRequest } from "@/domains/remoteVision/types";

const NARRATIVE =
  "Okay, what we're doing here is we are removing the two closets. It's about six feet width of the two closets that's on the backside of that range hood. " +
  "So we're removing those closets completely. We're gonna remove that green wall. It's about six foot length of wall. " +
  "And then we are going to put in a LVL, about 26 foot LVL and double LVL to span that whole distance. " +
  "We're gonna open up the floor plan and we're gonna put in some two columns in between and we're gonna do some built-in bookcases, just like the after rendering.";

function request(description: string): VisionAnalysisRequest {
  return {
    locale: "en-US",
    providerId: "test",
    description,
    media: [],
    confirmedMeasurements: [],
  } as unknown as VisionAnalysisRequest;
}

async function features(description: string) {
  const result = await analyzeDescription(request(description));
  return collectFeatures(result);
}

function find(list: Awaited<ReturnType<typeof features>>, key: string) {
  return list.find((f) => f.featureKey === key);
}

describe("subject-scoped measurement evidence", () => {
  it("only accepts a length spoken about the subject", () => {
    const text = "Remove that green wall. It's about six foot length of wall. Install a 26 foot LVL.";
    expect(statedLengthForSubject(text, /\bwall\b/i)).toBe(6);
    expect(statedLengthForSubject(text, /\blvl\b/i)).toBe(26);
    expect(statedLengthForSubject(text, /\bbookcase(s)?\b/i)).toBeNull();
  });

  it("prices wall and closet demolition on the stated ~6 ft, not a default", async () => {
    const list = await features(NARRATIVE);
    const wall = find(list, "structural.wall_removal");
    const closet = find(list, "demolition.closet_removal");
    expect(wall?.quantity).toBe(6);
    expect(wall?.unitKey).toBe("linear_foot");
    expect(wall?.provenance?.isDefault).toBe(false);
    expect(closet?.quantity).toBe(6);
    expect(closet?.provenance?.isDefault).toBe(false);
  });

  it("keeps the 26 ft LVL span as length and never as 26 members", async () => {
    const beam = find(await features(NARRATIVE), "structural.lvl_beam");
    expect(beam?.quantity).toBe(26);
    expect(beam?.unitKey).toBe("linear_foot");
  });

  it("honours an explicit count of two columns", async () => {
    const column = find(await features(NARRATIVE), "structural.column");
    expect(column?.quantity).toBe(2);
    expect(column?.unitKey).toBe("each");
  });

  it("never lets the beam span become the built-in casework quantity", async () => {
    const builtIn = find(await features(NARRATIVE), "trim.builtin_casework");
    expect(builtIn).toBeDefined();
    expect(builtIn?.quantity).not.toBe(26);
    expect(builtIn?.provenance?.source).toBe("ballpark_allowance");
    expect(builtIn?.provenance?.isDefault).toBe(true);
  });

  it("adopts a built-in length the contractor actually states", async () => {
    const builtIn = find(
      await features("We're doing built-in bookcases. The bookcases run about 14 feet."),
      "trim.builtin_casework",
    );
    expect(builtIn?.quantity).toBe(14);
    expect(builtIn?.provenance?.source).not.toBe("ballpark_allowance");
  });

  it("creates no appliance work from a purely spatial mention", async () => {
    const list = await features(NARRATIVE);
    expect(list.some((f) => f.featureKey.startsWith("appliance"))).toBe(false);
  });
});

describe("allowance pricing stays nonzero and reviewable", () => {
  it("prices built-ins and the LVL with review flags and no zeros", async () => {
    const result = await analyzeDescription(request(NARRATIVE));
    const scenarios = buildScenarios(result, [], "en-US");
    const mid = scenarios[Math.floor(scenarios.length / 2)]!;
    const line = (key: string) => mid.drivers.find((d) => d.featureKey === key);

    expect(mid.pricingBlocked).toBe(false);
    expect(mid.costLow).toBeGreaterThan(0);
    expect(mid.costHigh).toBeGreaterThan(mid.costLow);

    for (const key of [
      "structural.wall_removal",
      "demolition.closet_removal",
      "structural.lvl_beam",
      "structural.column",
      "trim.builtin_casework",
    ]) {
      expect(line(key)?.costHigh ?? 0).toBeGreaterThan(0);
    }
    expect(line("trim.builtin_casework")?.needsReview).toBe(true);
    expect(line("structural.lvl_beam")?.needsReview).toBe(true);
  });
});
