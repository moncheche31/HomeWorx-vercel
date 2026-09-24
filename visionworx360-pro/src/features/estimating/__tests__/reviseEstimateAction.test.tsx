/**
 * Estimate revision UX: contractors see "Revise Current Estimate" — never
 * version terminology — and revisions are numbered plainly in the selector.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EstimateDTO } from "../types";

const base = {
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
  title: "Garage Conversion",
  notes: null,
  status: "approved",
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

const revision1 = {
  ...base,
  id: "est-2",
  revisionNumber: 1,
  version: 2,
  status: "draft",
  createdAt: "2026-01-02T00:00:00Z",
} as unknown as EstimateDTO;

const noopMutation = () => ({ isPending: false, mutateAsync: vi.fn() });

vi.mock("../hooks/useEstimating", () => ({
  useRefreshEstimate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEstimatesQuery: () => ({
    data: [base, revision1],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEstimateLinesQuery: () => ({ data: [], isLoading: false }),
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

const renderTab = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EstimateTab projectId="proj-1" />
    </QueryClientProvider>,
  );

describe("estimate revision UX", () => {
  it("shows the plain-language revise action", () => {
    renderTab();
    expect(screen.getByRole("button", { name: /Revise Current Estimate/i })).toBeInTheDocument();
    expect(screen.queryByText(/Create Revised Version/i)).not.toBeInTheDocument();
  });

  it("does not expose a New version action in the More menu", async () => {
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: /More/i }));
    expect(screen.queryByText(/New version/i)).not.toBeInTheDocument();
  });

  it("numbers revisions plainly in the selector", () => {
    renderTab();
    expect(screen.getByText(/Original estimate/i)).toBeInTheDocument();
  });

  it("uses contractor language in the locked notice", () => {
    renderTab();
    expect(
      screen.getByText(/Revise the current estimate to make changes/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Create a new version to make changes/i)).not.toBeInTheDocument();
  });
});
