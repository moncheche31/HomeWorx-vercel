/**
 * AN ASSUMED SIZE MUST ANNOUNCE ITSELF — every trade, every job, every place
 * its money is shown, and all the way down into anything derived from it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .filter((s) => s.includes("flag_estimate_line_placeholder_quantity"))
  .join("\n");
const row = readFileSync("src/features/estimating/components/EstimateLineRow.tsx", "utf8");
const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
const panel = readFileSync("src/features/estimating/components/AssemblyReviewPanel.tsx", "utf8");
const core = readFileSync("src/features/estimating/services/assemblyExpansion.core.ts", "utf8");

describe("placeholder quantity flag", () => {
  it("the basis decides the flag, not just a quantity of one", () => {
    expect(sql).toContain("ballpark_allowance");
    expect(sql).toContain("needs_evidence");
    expect(sql).toMatch(/quantity_basis IN \([^)]*'ballpark_allowance'/);
  });

  it("an explicit contractor review of the quantity clears it", () => {
    expect(sql).toContain("quantity_reviewed_at IS NULL");
  });

  it("warns wherever the total appears", () => {
    expect(row).toContain("line-quantity-placeholder");
    expect(row).toContain("Estimated size — not yet confirmed");
    expect(tab).toContain("placeholder-quantity-banner");
  });

  it("gates assembly derivation behind the parent's confidence", () => {
    expect(core).toContain("parentQuantityIsPlaceholder");
    expect(core).toMatch(/parentQuantityIsPlaceholder && c\.quantitySource !== "contractor"/);
    expect(panel).toContain("assembly-unconfirmed-base");
    expect(panel).toContain("unconfirmed");
  });
});
