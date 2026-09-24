/**
 * CONTRACTOR FINANCIAL SUMMARY — overhead & profit visibility.
 *
 * Proves three things:
 *  1. The engine charges overhead and profit as separate, real fields and the
 *     summary reconciles exactly to the engine grand total.
 *  2. The contractor Estimate tab surfaces overhead/profit in dollars and
 *     percent with the base each applies to.
 *  3. Client-facing proposal / print paths never render the panel.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

import { calculateEngineEstimate, type EngineLineInput } from "@/domains/estimating";
import { FinancialSummaryPanel } from "@/features/estimating/components/FinancialSummaryPanel";

const line = (over: Partial<EngineLineInput> & { id: string }): EngineLineInput => ({
  quantity: 1,
  laborRate: 0,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: false,
  ...over,
});

const KITCHEN: EngineLineInput[] = [
  line({ id: "cab-base", quantity: 10, laborHours: 10, laborRate: 65, materialCost: 300 }),
  line({ id: "cab-upper", quantity: 8, laborHours: 8, laborRate: 65, materialCost: 250 }),
];

describe("contractor financial summary", () => {
  it("engine charges overhead and profit separately and they are in the selling price", () => {
    const { totals } = calculateEngineEstimate(KITCHEN, { currency: "USD", taxRatePct: 0 });

    expect(totals.directCost).toBeGreaterThan(0);
    /* Overhead = 10% of direct cost. */
    expect(totals.overhead).toBeCloseTo(totals.directCost * 0.1, 1);
    /* Profit = 10% of direct cost + overhead — a distinct, compounding field. */
    expect(totals.profit).toBeCloseTo((totals.directCost + totals.overhead) * 0.1, 0);
    expect(totals.overhead).not.toBe(totals.profit);

    /* Selling price reconciles exactly. */
    expect(totals.grandTotal).toBeCloseTo(
      totals.directCost + totals.overhead + totals.profit + totals.contingency + totals.tax,
      1,
    );
  });

  it("renders overhead and profit dollars, percent and base for the contractor", () => {
    const { totals } = calculateEngineEstimate(KITCHEN, { currency: "USD", taxRatePct: 0 });
    render(<FinancialSummaryPanel totals={totals} currency="USD" />);

    const usd = (v: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.round(v));

    expect(screen.getByTestId("financial-overhead")).toHaveTextContent(usd(totals.overhead));
    expect(screen.getByTestId("financial-profit")).toHaveTextContent(usd(totals.profit));
    expect(screen.getByTestId("financial-selling-price")).toHaveTextContent(
      usd(totals.grandTotal),
    );
    /* Percentages + the base each is applied to are visible. */
    expect(screen.getByText(/Overhead \(10%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Profit \(10%\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Applied to direct cost/i).length).toBeGreaterThanOrEqual(2);

    /* Markup = overhead + profit + contingency, no double counting. */
    expect(screen.getByTestId("financial-markup")).toHaveTextContent(
      usd(totals.overhead + totals.profit + totals.contingency),
    );
  });

  it("is contractor-only: mounted on the Estimate tab, absent from client paths", () => {
    const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
    expect(tab).toContain("<FinancialSummaryPanel");

    const panel = readFileSync(
      "src/features/estimating/components/FinancialSummaryPanel.tsx",
      "utf8",
    );
    /* Excluded from every print/PDF render. */
    expect(panel).toContain("proposal-no-print");

    for (const clientPath of [
      "src/features/client-portal/pages/ClientProposalPage.tsx",
      "src/features/proposal/components/ProposalDocumentView.tsx",
    ]) {
      expect(readFileSync(clientPath, "utf8")).not.toContain("FinancialSummaryPanel");
    }
  });
});
