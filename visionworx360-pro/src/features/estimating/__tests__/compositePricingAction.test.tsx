/**
 * The live Garage Conversion platform-floor line: the recognized composite must
 * price itself from the library with an enabled primary action — the contractor
 * must never be pushed to search or to "price this line myself".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import type { EstimateDTO, EstimateLineDTO } from "../types";

const applyComposite = vi.fn().mockResolvedValue({ applied: 2 });

const assemblies = {
  rows: [
    {
      assemblyKey: "framing.floor.joist",
      origin: "library",
      workItem: "Frame floor joist system",
      unitKey: "square_foot",
      defaultLaborHours: 0.035,
      productionRate: null,
      crewSize: 2,
      materialAllowance: 6.5,
      wasteFactor: 0.1,
      defaultOverheadPct: 10,
      suggestedProfitPct: 10,
      isCustomized: false,
    },
    {
      assemblyKey: "framing.subfloor.sheathing",
      origin: "library",
      workItem: "Install subfloor sheathing",
      unitKey: "square_foot",
      defaultLaborHours: 0.02,
      productionRate: null,
      crewSize: 2,
      materialAllowance: 2.4,
      wasteFactor: 0.1,
      defaultOverheadPct: 10,
      suggestedProfitPct: 10,
      isCustomized: false,
    },
  ] as unknown[],
};

vi.mock("@/features/knowledge-base/hooks/useKnowledgeBase", () => ({
  useAssembliesQuery: (input: { search?: string }) => ({
    /* Free-text search finds nothing for this description — exactly the live bug. */
    data: input.search ? [] : assemblies.rows,
    isLoading: false,
    isError: false,
  }),
}));

const { CompletePricingDialog } = await import("../components/CompletePricingDialog");

const estimate = {
  id: "est-1",
  currency: "USD",
  status: "draft",
  taxRate: 0,
  defaultLaborRate: 65,
  defaultOverheadPct: 10,
  defaultProfitPct: 10,
  defaultContingencyPct: 0,
  lockedAt: null,
  supersededById: null,
  archivedAt: null,
} as unknown as EstimateDTO;

const line = {
  id: "5f125eb0-963f-47fc-89a3-e4416a144db7",
  description:
    `Frame an approximately 16' x 18' platform floor using 2 x 8 lumber and 3/4" Advantech`,
  quantity: 288,
  unitKey: "square_foot",
  tradeKey: "carpentry",
  pricingSource: "unmatched",
  isPriceOverridden: false,
  isQuantityPlaceholder: false,
  laborHours: 0,
  laborRate: 0,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: true,
} as unknown as EstimateLineDTO;

const noop = () => ({ isPending: false, mutateAsync: vi.fn() });
const mutations = {
  applyCompositeAssembly: { isPending: false, mutateAsync: applyComposite },
  confirmLineCatalog: noop(),
  setLineManualPricing: noop(),
  reviewLineQuantity: noop(),
  updateLine: noop(),
} as never;


const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const withQuery = (ui: React.ReactNode) => (
  <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
);

const renderDialog = () =>
  render(
    withQuery(    <CompletePricingDialog
      open
      onOpenChange={() => {}}
      estimate={estimate}
      lines={[line]}
      mutations={mutations}
    />),
  );

const applyButton = () => screen.queryAllByRole("button", { name: /Apply platform-floor assembly/i })[0] ?? null;

describe("platform-floor line in Complete pricing", () => {
  beforeEach(() => {
    applyComposite.mockClear();
    assemblies.rows = assemblies.rows.slice(0, 2);
  });

  it("shows both component rows instead of a free-text search result", () => {
    renderDialog();
    expect(screen.getByText(/Frame floor joist system/i)).toBeInTheDocument();
    expect(screen.getByText(/Install subfloor sheathing/i)).toBeInTheDocument();
    expect(screen.queryByText(/No library items match/i)).not.toBeInTheDocument();
  });

  it("enables the composite apply action for this real line", () => {
    renderDialog();
    const btn = applyButton();
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("shows a combined total equal to the sum of the component totals", () => {
    renderDialog();
    /* Whole dollars, no cents, off quarter-hour labor: joists 3,281 + subfloor 1,369. */
    const row = screen.getByText(/Combined line total/i).parentElement!;
    expect(within(row).getByText(/^\$4,650$/)).toBeInTheDocument();
  });

  it("names the missing component and disables apply when one is unavailable", () => {
    assemblies.rows = [assemblies.rows[0]!];
    renderDialog();
    expect(screen.getByText(/framing\.subfloor\.sheathing/)).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });
});
