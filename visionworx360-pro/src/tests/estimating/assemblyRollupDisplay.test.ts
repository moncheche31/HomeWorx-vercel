/**
 * A ballpark/estimate list shows ONE line per scope item. Materialized
 * assembly components roll up into their parent and are an opt-in drill-down;
 * the pricing data itself is untouched, and client documents never see it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
const row = readFileSync("src/features/estimating/components/EstimateLineRow.tsx", "utf8");
const core = readFileSync(
  "src/features/estimating/services/assemblyExpansion.core.ts",
  "utf8",
);

describe("assembly rollup display", () => {
  it("keeps component lines out of the main list", () => {
    expect(tab).toContain("if (line.parentLineId) continue;");
    expect(tab).toContain("componentsByParent");
  });

  it("passes components to the parent row", () => {
    expect(tab).toContain("components={componentsByParent.get(line.id) ?? []}");
  });

  it("shows the rolled-up parent price and no parts list", () => {
    expect(row).toContain('data-testid="line-rolled-total"');
    expect(row).toContain("rolledTotal");
    /* The component drill-down moved out to the Shopping List document. */
    expect(row).not.toContain('data-testid="line-components-toggle"');
  });


  it("never publishes component lines to a client document", () => {
    expect(core).toContain("is_client_visible: false");
  });
});
