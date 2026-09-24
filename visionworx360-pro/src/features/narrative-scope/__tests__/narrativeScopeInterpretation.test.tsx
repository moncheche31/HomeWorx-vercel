/**
 * Narrative Scope of Work edits driving the structured scope.
 *
 * Interpretation itself is covered by the pure domain tests; this file covers
 * the side effects and the review gate: what actually gets written, and what
 * must be confirmed first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { interpretNarrativeEdit } from "@/domains/scopeInterpretation";
import { ReviewScopeChangesDialog } from "../components/ReviewScopeChangesDialog";
import { useNarrativeInterpretation } from "../hooks/useNarrativeInterpretation";

const createItem = vi.fn(async (_payload: any) => ({ id: "new-1" }));
const updateItem = vi.fn(async (_payload: any) => ({ id: "i2" }));
const bulkInclusion = vi.fn(async (_payload: any) => 1);
const createSection = vi.fn(async (_payload: any) => ({ id: "s-new" }));

const ITEMS = [
  {
    id: "i1", sectionId: "s1", roomId: null, title: "Install interior door",
    actionKey: "install", quantity: 1, unitKey: "each", materialSelection: null,
    finishSelection: null, customerNotes: null, internalNotes: null, description: null,
    tradeKey: null, categoryKey: null, subcategoryKey: null, priority: "normal",
    confidenceStatus: null, completionStatus: "draft", isIncluded: true,
    isClientVisible: true, archivedAt: null,
  },
  {
    id: "i2", sectionId: "s1", roomId: null, title: "Frame partition walls",
    actionKey: "install", quantity: 40, unitKey: "linear_foot", materialSelection: null,
    finishSelection: null, customerNotes: null, internalNotes: null, description: null,
    tradeKey: null, categoryKey: null, subcategoryKey: null, priority: "normal",
    confidenceStatus: null, completionStatus: "draft", isIncluded: true,
    isClientVisible: true, archivedAt: null,
  },
];

vi.mock("@/features/scope/hooks/useScope", () => ({
  useScopeItemsQuery: () => ({ data: ITEMS, isLoading: false, isError: false }),
  useScopeSectionsQuery: () => ({ data: [{ id: "s1", name: "General", archivedAt: null }] }),
  useScopeMutations: () => ({
    createItem: { mutateAsync: createItem },
    updateItem: { mutateAsync: updateItem },
    bulkInclusion: { mutateAsync: bulkInclusion },
    createSection: { mutateAsync: createSection },
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const BASE = "Frame partition walls. Install interior door.";

beforeEach(() => vi.clearAllMocks());

describe("narrative edits → structured scope", () => {
  it("writes nothing when the contractor only polished the wording", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let wordingOnly = false;
    act(() => {
      wordingOnly = result.current.begin(BASE, "Frame the partition walls. Install the interior door.").isWordingOnly;
    });
    expect(wordingOnly).toBe(true);
    expect(createItem).not.toHaveBeenCalled();
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("creates a structured item for new work described in the narrative", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      changes = result.current.begin(BASE, `${BASE} Add 6 recessed lights in the living room.`).changes;
    });
    await act(async () => { await result.current.apply(changes); });

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({
      projectId: "proj-1",
      sectionId: "s1",
      quantity: 6,
      tradeKey: "electrical",
      isIncluded: true,
    });
  });

  it("updates measurable facts on an existing item without rewriting its title", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      changes = result.current.begin(BASE, "Frame partition walls 60 linear feet. Install interior door.").changes;
    });
    await act(async () => { await result.current.apply(changes); });

    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem.mock.calls[0][0]).toMatchObject({
      id: "i2",
      title: "Frame partition walls",
      quantity: 60,
    });
  });

  it("excludes removed work instead of deleting it, so pricing survives review", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      changes = result.current.begin(BASE, "Frame partition walls.").changes;
    });
    await act(async () => { await result.current.apply(changes); });

    expect(bulkInclusion).toHaveBeenCalledWith({
      projectId: "proj-1", itemIds: ["i1"], isIncluded: false,
    });
    expect(createItem).not.toHaveBeenCalled();
  });

  it("flags work the pricebook cannot price as needing verification", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      changes = result.current.begin(BASE, `${BASE} Demolition of the existing structure.`).changes;
    });
    await act(async () => { await result.current.apply(changes); });
    expect(createItem.mock.calls[0][0]).toMatchObject({ confidenceStatus: "needs_verification" });
  });
});

describe("Review Scope Changes dialog", () => {
  const interpret = () =>
    interpretNarrativeEdit({
      priorText: BASE,
      nextText: "Frame partition walls. Add 6 recessed lights in the living room.",
      items: ITEMS.map((i) => ({
        id: i.id, sectionId: i.sectionId, roomId: i.roomId, title: i.title,
        actionKey: i.actionKey, quantity: i.quantity, unitKey: i.unitKey,
        materialSelection: i.materialSelection, isIncluded: i.isIncluded,
      })),
    });

  it("pre-selects proposed removals and labels them as exclusions, not deletions", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ReviewScopeChangesDialog open changes={interpret().changes} onCancel={vi.fn()} onApply={onApply} />,
    );

    expect(await screen.findByTestId("review-scope-changes")).toBeInTheDocument();
    expect(screen.getByTestId("scope-change-remove")).toBeInTheDocument();
    expect(screen.getByTestId("removal-safety-note")).toBeInTheDocument();

    await user.click(screen.getByTestId("apply-scope-changes"));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const applied = onApply.mock.calls[0][0] as Array<{ kind: string }>;
    expect(applied.some((c) => c.kind === "remove")).toBe(true);
    expect(applied.some((c) => c.kind === "add")).toBe(true);
  });

  it("still requires the explicit Apply action, and honours an unchecked removal", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const changes = interpret().changes;
    render(
      <ReviewScopeChangesDialog open changes={changes} onCancel={vi.fn()} onApply={onApply} />,
    );
    expect(onApply).not.toHaveBeenCalled();

    const removal = changes.find((c) => c.kind === "remove")!;
    await user.click(screen.getByRole("checkbox", { name: removal.title }));
    await user.click(screen.getByTestId("apply-scope-changes"));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const applied = onApply.mock.calls[0][0] as Array<{ kind: string }>;
    expect(applied.every((c) => c.kind !== "remove")).toBe(true);
  });
});

describe("stale structured scope reconciliation", () => {
  it("proposes exclusion of included scope the current narrative never describes", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      /* A wholly rewritten narrative: neither structured item is described. */
      changes = result.current.begin("", "Convert the garage into a bedroom with new insulation.").changes;
    });
    const removals = changes.filter((c) => c.kind === "remove");
    expect(removals.map((r) => r.targetItemId).sort()).toEqual(["i1", "i2"]);
    expect(removals.every((r) => r.requiresReview)).toBe(true);
    expect(bulkInclusion).not.toHaveBeenCalled();
  });

  it("excludes confirmed leftovers rather than deleting them", async () => {
    const { result } = renderHook(() => useNarrativeInterpretation("proj-1"), { wrapper });
    let changes: ReturnType<typeof interpretNarrativeEdit>["changes"] = [];
    act(() => {
      changes = result.current.begin("", "Convert the garage into a bedroom with new insulation.").changes;
    });
    await act(async () => { await result.current.apply(changes.filter((c) => c.kind === "remove")); });

    const call = bulkInclusion.mock.calls[0][0] as { itemIds: string[]; isIncluded: boolean };
    expect(call.isIncluded).toBe(false);
    expect(call.itemIds.sort()).toEqual(["i1", "i2"]);
  });
});
