/**
 * "Apply library pricing" must be reachable from the primary estimate action
 * area for any editable estimate (including an all-zero draft), and must be
 * unavailable once the document is locked or superseded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EstimateDTO } from "../types";

const applyMutate = vi.fn().mockResolvedValue({ priced: 3, unmatched: 1, isSampleData: true });

const baseEstimate = {
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

const state: { estimate: EstimateDTO } = { estimate: baseEstimate };

const noopMutation = () => ({ isPending: false, mutateAsync: vi.fn() });

vi.mock("../hooks/useEstimating", () => ({
  useRefreshEstimate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEstimatesQuery: () => ({
    data: [state.estimate],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEstimateLinesQuery: () => ({ data: [], isLoading: false }),
  useScopeSyncStateQuery: () => ({ data: null, isLoading: false }),
  useEstimateMutations: () => ({
    createFromScope: noopMutation(),
    createRevision: noopMutation(),
    applyKnowledgePricing: { isPending: false, mutateAsync: applyMutate },
    createVersion: noopMutation(),
    syncFromScope: noopMutation(),
    setStatus: noopMutation(),
    updateEstimate: noopMutation(),
    archiveEstimate: noopMutation(),
    createLine: noopMutation(),
    updateLine: noopMutation(),
    archiveLine: noopMutation(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("../components/EstimateRangePanel", () => ({ EstimateRangePanel: () => null }));
vi.mock("../components/EstimateHistorySheet", () => ({ EstimateHistorySheet: () => null }));
vi.mock("../components/EstimateSettingsDialog", () => ({ EstimateSettingsDialog: () => null }));
vi.mock("../components/CreateRevisionDialog", () => ({ CreateRevisionDialog: () => null }));
vi.mock("../components/CopiedPricingBanner", () => ({ CopiedPricingBanner: () => null }));
vi.mock("../components/CopyFromProjectDialog", () => ({ CopyFromProjectDialog: () => null }));

const { EstimateTab } = await import("../components/EstimateTab");

const findAction = () =>
  screen.queryByRole("button", { name: /Apply library pricing/i });

describe("Apply library pricing action", () => {
  beforeEach(() => {
    state.estimate = baseEstimate;
    applyMutate.mockClear();
  });

  it("renders enabled for an editable draft estimate", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EstimateTab projectId="proj-1" />
      </QueryClientProvider>,
    );
    const btn = findAction();
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("is unavailable for a locked estimate", () => {
    state.estimate = { ...baseEstimate, lockedAt: "2026-02-01T00:00:00Z" };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EstimateTab projectId="proj-1" />
      </QueryClientProvider>,
    );
    const btn = findAction();
    expect(btn === null || btn.hasAttribute("disabled")).toBe(true);
  });

  it("is unavailable for a superseded estimate", () => {
    state.estimate = { ...baseEstimate, supersededById: "est-2", status: "superseded" } as EstimateDTO;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EstimateTab projectId="proj-1" />
      </QueryClientProvider>,
    );
    const btn = findAction();
    expect(btn === null || btn.hasAttribute("disabled")).toBe(true);
  });
});
