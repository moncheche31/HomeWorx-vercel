/**
 * Scope of Work action surface:
 * normal state exposes exactly three visible actions (primary next step,
 * Edit Scope, More Options); everything else lives inside More Options.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const regenerate = vi.fn();

type Rec = { approvedAt: string | null; approvedText: string | null; answers: Record<string, string> };
const state: { record: Rec; displayText: string; questions: { id: string }[] } = {
  record: { approvedAt: null, approvedText: null, answers: {} },
  displayText: "Remove and replace the kitchen cabinets.",
  questions: [],
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
    questions: state.questions,
    record: state.record,
    displayText: state.displayText,
    approve: vi.fn(),
    regenerate,
    saveWording: vi.fn(),
    saveAnswers: vi.fn(),
  }),
}));

vi.mock("@/features/voice-capture/hooks/useProjectDescriptionNote", () => ({
  useProjectDescriptionNote: () => ({ text: "", loading: false }),
}));

vi.mock("@/features/estimating/hooks/useEstimating", () => ({
  useEstimatesQuery: () => ({ data: [] }),
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

function renderTab() {
  render(<NarrativeScopeTab projectId="p-1" projectName="Kitchen" onCreateEstimate={vi.fn()} />);
}

const HIDDEN = [
  "scope-questions-action",
  "scope-regenerate-action",
  "scope-advanced-action",
  "scope-proposal-action",
];

describe("NarrativeScopeTab action surface", () => {
  beforeEach(() => {
    regenerate.mockClear();
    state.record = { approvedAt: null, approvedText: null, answers: {} };
    state.questions = [];
  });

  it("shows only three actions in the normal state", () => {
    renderTab();
    expect(screen.getByTestId("scope-approve-action")).toBeInTheDocument();
    expect(screen.getByTestId("scope-edit-action")).toBeInTheDocument();
    expect(screen.getByTestId("scope-more-options")).toBeInTheDocument();
    for (const id of HIDDEN) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  });

  it("moves the secondary actions into More Options", async () => {
    renderTab();
    await userEvent.click(screen.getByTestId("scope-more-options"));
    for (const id of HIDDEN) expect(await screen.findByTestId(id)).toBeInTheDocument();
  });

  it("exposes exactly one proposal action", async () => {
    renderTab();
    await userEvent.click(screen.getByTestId("scope-more-options"));
    expect(await screen.findAllByTestId("scope-proposal-action")).toHaveLength(1);
  });

  it("regenerates from inside the menu", async () => {
    renderTab();
    await userEvent.click(screen.getByTestId("scope-more-options"));
    await userEvent.click(await screen.findByTestId("scope-regenerate-action"));
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("keeps the approved next-step action as the single primary when approved", () => {
    state.record = {
      approvedAt: "2026-08-01T10:00:00.000Z",
      approvedText: state.displayText,
      answers: {},
    };
    renderTab();
    expect(screen.getByTestId("scope-next-step-action")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-approve-action")).not.toBeInTheDocument();
    expect(screen.getByTestId("scope-edit-action")).toBeInTheDocument();
    expect(screen.getByTestId("scope-more-options")).toBeInTheDocument();
  });
});
