/**
 * ESTIMATE TAB ORDER — decision first, arithmetic last.
 *
 * The contractor must meet the ballpark band and the selling price before any
 * supporting panel, and the task breakdown must be the final substantive
 * section in BOTH modes. This asserts the render structure, not CSS order.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");

/*
 * The tab renders TWO documents: a ballpark-only screen (its own early return,
 * asserted by ballparkSevenBoxes) and the detailed estimate below it. Section
 * order is only meaningful WITHIN a branch, so the detailed branch is the slice
 * this file inspects.
 */
const DETAILED_BRANCH_AT = file.indexOf('data-testid="est-reconciliation"');
const source = file.slice(file.lastIndexOf("return (", DETAILED_BRANCH_AT));

const indexOfTestId = (id: string): number => {
  const at = source.indexOf(`data-testid="${id}"`);
  expect(at, `missing section ${id}`).toBeGreaterThan(-1);
  return at;
};

describe("EstimateTab section order", () => {
  const ORDER = [
    "est-ballpark-range",
    "est-financial-summary",
    "est-reconciliation",
    "est-assumptions",
    "ballpark-convert-primary",
    "est-geometry",
    "est-mode",
    "est-supporting",
    "est-task-breakdown",
  ];

  it("renders decision-level sections before supporting detail", () => {
    const positions = ORDER.map(indexOfTestId);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("puts the task breakdown after every other estimate section", () => {
    const breakdown = indexOfTestId("est-task-breakdown");
    for (const id of ORDER.slice(0, -1)) {
      expect(indexOfTestId(id)).toBeLessThan(breakdown);
    }
  });

  it("keeps the line-item rows and summary inside the final breakdown section", () => {
    const breakdown = indexOfTestId("est-task-breakdown");
    expect(source.indexOf("<EstimateLineRow")).toBeGreaterThan(breakdown);
    expect(source.indexOf("<EstimateSummaryPanel")).toBeGreaterThan(breakdown);
  });

  /*
   * One conversion CTA per rendered document. The ballpark-only screen and the
   * detailed screen each own exactly one; the duplicated bottom CTA that fired
   * the scope-seeding mutation with no confirmation must stay gone.
   */
  it("exposes no unconfirmed duplicate convert CTA", () => {
    expect(file).not.toMatch(/ballpark-convert-footer/);
    expect(source.match(/convertToDetailed\.mutateAsync/g) ?? []).toHaveLength(1);
    expect(file.match(/data-testid="ballpark-convert-primary"/g) ?? []).toHaveLength(2);
  });

  it("no longer renders the mode/labor/material panels ahead of the band", () => {
    expect(indexOfTestId("est-mode")).toBeGreaterThan(indexOfTestId("est-ballpark-range"));
    expect(indexOfTestId("est-supporting")).toBeGreaterThan(indexOfTestId("est-financial-summary"));
  });
});
