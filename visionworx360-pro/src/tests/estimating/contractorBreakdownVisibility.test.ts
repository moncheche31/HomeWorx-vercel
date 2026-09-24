import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildContractorBreakdown } from "@/domains/estimating/contractorBreakdown";

const read = (p: string) => readFileSync(p, "utf8");

/** External surfaces that must never render internal cost detail. */
const EXTERNAL_SURFACES = [
  "src/features/proposal/components/ProposalDocument.tsx",
  "src/features/proposal/pages/ProposalPrintPage.tsx",
  "src/features/proposal/pages/ClientProposalPage.tsx",
];

describe("contractor breakdown domain", () => {
  const breakdown = buildContractorBreakdown(
    [
      {
        id: "a",
        label: "Base cabinets",
        tradeKey: "finish_carpentry",
        laborHours: 5.2,
        laborCost: 400,
        materialCost: 600,
        otherCost: 0,
      },
      {
        id: "b",
        label: "Relocate receptacle",
        tradeKey: "electrical",
        laborHours: 1.4,
        laborCost: 105,
        materialCost: 28,
        otherCost: 0,
      },
    ],
    { overhead: 100, profit: 120, tax: 0, durationDays: 1 },
  );

  it("aggregates labor, material and markup into one internal total", () => {
    expect(breakdown.laborHours).toBeCloseTo(6.6, 2);
    expect(breakdown.laborCost).toBe(505);
    expect(breakdown.materialCost).toBe(628);
    expect(breakdown.markup).toBe(220);
    expect(breakdown.total).toBe(1353);
  });

  it("rolls tasks up by canonical trade", () => {
    expect(breakdown.trades.map((t) => t.tradeKey)).toEqual([
      "finish_carpentry",
      "electrical",
    ]);
  });
});

describe("audience isolation", () => {
  it("mounts the internal panel in contractor review surfaces", () => {
    for (const file of [
      "src/features/proposal/pages/ProposalPage.tsx",
      "src/features/remote-vision/components/ScenarioCards.tsx",
    ]) {
      expect(read(file)).toContain("ContractorBreakdownPanel");
    }
  });

  it("never mounts the internal panel in external outputs", () => {
    for (const file of EXTERNAL_SURFACES) {
      let source: string;
      try {
        source = read(file);
      } catch {
        continue;
      }
      expect(source).not.toContain("ContractorBreakdownPanel");
      expect(source).not.toContain("contractorBreakdown");
    }
  });

  it("keeps the panel out of print output and labels it internal", () => {
    const panel = read("src/components/estimating/ContractorBreakdownPanel.tsx");
    expect(panel).toContain("proposal-no-print");
    expect(panel).toContain("contractorBreakdown.internalOnly");
  });
});
