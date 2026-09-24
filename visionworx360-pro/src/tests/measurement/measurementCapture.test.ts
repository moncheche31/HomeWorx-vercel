import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isAuthoritative,
  measurementFactsText,
  parseMeasurementText,
} from "@/domains/measurementCapture";

/**
 * Multi-input measurement capture: spoken, typed and plan-read measurements
 * must all land in one normalized, unit-safe, provenance-carrying list, and
 * only contractor-confirmed items may price the job.
 */

const TRANSCRIPT =
  "Bedroom is 12 by 14 with 8 foot ceiling. Bathroom is 5 by 9. " +
  'Back kitchen wall is 94 inches. Vanity is 60 inches. Window one is 36 by 48.';

describe("bulk voice transcript", () => {
  const items = parseMeasurementText(TRANSCRIPT, { source: "spoken" });

  it("splits one long dictation into separate measurements", () => {
    expect(items.length).toBeGreaterThanOrEqual(6);
    const labels = items.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("bedroom"))).toBe(true);
    expect(labels.some((l) => l.includes("bathroom"))).toBe(true);
    expect(labels.some((l) => l.includes("kitchen"))).toBe(true);
    expect(labels.some((l) => l.includes("vanity"))).toBe(true);
  });

  it("keeps 94 inches at 7' 10\" and never 94 feet", () => {
    const wall = items.find((i) => /kitchen/i.test(i.label))!;
    expect(wall.inches).toBe(94);
    expect(wall.inches / 12).toBeCloseTo(7.833, 2);
    expect(wall.display).toBe(`7' 10"`);
  });

  it("does not read a 60 inch vanity as a 60 foot vanity", () => {
    const vanity = items.find((i) => /vanity/i.test(i.label))!;
    expect(vanity.inches).toBe(60);
  });

  it("reads rooms in feet and keeps pairs together", () => {
    const bedroom = items.find((i) => /bedroom/i.test(i.label) && i.kind === "pair")!;
    expect(bedroom.inches).toBe(12 * 12);
    expect(bedroom.secondaryInches).toBe(14 * 12);
  });

  it("keeps the verbatim wording and the source on every item", () => {
    for (const item of items) {
      expect(item.source).toBe("spoken");
      expect(item.rawText.length).toBeGreaterThan(0);
    }
  });
});

describe("mixed imperial and fractions", () => {
  it("parses feet, inches and fractional inches consistently", () => {
    const items = parseMeasurementText(
      `Back wall is 7' 10". Counter is 36 1/2 in. Hallway is 7 ft 10 in.`,
      { source: "typed" },
    );
    const values = items.map((i) => i.inches);
    expect(values).toContain(94);
    expect(values).toContain(36.5);
    expect(values.filter((v) => v === 94).length).toBeGreaterThanOrEqual(2);
  });
});

describe("plan extraction authority", () => {
  const planItems = parseMeasurementText("Kitchen: 12 by 16. Ceiling: 9 ft.", {
    source: "plan",
    documentId: "doc-1",
  });

  it("never treats a plan reading as authoritative on its own", () => {
    expect(planItems.length).toBeGreaterThan(0);
    for (const item of planItems) {
      expect(item.status).toBe("candidate");
      expect(isAuthoritative(item)).toBe(false);
      expect(item.source).toBe("plan");
      expect(item.documentId).toBe("doc-1");
    }
  });

  it("keeps unconfirmed plan readings out of the estimator intake", () => {
    expect(measurementFactsText(planItems)).toBe("");
  });

  it("feeds the estimator with Plan provenance once confirmed", () => {
    const confirmed = planItems.map((i) => ({ ...i, status: "confirmed" as const }));
    const facts = measurementFactsText(confirmed);
    expect(facts).toMatch(/Kitchen/i);
    expect(confirmed[0].source).toBe("plan");
    expect(isAuthoritative(confirmed[0])).toBe(true);
  });
});

describe("durability and project isolation", () => {
  const hook = readFileSync("src/features/remote-vision/hooks/useMeasurementCapture.ts", "utf8");
  const fns = readFileSync(
    "src/features/remote-vision/services/measurementCapture.functions.ts",
    "utf8",
  );

  it("persists captures and items to the project, not localStorage", () => {
    expect(hook).not.toContain("localStorage");
    expect(fns).toContain("project_measurement_items");
    expect(fns).toContain("project_measurement_captures");
  });

  it("scopes every read and write to the project and active organization", () => {
    expect(hook).toContain('["rv", "measurements", orgId, projectId]');
    const scoped = fns.match(/\.eq\("project_id", data\.projectId\)/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(3);
    expect(fns).toContain("Project not in active organization");
  });

  it("only confirmed measurements are exposed as facts", () => {
    expect(hook).toContain('i.status === "confirmed"');
  });
});
