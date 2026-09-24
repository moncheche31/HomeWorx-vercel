/**
 * Job-site location factors are applied SEPARATELY per cost component.
 * labor_pct -> labor, material_pct -> material, equipment_pct -> equipment.
 * total_weighted_avg_pct is a display figure and drives no calculation.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notice = readFileSync(
  "src/features/estimating/components/LocationFactorNotice.tsx",
  "utf8",
);
const core = readFileSync(
  "src/features/estimating/services/assemblyExpansion.core.ts",
  "utf8",
);
const prompt = readFileSync(
  "src/features/estimating/services/assemblyMaterialEstimate.server.ts",
  "utf8",
);
/* Find the location-factor migration by content: later migrations for other
   features must not make this assertion fail. */
const latestSql = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .filter((sql) => sql.includes("nce_location_factors"))
  .join("\n");


describe("separate location factors", () => {
  it("resolves the job site once and returns all three factors", () => {
    expect(latestSql).toContain("FUNCTION public.nce_location_factors");
    expect(latestSql).toContain("material_factor");
    expect(latestSql).toContain("labor_factor");
    expect(latestSql).toContain("equipment_factor");
  });

  it("uses each component's own factor in the pricing passes", () => {
    expect(latestSql).toContain("v_factor := v_loc.labor_factor;");
    expect(latestSql).toContain("v_mat_factor := v_loc.material_factor;");
    expect(latestSql).toContain("v_factor := v_loc.equipment_factor;");
  });

  it("never prices from the weighted average", () => {
    expect(latestSql).not.toMatch(/:=\s*[^;]*total_weighted_avg_pct/);
    expect(notice).toContain("displayTotalPct");
    expect(notice).not.toMatch(/labor \+ material \+ equipment/);
  });
});

describe("AI-estimated material is factored exactly once", () => {
  it("asks the model for a national price", () => {
    expect(prompt).toContain("NATIONAL AVERAGE");
  });

  it("applies the material factor at write time and records it", () => {
    expect(core).toContain('sb.rpc("nce_location_factors"');
    expect(core).toContain("nationalPerUnit * materialFactor");
    expect(core).toContain("locationFactorApplied: true");
  });

  it("keeps the book material pass off AI-estimated lines", () => {
    expect(latestSql).toContain("<> 'ai_estimated_material'");
  });
});
