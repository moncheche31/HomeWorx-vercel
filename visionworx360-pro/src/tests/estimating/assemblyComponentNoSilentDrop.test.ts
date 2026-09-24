import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/* AN APPROVED COMPONENT NEVER DISAPPEARS. Where the build-up would out-price
   the parent task, the line is still written — visible and flagged — rather
   than skipped with only a counter to show for it. */
const core = readFileSync(
  "src/features/estimating/services/assemblyExpansion.core.ts",
  "utf8",
);
const panel = readFileSync(
  "src/features/estimating/components/AssemblyReviewPanel.tsx",
  "utf8",
);

describe("assembly component materialization", () => {
  it("does not skip over-budget components before inserting the row", () => {
    expect(core).toContain("const overBudget =");
    expect(core).not.toContain("skippedCoveredByParent += 1;\n      continue;");
  });

  it("flags the over-budget component instead of pricing it", () => {
    expect(core).toContain('overBudget\n          ? "assembly_component_exceeds_parent_scope"');
    expect(core).toContain("const priceable = hasMatch && !missing && !overBudget;");
    expect(core).toContain('pricing_source: priceable ? "nce_2026_book" : "unmatched"');
  });

  it("never writes book pricing provenance for an unpriced component", () => {
    expect(core).toContain("...(priceable\n          ? {\n              bookSource: {");
  });

  it("lets the contractor approve an assembly that has unmatched parts", () => {
    expect(panel).toContain('data-testid="assembly-approve"');
    expect(panel).not.toContain("needsDecision");
  });
});
