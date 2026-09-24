import { describe, it, expect } from "vitest";
import {
  deriveWorkDomains,
  measurementFieldsForDomains,
  schemaForScope,
} from "@/domains/ballpark/scopeProfile";
import { mergeMeasuredGeometry } from "@/domains/ballpark/continuity";

/**
 * Pilot regression: the measurement subsystem must obey the SAME scope context
 * as the question interview. A cabinet job is never asked room geometry, and a
 * stray saved wall reading can never reprice it as a room conversion.
 */

const CABINET_SCOPE = [
  { key: "cabinets.base", title: "Replace base cabinets", tradeKey: "cabinetry" },
  { key: "cabinets.upper", title: "Replace upper cabinets", tradeKey: "cabinetry" },
  { key: "countertop", title: "New countertop", tradeKey: "countertops" },
  { key: "outlet", title: "Relocate one receptacle", tradeKey: "electrical" },
];

const GARAGE_SCOPE = [
  { key: "conversion", title: "Convert garage to living space", tradeKey: "framing" },
  { key: "drywall", title: "Drywall walls and ceiling", tradeKey: "drywall" },
];

describe("scope-aware measurement fields", () => {
  it("hides room geometry on a cabinet job", () => {
    const fields = measurementFieldsForDomains(deriveWorkDomains(CABINET_SCOPE));
    expect(fields).not.toContain("lengthFt");
    expect(fields).not.toContain("widthFt");
    expect(fields).not.toContain("interiorPartitionLf");
    expect(fields).not.toContain("doors");
    expect(fields).not.toContain("windows");
  });

  it("keeps room geometry on a garage conversion", () => {
    const fields = measurementFieldsForDomains(deriveWorkDomains(GARAGE_SCOPE));
    expect(fields).toContain("lengthFt");
    expect(fields).toContain("widthFt");
    expect(fields).toContain("ceilingHeightFt");
  });

  it("does not open with a room-geometry question on a cabinet job", () => {
    const schema = schemaForScope(CABINET_SCOPE);
    const ids = schema.questions.map((q) => q.id);
    expect(ids).not.toContain("lengthFt");
    expect(ids).not.toContain("widthFt");
  });
});

describe("measurement merge is scope gated", () => {
  const measured = {
    lengthFt: 7.83,
    widthFt: 10,
    ceilingHeightFt: 8,
    interiorPartitionLf: null,
    floorWastePct: null,
    openings: [],
  };

  it("ignores room dimensions saved against a cabinet job", () => {
    const merged = mergeMeasuredGeometry({}, measured, deriveWorkDomains(CABINET_SCOPE));
    expect(merged.lengthFt).toBeUndefined();
    expect(merged.widthFt).toBeUndefined();
  });

  it("still applies them to a garage conversion", () => {
    const merged = mergeMeasuredGeometry({}, measured, deriveWorkDomains(GARAGE_SCOPE));
    expect(merged.lengthFt).toBeDefined();
    expect(merged.widthFt).toBeDefined();
  });
});
