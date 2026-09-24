/**
 * Scope of Work approval CTA hierarchy:
 * - unapproved -> primary "Approve Scope"
 * - approved + current -> success banner + primary next step (Create/View Estimate)
 * - approved + stale -> primary re-approval
 * State is derived entirely from persisted narrative + estimate data, so a
 * remount (leave/reopen the project) reproduces it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const approve = vi.fn();

const invalidateApproval = vi.fn();

type Rec = { approvedAt: string | null; approvedText: string | null; answers: Record<string, string> };
const state: {
  record: Rec;
  displayText: string;
  estimates: { archivedAt: string | null }[];
  needsReapproval: boolean;
} = {
  record: { approvedAt: null, approvedText: null, answers: {} },
  needsReapproval: false,
  displayText: "Remove and replace the kitchen cabinets.",
  estimates: [],
};

vi.mock("@/features/scope/hooks/useScopeValidation", () => ({
  useScopeValidation: () => ({
    isLoading: false,
    items: [],
    report: { findings: [], blockerCount: 0, warningCount: 0, infoCount: 0, isClean: true, fingerprint: "sv:0" },
    decision: { canApprove: true, outstanding: [], isStale: false },
    acknowledgedIds: [],
    acknowledge: vi.fn(),
    acknowledgeAll: vi.fn(),
  }),
}));

vi.mock("../hooks/useNarrativeInterpretation", () => ({
  useNarrativeInterpretation: () => ({
    interpretation: null, pendingText: null, applying: false,
    begin: () => ({ isWordingOnly: true, changes: [], added: [], updated: [], removed: [], requiresReview: false }),
    cancel: vi.fn(), apply: async () => ({ applied: 0 }),
  }),
}));

vi.mock("../hooks/useNarrativeScope", () => ({
  useNarrativeScope: () => ({
    loading: false,
    error: null,
    refetch: vi.fn(),
    hasItems: true,
    questions: [],
    record: state.record,
    displayText: state.displayText,
    needsReapproval: state.needsReapproval,
    scopeFingerprint: "sf1:1:deadbeef",
    approve,
    invalidateApproval,
    regenerate: vi.fn(),
    saveWording: vi.fn(),
    saveAnswers: vi.fn(),
  }),
}));

vi.mock("@/features/voice-capture/hooks/useProjectDescriptionNote", () => ({
  useProjectDescriptionNote: () => ({ text: "", loading: false }),
}));

vi.mock("@/features/estimating/hooks/useEstimating", () => ({
  useEstimatesQuery: () => ({ data: state.estimates }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("../components/NarrativeDocumentView", () => ({
  NarrativeDocumentView: () => null,
}));
vi.mock("@/features/copilot/components/CopilotReviewDialog", () => ({
  CopilotReviewDialog: () => null,
}));

const { NarrativeScopeTab } = await import("../components/NarrativeScopeTab");

function renderTab(onCreateEstimate = vi.fn()) {
  render(
    <NarrativeScopeTab projectId="p-1" projectName="Kitchen" onCreateEstimate={onCreateEstimate} />,
  );
  return onCreateEstimate;
}

describe("NarrativeScopeTab approval CTA", () => {
  beforeEach(() => {
    approve.mockClear();
    invalidateApproval.mockClear();
    state.record = { approvedAt: null, approvedText: null, answers: {} };
    state.needsReapproval = false;
    state.displayText = "Remove and replace the kitchen cabinets.";
    state.estimates = [];
  });

  it("shows Approve Scope as the primary CTA when unapproved", () => {
    renderTab();
    expect(screen.getByTestId("scope-approve-action")).toHaveTextContent(/approve scope/i);
    expect(screen.queryByTestId("scope-approved-banner")).not.toBeInTheDocument();
  });

  it("shows the success banner and Create Estimate when approved with no estimate", async () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: state.displayText,
      answers: {},
    };
    const onCreateEstimate = renderTab();

    expect(screen.getByTestId("scope-approved-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-approve-action")).not.toBeInTheDocument();

    const next = screen.getByTestId("scope-next-step-action");
    expect(next).toHaveTextContent(/create estimate/i);
    await userEvent.click(next);
    expect(onCreateEstimate).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
  });

  it("shows View Estimate when an estimate already exists and never re-creates one", async () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: state.displayText,
      answers: {},
    };
    state.estimates = [{ archivedAt: null }];
    const onCreateEstimate = renderTab();

    expect(screen.getByTestId("scope-approved-banner")).toBeInTheDocument();
    const next = screen.getByTestId("scope-next-step-action");
    expect(next).toHaveTextContent(/view estimate/i);
    await userEvent.click(next);
    expect(onCreateEstimate).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
  });

  it("returns to a re-approval CTA when the structured scope changed", () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: state.displayText,
      answers: {},
    };
    state.needsReapproval = true;
    renderTab();
    expect(screen.getByTestId("scope-needs-approval-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-approved-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("scope-approve-action")).toHaveTextContent(/approve updated scope/i);
  });

  it("keeps the approval when only the wording changed", () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: "Older wording, same work.",
      answers: {},
    };
    state.needsReapproval = false;
    renderTab();
    expect(screen.getByTestId("scope-approved-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-approve-action")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scope-needs-approval-badge")).not.toBeInTheDocument();
  });

  it("derives the same approved state after leaving and reopening the project", () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: state.displayText,
      answers: {},
    };
    const { unmount } = render(<NarrativeScopeTab projectId="p-1" projectName="Kitchen" />);
    expect(screen.getByTestId("scope-approved-banner")).toBeInTheDocument();
    unmount();

    renderTab();
    expect(screen.getByTestId("scope-approved-banner")).toBeInTheDocument();
    expect(screen.getByTestId("scope-next-step-action")).toBeInTheDocument();
  });
});
