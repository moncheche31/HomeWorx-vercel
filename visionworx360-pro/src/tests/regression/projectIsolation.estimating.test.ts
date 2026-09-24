/**
 * Project isolation regression.
 *
 * Two projects can sit at the same property (a kitchen job and a garage
 * conversion at one address). Scope, rooms and estimate lines must be selected
 * by PROJECT, never by property — otherwise kitchen scope walks into the
 * garage estimate. The property is allowed to be read for ONE purpose only:
 * resolving regional pricing (postal code / region / county).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

/** Tables whose rows belong to exactly one project. */
const PROJECT_SCOPED_TABLES = [
  "scope_sections",
  "scope_items",
  "project_rooms",
  "project_measurements",
  "project_photos",
  "project_documents",
  "estimates",
];

describe("scope and estimate reads are keyed to the current project", () => {
  const scopeSrc = read("src/features/scope/services/scope.functions.ts");
  const estimatingSrc = read("src/features/estimating/services/estimating.functions.ts");

  it.each(PROJECT_SCOPED_TABLES)(
    "%s is never selected by property_id",
    (table) => {
      for (const src of [scopeSrc, estimatingSrc]) {
        const selects = src.split(`from("${table}")`).slice(1);
        for (const chunk of selects) {
          const statement = chunk.split(";")[0] ?? "";
          expect(statement).not.toContain('eq("property_id"');
          expect(statement).not.toContain('"property_id",');
        }
      }
    },
  );

  it("reads the property only to resolve regional pricing location", () => {
    const propertyReads = estimatingSrc.split('from("properties")').slice(1);
    expect(propertyReads.length).toBeGreaterThan(0);
    for (const chunk of propertyReads) {
      const statement = chunk.split(";")[0] ?? "";
      // location fields only — no scope, room or line columns
      expect(statement).toMatch(/postal_code|region|county/);
      expect(statement).not.toMatch(/scope|room|line_item|description/i);
    }
  });

  it("every scope mutation is constrained by both organization and project", () => {
    const mutations = scopeSrc.match(/\.eq\("project_id", [^)]+\)/g) ?? [];
    expect(mutations.length).toBeGreaterThan(10);
    // The organization filter must appear at least as often as the project one,
    // so a project id alone can never widen access across tenants.
    const orgFilters = scopeSrc.match(/\.eq\("organization_id", [^)]+\)/g) ?? [];
    expect(orgFilters.length).toBeGreaterThanOrEqual(mutations.length);
  });
});
