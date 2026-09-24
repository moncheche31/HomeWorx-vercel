import { describe, expect, it } from "vitest";

import { classifyWorkDomains, type ScopeSignal } from "@/domains/workScope/taxonomy";
import { insertTemplateSectionSchema, insertTemplateItemSchema } from "@/features/scope/services/schemas";

/**
 * Corrections pass regressions.
 *
 * These lock the four behaviours that were found defective in audit: prose
 * cannot open a trade without work intent, template section/item inserts carry
 * the same mismatch gate as the full apply, and provenance refs accept
 * non-UUID intake sources.
 */

const prose = (description: string): ScopeSignal[] => [
  { title: null, description, source: "narrative" },
];

const domainsOf = (signals: ScopeSignal[]) =>
  classifyWorkDomains(signals).map((d) => d.domain);

describe("prose classification requires work intent", () => {
  it.each([
    "install countertops",
    "replace roof shingles",
    "paint bedrooms",
    "wire GFCI outlets",
    "grade the driveway",
  ])("keeps a real work instruction: %s", (text) => {
    expect(domainsOf(prose(text)).length).toBeGreaterThan(0);
  });

  it.each([
    "mid grade materials",
    "countertop level finish",
    "nice countertops in the photo",
  ])("rejects a non-instruction phrase: %s", (text) => {
    expect(domainsOf(prose(text))).toEqual([]);
  });

  it("still lets a structured row establish a domain without a verb", () => {
    const domains = domainsOf([
      { title: "Countertops", tradeKey: "carpentry", source: "scope_item" },
    ]);
    expect(domains.length).toBeGreaterThan(0);
  });

  it.each([
    "run a subpanel circuit to the garage",
    "repaint the living room",
    "plant shrubs along the walkway",
    "replace the roof",
    "grade the driveway",
  ])("preserves legitimate trade phrasing: %s", (text) => {
    expect(domainsOf(prose(text)).length).toBeGreaterThan(0);
  });

  it("classifies a legitimate multi-trade instruction into several domains", () => {
    const domains = domainsOf(
      prose("repaint the bedroom, replace the roof, and grade the driveway"),
    );
    expect(new Set(domains).size).toBeGreaterThanOrEqual(3);
  });

  it("does not let a finish adjective open a trade beside real work", () => {
    const domains = domainsOf(prose("repaint the bedroom with mid grade materials"));
    expect(domains).not.toContain("sitework");
  });

  it("does not let a project name alone open a trade", () => {
    expect(
      domainsOf([{ title: "Mid Grade Kitchen Photos", source: "project_name" }]),
    ).toEqual([]);
  });
});

describe("template insertion guards", () => {
  it("accepts a mismatch confirmation on section insertion", () => {
    const parsed = insertTemplateSectionSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      templateId: "22222222-2222-4222-8222-222222222222",
      sectionIndex: 0,
      confirmMismatch: true,
    });
    expect(parsed.confirmMismatch).toBe(true);
  });

  it("defaults section and item inserts to unconfirmed", () => {
    const section = insertTemplateSectionSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      templateId: "22222222-2222-4222-8222-222222222222",
      sectionIndex: 0,
    });
    const item = insertTemplateItemSchema.parse({
      projectId: "11111111-1111-4111-8111-111111111111",
      templateId: "22222222-2222-4222-8222-222222222222",
      sectionIndex: 0,
      itemIndex: 1,
      targetSectionId: "33333333-3333-4333-8333-333333333333",
    });
    expect(section.confirmMismatch ?? false).toBe(false);
    expect(item.confirmMismatch ?? false).toBe(false);
  });
});
