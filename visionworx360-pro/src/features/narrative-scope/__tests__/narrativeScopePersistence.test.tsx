/**
 * Durable narrative scope persistence (URGENT repair).
 *
 * Root cause guarded here: contractor-edited Scope of Work wording lived only
 * in `localStorage`, so a reload on another device — or any auth/organization
 * re-resolution that reset client state — silently reverted the visible scope
 * to the generated text. The wording is now stored per project/organization in
 * the database and hydrated from there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EMPTY_NARRATIVE_RECORD,
  hasNarrativeContent,
  mapNarrativeRow,
  patchToRow,
  type NarrativeScopeRecord,
} from "../services/narrativeScope.shared";

/** In-memory stand-in for the `project_narrative_scopes` row. */
const db: { row: NarrativeScopeRecord | null } = { row: null };
const calls: string[] = [];

vi.mock("../services/narrativeScope.functions", () => ({
  getNarrativeScope: { __name: "getNarrativeScope" },
  saveNarrativeScope: { __name: "saveNarrativeScope" },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: () => async () => null,
    };
    return chain;
  },
  useServerFn: (fn: { __name?: string }) => async ({ data }: { data: Record<string, never> }) => {
    calls.push(fn.__name ?? "unknown");
    if (fn.__name === "getNarrativeScope") return db.row;
    const patch = (data as unknown as { patch: Partial<NarrativeScopeRecord> }).patch;
    db.row = { ...(db.row ?? EMPTY_NARRATIVE_RECORD), ...patch, version: 1 };
    return db.row;
  },
}));

const { useNarrativeScopeStore, approveRecord, invalidateApprovalRecord } = await import(
  "../hooks/useNarrativeScopeStore"
);

const PROJECT = "11111111-1111-1111-1111-111111111111";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mount() {
  return renderHook(() => useNarrativeScopeStore(PROJECT), { wrapper: wrapper() });
}

describe("durable narrative scope persistence", () => {
  beforeEach(() => {
    db.row = null;
    calls.length = 0;
    window.localStorage.clear();
  });

  it("saved edited wording survives reload / remount with a fresh cache", async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    await act(async () => {
      await first.result.current.update({ editedText: "Contractor wording v2." });
    });
    first.unmount();

    // Fresh mount = fresh QueryClient = reload. Wording comes from the database.
    const second = mount();
    await waitFor(() =>
      expect(second.result.current.record.editedText).toBe("Contractor wording v2."),
    );
  });

  it("survives an auth/org hydration re-run that clears device storage", async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    await act(async () => {
      await first.result.current.update({ editedText: "Durable wording." });
    });
    first.unmount();

    // New device / cleared browser storage after logout-login.
    window.localStorage.clear();
    const second = mount();
    await waitFor(() => expect(second.result.current.record.editedText).toBe("Durable wording."));
  });

  it("does not let the generated fallback overwrite durable edited text", async () => {
    db.row = { ...EMPTY_NARRATIVE_RECORD, editedText: "Stored contractor wording." };
    window.localStorage.setItem(
      "vwx.narrativeScope.v1." + PROJECT,
      JSON.stringify({ ...EMPTY_NARRATIVE_RECORD, editedText: "Stale device wording." }),
    );
    const view = mount();
    await waitFor(() =>
      expect(view.result.current.record.editedText).toBe("Stored contractor wording."),
    );
    // No blind save back over the durable record.
    expect(calls.filter((c) => c === "saveNarrativeScope")).toHaveLength(0);
  });

  it("migrates device-only wording forward exactly once when the database is empty", async () => {
    window.localStorage.setItem(
      "vwx.narrativeScope.v1." + PROJECT,
      JSON.stringify({ ...EMPTY_NARRATIVE_RECORD, editedText: "Legacy local wording." }),
    );
    const view = mount();
    await waitFor(() => expect(db.row?.editedText).toBe("Legacy local wording."));
    expect(view.result.current.record.editedText).toBe("Legacy local wording.");
  });

  it("wording-only save persists without changing the approved structured fingerprint", async () => {
    db.row = {
      ...EMPTY_NARRATIVE_RECORD,
      ...approveRecord(EMPTY_NARRATIVE_RECORD, {
        text: "Approved wording.",
        scopeFingerprint: "sf1:1:aaaa",
      }),
    } as NarrativeScopeRecord;
    const view = mount();
    await waitFor(() => expect(view.result.current.record.approvedAt).toBeTruthy());
    await act(async () => {
      await view.result.current.update({ editedText: "Reworded, same work." });
    });
    expect(db.row?.editedText).toBe("Reworded, same work.");
    expect(db.row?.approvedScopeFingerprint).toBe("sf1:1:aaaa");
    expect(db.row?.approvedAt).toBeTruthy();
  });

  it("persists wording before structural changes are reviewed or applied", async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    // The tab awaits saveWording before opening Review Scope Changes.
    await act(async () => {
      await view.result.current.update({ editedText: "Also add recessed lighting." });
    });
    expect(db.row?.editedText).toBe("Also add recessed lighting.");
    // Nothing approved/invalidated yet — review is still pending.
    expect(db.row?.approvedAt).toBeNull();
  });

  it("persists approval state and history, and invalidation on structural change", async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.hydrated).toBe(true));
    await act(async () => {
      await view.result.current.update(
        approveRecord(view.result.current.record, {
          text: "Approved scope.",
          scopeFingerprint: "sf1:1:bbbb",
        }),
      );
    });
    expect(db.row?.approvalHistory).toHaveLength(1);

    await act(async () => {
      await view.result.current.update(invalidateApprovalRecord(view.result.current.record));
    });
    expect(db.row?.approvedAt).toBeNull();
    expect(db.row?.approvalHistory?.[0]?.invalidatedReason).toBe("scope_changed");

    // Survives a reload.
    view.unmount();
    const reloaded = mount();
    await waitFor(() => expect(reloaded.result.current.record.approvalHistory).toHaveLength(1));
    expect(reloaded.result.current.record.approvedAt).toBeNull();
  });
});

describe("narrative scope row mapping", () => {
  it("maps rows and patches without touching untouched columns", () => {
    const record = mapNarrativeRow({
      edited_text: "Wording",
      answers: { q1: "yes" },
      approved_text: null,
      approved_at: null,
      approved_scope_fingerprint: null,
      approval_history: [],
    });
    expect(record.editedText).toBe("Wording");
    expect(record.answers).toEqual({ q1: "yes" });

    expect(patchToRow({ editedText: "New" })).toEqual({ edited_text: "New" });
    expect(hasNarrativeContent(EMPTY_NARRATIVE_RECORD)).toBe(false);
    expect(hasNarrativeContent({ ...EMPTY_NARRATIVE_RECORD, editedText: "x" })).toBe(true);
  });
});
