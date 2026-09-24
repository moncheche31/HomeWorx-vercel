/**
 * Scope-to-estimate change handling in the Estimate tab.
 *
 * Draft estimates get "Update Estimate" against the SAME estimate id; issued
 * documents get "Revise Current Estimate", which creates the next revision and
 * syncs the current scope into it. Pricing safeguards stay intact.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { assessDetailedIntegrity } from "@/domains/estimating";
import { preserveBallparkHistory, readBallparkSummary } from "../services/ballparkSummary";
import type { EstimateDTO } from "../types";

const draft = {
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
  status: "draft",
  currency: "USD",
  taxRate: 0,
  defaultOverheadPct: 10,
  defaultProfitPct: 10,
  defaultContingencyPct: 0,
  defaultLaborRate: 0,
  costCatalogRef: null,
  intakeMode: "detailed",
  pricingMode: "total",
  pricingMethod: "overhead_profit" as const,
  targetGrossMarginPct: 0,
  laborSettings: {},
  rangeAssumptions: {},
  rangeSnapshot: null,
  scopeSyncFingerprint: "sf1:1:aaaa",
  scopeSyncedAt: "2026-01-01T00:00:00Z",
  createdBy: "user-1",
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
} as unknown as EstimateDTO;

const issued = { ...draft, status: "approved" } as unknown as EstimateDTO;

const state = {
  estimate: draft,
  sync: {
    estimateId: "est-1",
    isStale: true,
    action: "update" as "update" | "revise" | "none",
    currentFingerprint: "sf1:2:bbbb",
    syncedFingerprint: "sf1:1:aaaa",
    syncedAt: "2026-01-01T00:00:00Z",
    needsReview: 0,
  },
};

const syncFromScope = vi.fn().mockResolvedValue({ imported: 2 });
const reviseAndSync = vi.fn().mockResolvedValue({ estimateId: "est-2", created: true, imported: 2 });

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
  useScopeSyncStateQuery: () => ({ data: state.sync, isLoading: false }),
  useEstimateMutations: () => ({
    createFromScope: noopMutation(),
    createRevision: noopMutation(),
    reviseAndSync: { isPending: false, mutateAsync: reviseAndSync },
    applyKnowledgePricing: noopMutation(),
    createVersion: noopMutation(),
    syncFromScope: { isPending: false, mutateAsync: syncFromScope },
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

beforeEach(() => {
  syncFromScope.mockClear();
  reviseAndSync.mockClear();
  state.estimate = draft;
  state.sync = { ...state.sync, action: "update", isStale: true };
});

describe("stale scope on a draft estimate", () => {
  it("warns and updates the same estimate in place", async () => {
    renderTab();
    expect(screen.getByText(/Scope of Work Changed/i)).toBeInTheDocument();
    expect(screen.getByText(/based on an earlier scope/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Update Estimate/i }));
    expect(syncFromScope).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(reviseAndSync).not.toHaveBeenCalled();
  });

  it("hides the banner once the scope is back in sync", () => {
    state.sync = { ...state.sync, isStale: false, action: "none" };
    renderTab();
    expect(screen.queryByText(/Scope of Work Changed/i)).not.toBeInTheDocument();
  });
});

describe("stale scope on an issued estimate", () => {
  beforeEach(() => {
    state.estimate = issued;
    state.sync = { ...state.sync, action: "revise" };
  });

  it("warns that the estimate was issued and offers a revision", () => {
    renderTab();
    expect(screen.getByText(/Scope of Work Changed/i)).toBeInTheDocument();
    expect(screen.getByText(/already issued/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("scope-changed-banner").querySelector("button")?.textContent,
    ).toMatch(/Revise Current Estimate/i);
  });

  it("creates the next revision and syncs the current scope into it", async () => {
    renderTab();
    const banner = screen.getByTestId("scope-changed-banner");
    await userEvent.click(banner.querySelector("button")!);
    expect(reviseAndSync).toHaveBeenCalledWith({ estimateId: "est-1" });
    expect(syncFromScope).not.toHaveBeenCalled();
  });
});

describe("pricing safeguards are untouched by scope sync", () => {
  it("preserves the Garage Conversion ballpark history exactly", () => {
    const ballpark = {
      kind: "ballpark",
      currency: "USD",
      band: { low: 34500, expected: 38809.02, high: 43000 },
    };
    const next = preserveBallparkHistory(ballpark, { kind: "detailed", band: { low: 1, expected: 2, high: 3 } });
    const summary = readBallparkSummary(next);
    expect(summary).toMatchObject({ low: 34500, expected: 38809.02, high: 43000 });
  });

  it("keeps incomplete detailed pricing flagged as incomplete", () => {
    const integrity = assessDetailedIntegrity({
      lines: [
        { laborHours: 0, laborRate: 0, materialCost: 0, equipmentCost: 0, subcontractorCost: 0, otherCost: 0 },
        { laborHours: 1, laborRate: 50, materialCost: 0, equipmentCost: 0, subcontractorCost: 0, otherCost: 0 },
      ],
      grandTotal: 50,
      ballpark: { low: 34500, expected: 38809.02, high: 43000 },
    });
    expect(integrity.isIncomplete).toBe(true);
  });
});
