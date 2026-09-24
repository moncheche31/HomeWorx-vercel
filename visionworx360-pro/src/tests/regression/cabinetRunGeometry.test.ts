import { describe, expect, it } from "vitest";

import { formatInchesOnly } from "@/domains/measurement";
import { describeCabinetRun, reconcileCabinetRun } from "@/domains/scopeGrounding/cabinetry";
import { groundScope } from "@/domains/scopeGrounding/ground";

/**
 * The contractor's exact facts for the pilot kitchen:
 *   wall  = 94"
 *   base  = 3 x 30" + 2" filler each end = 94" exactly
 *   upper = 15" + 15" + 30" + 30"        = 90", 4" unresolved
 *   24" deep / 30" tall are NOT widths
 *
 * The regression these tests lock down: a component width was being promoted to
 * "the wall" (94" displayed as 2'6"), the whole utterance collapsed into one
 * cabinet, filler accumulated, and inch-scale cabinet widths printed as feet.
 */
const PERIODS =
  "The kitchen wall is 94 inches wide. Install three 30 inch wide base cabinets with a 2 inch filler at each end. " +
  "The uppers are a 15 inch wide full depth bread box cabinet, a 15 inch wide glass door cabinet, a 30 inch wide wine cabinet, " +
  "and a 30 inch wide upper with one glass door and one raised panel door. Cabinets are 24 inches deep and 30 inches tall.";

const COMMAS =
  "The wall is 94 inches. Base cabinets are 30 inches wide, three of them, with two inch fillers on either end. " +
  "Uppers: a 15 inch bread box cabinet and a 15 inch glass door cabinet and a 30 inch wine cabinet and a 30 inch cabinet " +
  "with one glass door and one raised panel door. Cabinets are 24 inches deep, 30 inches tall.";

const TERSE =
  "wall 94 inches wide, 3 base cabinets 30 inches wide each, 2 inch filler each end, " +
  "15 inch upper bread box full depth, 15 inch glass door upper, 30 inch wine cabinet, " +
  "30 inch upper cabinet 24 inches deep 30 inches tall";

describe("cabinet run geometry stays exact", () => {
  for (const [label, text] of [
    ["periods", PERIODS],
    ["commas", COMMAS],
    ["terse", TERSE],
  ] as const) {
    describe(label, () => {
      const run = reconcileCabinetRun(text);

      it("reads the wall as 94 inches, shown as 7' 10\"", () => {
        expect(run.wallInches).toBe(94);
        expect(run.wallDisplay).toBe("7' 10\"");
      });

      it("keeps the run at 7.833 linear feet and never rounds it to 8", () => {
        expect(run.runFeet).toBe(7.833);
      });

      it("reconciles the base run to the wall exactly", () => {
        expect(run.fillerInches).toBe(4);
        expect(run.baseTotalInches).toBe(94);
        expect(run.baseUnresolvedInches).toBe(0);
        expect(run.reconciled).toBe(true);
      });

      it("totals the uppers at 90 inches with 4 inches unresolved", () => {
        expect(run.upperTotalInches).toBe(90);
        expect(run.upperUnresolvedInches).toBe(4);
      });

      it("never treats 24\" depth or 30\" height as a width", () => {
        const widths = run.components.map((c) => c.widthInches);
        expect(widths).not.toContain(24);
        expect(widths.filter((w) => w === 94)).toHaveLength(0);
      });

      it("keeps base and upper components separate", () => {
        const base = run.components.filter((c) => c.kind === "base");
        const upper = run.components.filter((c) => c.kind === "upper");
        expect(base.reduce((n, c) => n + c.count, 0)).toBe(3);
        expect(upper.length).toBeGreaterThanOrEqual(4);
      });

      it("describes component widths in inches, not feet", () => {
        const sentence = describeCabinetRun(run)!;
        expect(sentence).toContain('30" base cabinet');
        expect(sentence).toContain('4" of filler strips');
        expect(sentence).not.toMatch(/2' 6"/);
        expect(sentence).not.toMatch(/1' 3"/);
      });
    });
  }

  it("attaches specialty features to their own cabinet", () => {
    const run = reconcileCabinetRun(PERIODS);
    const uppers = run.components.filter((c) => c.kind === "upper");
    expect(uppers.find((c) => c.widthInches === 15 && c.descriptor === "bread box")).toBeTruthy();
    expect(uppers.find((c) => c.widthInches === 30 && c.descriptor?.includes("wine"))).toBeTruthy();
  });

  it("prices the run from the exact wall width, unrounded", () => {
    const grounded = groundScope({
      text: PERIODS,
      candidates: [
        {
          featureKey: "cabinets.replace",
          label: "Cabinetry",
          sentence: "Install three 30 inch wide base cabinets",
          defaultQuantity: 24,
          unitKey: "linear_foot",
        },
      ],
    });

    const cabinets = grounded.explicit.find((item) => item.featureKey === "cabinets.replace")!;
    expect(cabinets.quantity).toBe(7.833);
    expect(cabinets.unitKey).toBe("linear_foot");
    expect(cabinets.provenance.evidence).toBe("7' 10\"");
  });
});

describe("formatInchesOnly", () => {
  it("keeps shop dimensions in inches", () => {
    expect(formatInchesOnly(30)).toBe('30"');
    expect(formatInchesOnly(4)).toBe('4"');
    expect(formatInchesOnly(94)).toBe('94"');
    expect(formatInchesOnly(15.5)).toBe('15 1/2"');
  });
});
