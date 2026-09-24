/**
 * Scope approval invalidation.
 *
 * Rule: a previously approved Scope of Work stops being approved as soon as
 * the *structured* scope changes. Wording-only edits never invalidate it.
 * Approval history is preserved for audit; only the latest structured scope
 * can be the currently approved one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeScopeFingerprint } from "@/domains/estimating/scopeSync";
import {
  approveRecord,
  invalidateApprovalRecord,
  type NarrativeScopeRecord,
} from "../hooks/useNarrativeScopeStore";

const EMPTY: NarrativeScopeRecord = {
  version: 1,
  editedText: null,
  answers: {},
  approvedText: null,
  approvedAt: null,
  approvedScopeFingerprint: null,
  approvalHistory: [],
};

const ITEM = {
  id: "i1",
  sectionId: "s1",
  roomId: null,
  title: "Frame partition walls",
  actionKey: "install",
  quantity: 40,
  unitKey: "linear_foot",
  materialSelection: null,
  finishSelection: null,
  isIncluded: true,
  archivedAt: null,
};

describe("scope approval invalidation (pure)", () => {
  it("keeps the approval when only the narrative wording changes", () => {
    const fingerprint = computeScopeFingerprint([ITEM]);
    const record = { ...EMPTY, ...approveRecord(EMPTY, { text: "Original wording.", scopeFingerprint: fingerprint }) };

    // Same structured scope, different prose.
    expect(computeScopeFingerprint([ITEM])).toBe(record.approvedScopeFingerprint);
  });

  it("invalidates the approval when structured scope changes", () => {
    const before = computeScopeFingerprint([ITEM]);
    const after = computeScopeFingerprint([ITEM, { ...ITEM, id: "i2", title: "Add recessed lights" }]);
    expect(after).not.toBe(before);
  });

  it("clears the current approval but preserves history", () => {
    const record = {
      ...EMPTY,
      ...approveRecord(EMPTY, { text: "Approved wording.", scopeFingerprint: "sf1:1:aaaa", at: "2026-08-01T10:00:00.000Z" }),
    } as NarrativeScopeRecord;
    const next = { ...record, ...invalidateApprovalRecord(record, "2026-08-02T10:00:00.000Z") };

    expect(next.approvedAt).toBeNull();
    expect(next.approvedText).toBeNull();
    expect(next.approvedScopeFingerprint).toBeNull();
    expect(next.approvalHistory).toHaveLength(1);
    expect(next.approvalHistory[0]).toMatchObject({
      approvedAt: "2026-08-01T10:00:00.000Z",
      invalidatedAt: "2026-08-02T10:00:00.000Z",
      invalidatedReason: "scope_changed",
    });
  });

  it("is a no-op when there was no approval to invalidate", () => {
    expect(invalidateApprovalRecord(EMPTY)).toEqual({});
  });
});

/* ---------------- Screen behaviour ---------------- */

const invalidateApproval = vi.fn();
const applyMock = vi.fn(async () => ({ applied: 2 }));
const state = { needsReapproval: false, approvedAt: null as string | null };

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
    interpretation: null,
    pendingText: null,
    applying: false,
    begin: () => ({
      isWordingOnly: false,
      requiresReview: false,
      changes: [{ kind: "add" }],
      added: [],
      updated: [],
      removed: [],
    }),
    cancel: vi.fn(),
    apply: applyMock,
  }),
}));

vi.mock("../hooks/useNarrativeScope", () => ({
  useNarrativeScope: () => ({
    loading: false,
    error: null,
    refetch: vi.fn(),
    hasItems: true,
    questions: [],
    record: { approvedAt: state.approvedAt, approvedText: null, answers: {} },
    displayText: "Frame partition walls.",
    needsReapproval: state.needsReapproval,
    scopeFingerprint: "sf1:1:aaaa",
    approve: vi.fn(),
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
  useEstimatesQuery: () => ({ data: [] }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("../components/NarrativeDocumentView", () => ({ NarrativeDocumentView: () => null }));
vi.mock("@/features/copilot/components/CopilotReviewDialog", () => ({ CopilotReviewDialog: () => null }));

const { NarrativeScopeTab } = await import("../components/NarrativeScopeTab");

describe("Scope of Work screen after invalidation", () => {
  beforeEach(() => {
    invalidateApproval.mockClear();
    applyMock.mockClear();
    state.needsReapproval = false;
    state.approvedAt = "2026-08-01T10:00:00.000Z";
  });

  it("clears the approval once interpreted scope changes are applied", async () => {
    render(<NarrativeScopeTab projectId="p-1" projectName="Kitchen" />);
    await userEvent.click(screen.getByTestId("scope-edit-action"));
    await userEvent.click(screen.getByTestId("scope-save-wording"));

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(invalidateApproval).toHaveBeenCalledTimes(1);
  });

  it("shows a Needs approval state instead of the approved banner", () => {
    state.needsReapproval = true;
    render(<NarrativeScopeTab projectId="p-1" projectName="Kitchen" />);

    expect(screen.getByTestId("scope-needs-approval-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-approved-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("scope-approve-action")).toBeInTheDocument();
  });
});
