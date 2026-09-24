/**
 * "View Proposal" must be reachable directly from the estimate action area
 * once an estimate exists, and must point at the existing proposal route for
 * the current project (no second proposal system).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EstimateDTO } from "../types";

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

const noopMutation = () => ({ isPending: false, mutateAsync: vi.fn() });

vi.mock("../hooks/useEstimating", () => ({
  useRefreshEstimate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEstimatesQuery: () => ({
    data: [baseEstimate],
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
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock("../components/EstimateRangePanel", () => ({ EstimateRangePanel: () => null }));
vi.mock("../components/EstimateHistorySheet", () => ({ EstimateHistorySheet: () => null }));
vi.mock("../components/EstimateSettingsDialog", () => ({ EstimateSettingsDialog: () => null }));
vi.mock("../components/CreateRevisionDialog", () => ({ CreateRevisionDialog: () => null }));
vi.mock("../components/CopiedPricingBanner", () => ({ CopiedPricingBanner: () => null }));
vi.mock("../components/CopyFromProjectDialog", () => ({ CopyFromProjectDialog: () => null }));

const { EstimateTab } = await import("../components/EstimateTab");

describe("View Proposal action on the estimate screen", () => {
  it("links to the existing proposal route for the current project", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EstimateTab projectId="proj-1" />
      </QueryClientProvider>,
    );
    const link = screen.getByRole("link", { name: /View Proposal/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/app/proposal/proj-1");
  });
});
