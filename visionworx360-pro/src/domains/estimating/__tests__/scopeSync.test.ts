/**
 * Scope → estimate change handling.
 *
 * Structured scope changes make an estimate stale; narrative wording does not.
 * Draft estimates update in place, issued documents get the next revision.
 */
import { describe, it, expect } from "vitest";
import {
  assessScopeSync,
  computeScopeFingerprint,
  findOrphanedLineIds,
  type ScopeFingerprintItem,
} from "@/domains/estimating";

const item = (over: Partial<ScopeFingerprintItem> = {}): ScopeFingerprintItem => ({
  id: "item-1",
  sectionId: "sec-1",
  roomId: null,
  title: "Frame garage wall",
  actionKey: "build",
  quantity: 20,
  unitKey: "linear_foot",
  materialSelection: null,
  finishSelection: null,
  isIncluded: true,
  archivedAt: null,
  ...over,
});

describe("scope fingerprint", () => {
  it("is stable across ordering", () => {
    const a = [item(), item({ id: "item-2", title: "Insulate" })];
    expect(computeScopeFingerprint(a)).toBe(computeScopeFingerprint([...a].reverse()));
  });

  it("changes when a scope item is added", () => {
    const before = computeScopeFingerprint([item()]);
    const after = computeScopeFingerprint([item(), item({ id: "item-2", title: "Drywall" })]);
    expect(after).not.toBe(before);
  });

  it("changes on quantity, unit, material, include and room/section changes", () => {
    const base = computeScopeFingerprint([item()]);
    for (const over of [
      { quantity: 24 },
      { unitKey: "square_foot" },
      { materialSelection: "OSB" },
      { isIncluded: false },
      { roomId: "room-9" },
      { sectionId: "sec-2" },
    ] as Partial<ScopeFingerprintItem>[]) {
      expect(computeScopeFingerprint([item(over)])).not.toBe(base);
    }
  });

  it("ignores narrative wording fields entirely", () => {
    const base = computeScopeFingerprint([item()]);
    const withProse = computeScopeFingerprint([
      { ...item(), ...({ customerNotes: "Rewritten sentence", description: "New prose" } as object) },
    ]);
    expect(withProse).toBe(base);
  });

  it("treats a removed (archived) item as a scope change", () => {
    const before = computeScopeFingerprint([item(), item({ id: "item-2" })]);
    const after = computeScopeFingerprint([item(), item({ id: "item-2", archivedAt: "2026-01-01" })]);
    expect(after).not.toBe(before);
  });
});

describe("scope sync assessment", () => {
  it("draft estimate + scope change => update in place", () => {
    const state = assessScopeSync({
      currentFingerprint: "b",
      syncedFingerprint: "a",
      isEditable: true,
    });
    expect(state.isStale).toBe(true);
    expect(state.action).toBe("update");
  });

  it("issued/approved estimate + scope change => revise", () => {
    const state = assessScopeSync({
      currentFingerprint: "b",
      syncedFingerprint: "a",
      isEditable: false,
    });
    expect(state.action).toBe("revise");
  });

  it("wording-only edit leaves the estimate fresh", () => {
    const fp = computeScopeFingerprint([item()]);
    const state = assessScopeSync({
      currentFingerprint: fp,
      syncedFingerprint: fp,
      isEditable: true,
    });
    expect(state.isStale).toBe(false);
    expect(state.action).toBe("none");
  });

  it("adopts silently when no baseline was ever recorded", () => {
    expect(assessScopeSync({ currentFingerprint: "b", syncedFingerprint: null, isEditable: true }).isStale)
      .toBe(false);
  });

  it("stays stale after a close/reopen because the baseline is durable", () => {
    const stored = computeScopeFingerprint([item()]);
    // Reopened later: current scope now has an extra item.
    const reopened = computeScopeFingerprint([item(), item({ id: "item-2", title: "Drywall" })]);
    expect(assessScopeSync({ currentFingerprint: reopened, syncedFingerprint: stored, isEditable: true }).isStale)
      .toBe(true);
  });
});

describe("removed scope items are flagged, never discarded", () => {
  it("reports lines whose scope item is gone or excluded", () => {
    const lines = [
      { id: "line-1", scopeItemId: "item-1" },
      { id: "line-2", scopeItemId: "item-2" },
      { id: "line-3", scopeItemId: null },
    ];
    const orphans = findOrphanedLineIds(lines, [item(), item({ id: "item-2", isIncluded: false })]);
    expect(orphans).toEqual(["line-2"]);
  });
});
