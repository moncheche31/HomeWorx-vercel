import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PILOT_CONVERT_TO_DETAILED_ENABLED } from "@/config/pilot";

/**
 * PILOT SCOPE FREEZE. "Convert to Detailed" must not be reachable from the
 * ballpark card while the pilot runs; the flag is the only switch.
 */
describe("pilot feature gates", () => {
  it("keeps Convert to Detailed disabled for the pilot", () => {
    expect(PILOT_CONVERT_TO_DETAILED_ENABLED).toBe(false);
  });

  it("wires the convert handler through the pilot gate only", () => {
    const src = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
    expect(src).toContain("PILOT_CONVERT_TO_DETAILED_ENABLED");
    /* The handler must sit inside the gated spread, never as a bare prop. */
    expect(src).not.toMatch(/\n\s+onConvertToDetailed=\{async/);
  });
});
