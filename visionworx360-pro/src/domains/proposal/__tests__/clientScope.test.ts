import { describe, expect, it } from "vitest";
import { buildClientScopeSections, buildScopeIntro } from "../clientScope";
import { splitScopeSections } from "../build";

/** Excerpt of the live Garage Conversion canonical narrative. */
const GARAGE = `Garage Conversion

Framing & Insulation
Frame an approximately 16' x 18' platform floor using 2 x 8 lumber and 3/4" Advantech (approximately 288 square feet).
Construct frame walls to code.
Install insulate walls, ceiling, floor.
Remove existing garage partition wall.
Remove existing back entry door.
Install rough plumbing for bathroom fixtures.
Building permit.
Accepted
Removed
Note: hardwood flooring
Hardwood
Through the wall

Electrical
Install new circuits, outlets, lighting.

Flooring
Install finished flooring.

Paint & Trim
Paint walls and ceilings.
Vent the bathroom exhaust fan through the exterior wall.`;

describe("client-facing scope presentation", () => {
  const sections = buildClientScopeSections(GARAGE, "en-US");
  const all = sections.flatMap((s) => s.lines).join(" ");

  it("renders complete sentences grouped by phase", () => {
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((s) => s.presentation === "prose")).toBe(true);
    for (const line of sections.flatMap((s) => s.lines)) {
      expect(line.endsWith(".")).toBe(true);
      expect(line[0]).toBe(line[0].toUpperCase());
    }
  });

  it("never renders raw questionnaire answer fragments", () => {
    expect(all).not.toMatch(/^Hardwood\.$/m);
    expect(sections.flatMap((s) => s.lines)).not.toContain("Hardwood.");
    expect(sections.flatMap((s) => s.lines)).not.toContain("Through the wall.");
  });

  it("never renders workflow statuses, notes or metadata", () => {
    expect(all).not.toMatch(/\b(Accepted|Removed|Approved)\b\./);
    expect(all).not.toMatch(/Note:/i);
  });

  it("does not invent scope", () => {
    expect(all).not.toMatch(/warrant|guarantee|granite|quartz/i);
    // every sentence's words come from the canonical narrative
    const source = GARAGE.toLowerCase();
    const invented = all
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter(Boolean)
      .filter((w) => !source.includes(w) && !["and", "the", "work", "also", "includes"].includes(w));
    expect(invented).toEqual([]);
  });

  it("keeps exact material and size facts", () => {
    expect(all).toContain(`16' x 18'`);
    expect(all).toContain("Advantech");
  });

  it("un-stacks generator verbs instead of repeating Install", () => {
    expect(all).toContain("Insulate walls, ceiling, floor.");
    expect(all).not.toContain("Install insulate");
  });

  it("keeps the internal contractor view as concise line items", () => {
    const internal = splitScopeSections(GARAGE, "en-US", "contractor");
    expect(internal.some((s) => s.lines.includes("Building permit."))).toBe(true);
    expect(internal.every((s) => s.presentation === undefined)).toBe(true);
  });

  it("regenerates when the canonical scope changes substantively", () => {
    const changed = buildClientScopeSections(`${GARAGE}\nInstall skylight in hallway.`, "en-US");
    expect(changed.flatMap((s) => s.lines).join(" ")).toMatch(/skylight/i);
  });

  it("does not duplicate wording-only repeats", () => {
    const doubled = buildClientScopeSections(
      `${GARAGE}\nRemove existing garage partition wall.`,
      "en-US",
    );
    const count = doubled
      .flatMap((s) => s.lines)
      .join(" ")
      .match(/garage partition wall/g)?.length;
    expect(count).toBe(1);
  });

  it("supports Spanish", () => {
    const es = buildClientScopeSections(
      "Retirar el muro divisorio existente del garaje.\nInstalar circuitos nuevos.",
      "es-US",
    );
    expect(es.length).toBeGreaterThan(0);
    expect(buildScopeIntro("Conversión de garaje", "es-US", true)).toContain("Alcance de trabajo");
  });

  it("has no intro when there is no scope", () => {
    expect(buildClientScopeSections(null, "en-US")).toEqual([]);
    expect(buildScopeIntro("X", "en-US", false)).toBeNull();
  });
});
