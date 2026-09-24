/**
 * BALLPARK SCREEN — exact contractor spec.
 *
 * Seven boxes, in order: preliminary range, selected selling price, permits,
 * conversion prompt, estimate type, TRUNCATED labor & hours (Tasks / Trades /
 * Project buttons only), materials. No assumption or provenance disclosure,
 * no placeholder warning, no inline task/trade/project detail.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
const labor = readFileSync("src/features/estimating/components/LaborHoursPanel.tsx", "utf8");

/** The ballpark early-return branch only. */
const ballparkBranch = (() => {
  const start = tab.indexOf('data-testid="ballpark-screen"');
  return tab.slice(start, tab.indexOf("  return (", start));
})();

describe("Ballpark screen renders exactly the seven specified boxes", () => {
  const boxes = [
    '<BallparkRangeCard',
    '<FinancialSummaryPanel',
    '<PermitAllowancePanel',
    'data-testid="ballpark-convert-primary"',
    '<EstimateModeCard',
    '<LaborHoursPanel',
    '<MaterialsPanel',
  ];

  it("contains all seven boxes, in the specified order", () => {
    let cursor = -1;
    for (const box of boxes) {
      const at = ballparkBranch.indexOf(box);
      expect(at, box).toBeGreaterThan(-1);
      expect(at, box).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("suppresses assumption / provenance disclosure on the range box", () => {
    expect(ballparkBranch).toContain("hideExplanations");
  });

  it("renders no inline line items, unresolved panel or geometry takeoff", () => {
    for (const forbidden of [
      "<UnresolvedLinesPanel",
      "<GeometryQuantitiesPanel",
      "<EstimateLineRow",
      "Estimated size — not yet confirmed",
    ]) {
      expect(ballparkBranch).not.toContain(forbidden);
    }
  });

  it("truncates the labor box", () => {
    expect(ballparkBranch).toMatch(/<LaborHoursPanel\s+truncated/);
  });
});

describe("Labor & hours truncated mode", () => {
  it("shows the four headline numbers", () => {
    for (const key of [
      'label={t("labor.totalHours")}',
      'label={t("labor.baselineHours")}',
      'label={t("labor.laborDollars")}',
      'label={t("labor.workingDays")}',
    ]) {
      expect(labor).toContain(key);
    }
  });

  it("replaces the inline breakdown with Tasks / Trades / Project buttons", () => {
    expect(labor).toContain('data-testid="labor-detail-buttons"');
    expect(labor).toContain("data-testid={`labor-open-${v}`}");
    expect(labor).toMatch(/\{truncated \? \([\s\S]*?\) : \(\s*tabsNode\s*\)\}/);
  });

  it("opens the breakdown in a separate dialog", () => {
    expect(labor).toMatch(/<Dialog open=\{detailOpen\}[\s\S]*?\{tabsNode\}/);
  });
});
