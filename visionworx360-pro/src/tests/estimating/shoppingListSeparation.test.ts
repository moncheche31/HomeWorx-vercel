/**
 * THREE DOCUMENTS, NOT TWO.
 * Ballpark estimate and detailed estimate are both one line per scope item.
 * The parts list is a separate purchase document — never estimate detail.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildShoppingList } from "@/features/estimating/components/ShoppingListTab";
import type { EstimateLineDTO } from "@/features/estimating/types";

const row = readFileSync("src/features/estimating/components/EstimateLineRow.tsx", "utf8");
const page = readFileSync("src/features/crm/pages/ProjectDetailPage.tsx", "utf8");

const line = (over: Partial<EstimateLineDTO>): EstimateLineDTO =>
  ({
    id: "x",
    description: "item",
    quantity: 0,
    unitKey: "each",
    tradeKey: "roofing",
    parentLineId: null,
    isQuantityPlaceholder: false,
    ...over,
  }) as EstimateLineDTO;

describe("shopping list is its own document", () => {
  it("the estimate line no longer drills down into components", () => {
    expect(row).not.toContain("viewBreakdown");
    expect(row).not.toContain("line-components-toggle");
    expect(row).not.toContain("View breakdown");
  });

  it("lives on its own tab, generated on demand", () => {
    expect(page).toContain("ShoppingListTab");
    expect(page).toContain('value="shopping-list"');
  });

  it("lists only components, never scope lines", () => {
    const items = buildShoppingList([
      line({ id: "p", description: "Roofing", quantity: 2250, unitKey: "square_foot" }),
      line({ id: "c", description: "Drip edge", quantity: 190, unitKey: "linear_foot", parentLineId: "p" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Drip edge");
    expect(items[0]?.forScope).toEqual(["Roofing"]);
  });

  it("buys a shared material once, with the quantities added", () => {
    const items = buildShoppingList([
      line({ id: "p1", description: "Roofing" }),
      line({ id: "p2", description: "Siding" }),
      line({ id: "a", description: "Nails", quantity: 10, unitKey: "pound", parentLineId: "p1" }),
      line({ id: "b", description: "Nails", quantity: 5, unitKey: "pound", parentLineId: "p2" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(15);
    expect(items[0]?.forScope).toEqual(["Roofing", "Siding"]);
  });

  it("carries the unconfirmed-quantity warning onto the buying list", () => {
    const items = buildShoppingList([
      line({ id: "p", description: "Roofing" }),
      line({
        id: "c",
        description: "Underlayment",
        quantity: 2250,
        unitKey: "square_foot",
        parentLineId: "p",
        isQuantityPlaceholder: true,
      }),
    ]);
    expect(items[0]?.isEstimatedQuantity).toBe(true);
  });
});
