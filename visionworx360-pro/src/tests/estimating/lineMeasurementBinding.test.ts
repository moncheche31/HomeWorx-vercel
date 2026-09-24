import { describe, expect, it } from "vitest";
import {
  measurementNeedFor,
  quantityFromMeasurement,
  selectBindableMeasurement,
} from "@/domains/estimating/measurementBinding";
import { bindCaptureToLine } from "@/features/estimating/services/lineMeasurement.server";
import { summarizeResolution } from "@/domains/estimating/resolution";

const pair = (a: number, b: number) => ({
  kind: "pair" as const,
  inches: a,
  secondaryInches: b,
  display: `${a / 12}' x ${b / 12}'`,
});
const single = (a: number) => ({
  kind: "single" as const,
  inches: a,
  secondaryInches: null,
  display: `${a / 12}'`,
});

describe("measurement binding", () => {
  it("maps units to the kind of number a line needs", () => {
    expect(measurementNeedFor("square_foot")).toBe("area");
    expect(measurementNeedFor("linear_foot")).toBe("length");
    expect(measurementNeedFor("each")).toBe("count");
    expect(measurementNeedFor("lump_sum")).toBe("unsupported");
  });

  it("derives square footage only from a real pair of dimensions", () => {
    expect(quantityFromMeasurement("square_foot", pair(96, 72))?.quantity).toBe(48);
    expect(quantityFromMeasurement("square_foot", single(96))).toBeNull();
  });

  it("derives linear feet only from a single length", () => {
    expect(quantityFromMeasurement("linear_foot", single(94))?.quantity).toBe(7.83);
    expect(quantityFromMeasurement("linear_foot", pair(96, 72))).toBeNull();
  });

  it("never invents a count or a volume from a dimension", () => {
    expect(quantityFromMeasurement("each", pair(96, 72))).toBeNull();
    expect(quantityFromMeasurement("cubic_yard", pair(96, 72))).toBeNull();
  });

  it("picks the first measurement that can answer the line", () => {
    const picked = selectBindableMeasurement("square_foot", [single(94), pair(96, 72)]);
    expect(picked?.bound.quantity).toBe(48);
  });

  it("binds spoken dimensions to a square-foot line", () => {
    const result = bindCaptureToLine({ unit_key: "square_foot" }, {
      text: "Tiled area is 8 feet by 6 feet",
      source: "spoken",
    });
    expect(result?.bound.quantity).toBe(48);
    expect(result?.item).not.toBeNull();
  });

  it("refuses a spoken phrase with no usable measurement", () => {
    expect(
      bindCaptureToLine({ unit_key: "square_foot" }, { text: "quite a bit of tile", source: "spoken" }),
    ).toBeNull();
  });

  it("accepts a spoken count for an each line", () => {
    const result = bindCaptureToLine({ unit_key: "each" }, { text: "6 outlets", source: "spoken" });
    expect(result?.bound.quantity).toBe(6);
    expect(result?.item).toBeNull();
  });

  it("accepts a typed quantity fallback in the line's own unit", () => {
    const result = bindCaptureToLine({ unit_key: "square_foot" }, { quantity: 120, source: "typed" });
    expect(result?.bound.quantity).toBe(120);
  });
});

describe("resolution summary separates assumed defaults from measured lines", () => {
  const base = {
    costBasis: null,
    unitKey: "each",
    quantity: 1,
    isQuantityPlaceholder: true,
    laborHours: 1,
    laborHoursPerUnit: 1,
    pricingSource: "knowledge_base",
    isPriceOverridden: false,
    unresolvedReason: null,
  };

  it("counts assumed, measured and blocked lines apart", () => {
    const summary = summarizeResolution([
      { ...base, id: "a", description: "HVAC", resolutionStatus: "resolved", quantityIsAssumedDefault: true },
      {
        ...base, id: "b", description: "Flooring", quantity: 300, isQuantityPlaceholder: false,
        resolutionStatus: "resolved", quantityIsAssumedDefault: false,
      },
      {
        ...base, id: "c", description: "Shower tile", resolutionStatus: "unresolved",
        unresolvedReason: "quantity_unmeasured",
      },
    ]);
    expect(summary.assumedDefault).toBe(1);
    expect(summary.measured).toBe(1);
    expect(summary.unresolved).toBe(1);
    expect(summary.assumedLines[0]?.description).toBe("HVAC");
  });
});
