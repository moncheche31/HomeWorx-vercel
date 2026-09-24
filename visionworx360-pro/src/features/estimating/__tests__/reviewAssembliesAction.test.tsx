/**
 * "Review assemblies" must actually open the assembly review surface. Ballpark
 * estimates never render the line-item breakdown, so the button used to be a
 * silent no-op there — this pins the working behaviour.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EstimateDTO, EstimateLineDTO } from "../types";

const estimate = {
  id: "est-1",
  organizationId: "org-1",
  projectId: "proj-1",
  version: 1,
  parentEstimateId: null,
  documentKind: "estimate",
  lineageRootId: "est-1",
  revisionNumber: 0,
  optionLabel: null,
  supersededById: null,
  sentAt: null,
  acceptedAt: null,
  declinedAt: null,
  lockedAt: null,
  title: "Estimate v1",
  notes: null,
  status: "draft",
  intakeMode: "ballpark",
  currency: "USD",
  taxRate: 0,
  defaultOverheadPct: 10,
  defaultProfitPct: 10,
  defaultContingencyPct: 0,
  defaultLaborRate: 0,
  costCatalogRef: null,
  rangeAssumptions: {},
  rangeSnapshot: null,
  createdBy: "user-1",
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
} as unknown as EstimateDTO;

const line = {
  id: "line-roof",
  estimateId: "est-1",
  description: "Roofing",
  tradeKey: "roofing",
  parentLineId: null,
  quantity: 2250,
  unitKey: "sf",
  assemblyExpansionStatus: "auto_expanded_unreviewed",
  groupLabel: "Roofing",
} as unknown as EstimateLineDTO;

const noopMutation = () => ({ isPending: false, mutateAsync: vi.fn() });

vi.mock("../hooks/useEstimating", () => ({
  useRefreshEstimate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEstimatesQuery: () => ({ data: [estimate], isLoading: false, isError: false, refetch: vi.fn() }),
  useEstimateLinesQuery: () => ({ data: [line], isLoading: false }),
  useScopeSyncStateQuery: () => ({ data: null, isLoading: false }),
  useEstimateMutations: () => ({
    createFromScope: noopMutation(),
    createRevision: noopMutation(),
    applyKnowledgePricing: noopMutation(),
    createVersion: noopMutation(),
    syncFromScope: noopMutation(),
    setStatus: noopMutation(),
    updateEstimate: noopMutation(),
    archiveEstimate: noopMutation(),
    createLine: noopMutation(),
    updateLine: noopMutation(),
    archiveLine: noopMutation(),
    setBallparkBandPosition: noopMutation(),
    convertToDetailed: noopMutation(),
  }),
}));

vi.mock("../hooks/useAssemblyExpansion", () => {
  const expansion = {
      id: "exp-1",
      assemblyLabel: "Complete roofing assembly",
      reviewStatus: "auto_expanded_unreviewed",
      tradeKey: "roofing",
      components: [
        {
          id: "c-1",
          sequence: 1,
          name: "Synthetic underlayment",
          reason: "Required beneath shingles",
          inclusion: "standard",
          isIncluded: true,
          quantity: null,
          quantityBasis: "same_as_parent",
          selectedReferenceId: null,
          bookMatch: { description: "Roofing felt", unit: "SQ", isAmbiguous: true, isContractorSelected: false },
          bookCandidates: [
            { referenceId: 4724, description: "Roofing felt, 15 lb", unit: "SQ", material: 12, labor: 20, craftHours: "0.5" },
            { referenceId: 4677, description: "Asphalt roofing", unit: "SQ", material: 90, labor: 40, craftHours: "1.0" },
          ],
        },
      ],
  };
  const stable = { isLoading: false, data: expansion };
  const mutation = { isPending: false, mutateAsync: vi.fn() };
  return {
    useLineAssembly: () => stable,
    useExpandLineAssembly: () => mutation,
    useReviewAssemblyExpansion: () => mutation,
    useMaterializeAssembly: () => mutation,
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => () => {},
}));
vi.mock("../components/BallparkRangeCard", () => ({ BallparkRangeCard: () => null }));
vi.mock("../components/EstimateRangePanel", () => ({ EstimateRangePanel: () => null }));
vi.mock("../components/EstimateHistorySheet", () => ({ EstimateHistorySheet: () => null }));
vi.mock("../components/EstimateSettingsDialog", () => ({ EstimateSettingsDialog: () => null }));
vi.mock("../components/CreateRevisionDialog", () => ({ CreateRevisionDialog: () => null }));
vi.mock("../components/CopiedPricingBanner", () => ({ CopiedPricingBanner: () => null }));
vi.mock("../components/CopyFromProjectDialog", () => ({ CopyFromProjectDialog: () => null }));

const { EstimateTab } = await import("../components/EstimateTab");

describe("Review assemblies action", () => {
  it("opens the assembly review panel from the detailed screen", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EstimateTab projectId="proj-1" />
      </QueryClientProvider>,
    );

    /* Ballpark opens as three numbers only; detail is a separate screen. */
    expect(screen.getByTestId("ballpark-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("assembly-unreviewed-banner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Detailed estimate/i }));

    expect(screen.getByTestId("assembly-unreviewed-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("assembly-review-section")).toBeNull();


    fireEvent.click(screen.getByRole("button", { name: /Review assemblies/i }));

    expect(screen.getByTestId("assembly-review-section")).toBeInTheDocument();
    expect(screen.getByTestId("assembly-review-panel")).toBeInTheDocument();
    expect(screen.getByTestId("assembly-component")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    fireEvent.click(radios[0]!);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });
});
