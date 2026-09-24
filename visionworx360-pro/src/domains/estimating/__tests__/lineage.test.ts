import { describe, expect, it } from "vitest";
import {
  buildLineages,
  canCreateChangeOrder,
  changeOrderEligibility,
  changeOrderNumber,
  describeDocument,
  describeLineages,
  displayVersion,
  findLineageFor,
  isAlternate,
  isChangeOrder,
  isOriginal,
  isReadOnly,
  isRevision,
  optionLetter,
  orderRevisions,
  revisionNumberOf,
  selectActiveDocument,
  type LineageDocument,
  type LineageStatus,
} from "../lineage";

const doc = (over: Partial<LineageDocument> & { id: string }): LineageDocument => ({
  projectId: "p1",
  documentKind: "estimate",
  lineageRootId: over.id,
  revisionNumber: 0,
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const ALL_STATUSES: LineageStatus[] = [
  "draft",
  "in_review",
  "ready",
  "approved",
  "sent",
  "accepted",
  "declined",
  "superseded",
];

describe("lineage: legacy defaults", () => {
  it("treats a row with no lineage metadata as a self-rooted original", () => {
    const legacy: LineageDocument = { id: "a", projectId: "p1", version: 1 };
    expect(isOriginal(legacy)).toBe(true);
    expect(isRevision(legacy)).toBe(false);
    expect(revisionNumberOf(legacy)).toBe(0);
    expect(displayVersion(legacy)).toBe(1);
    expect(isReadOnly(legacy)).toBe(false);
  });

  it("derives revision number from legacy version when absent", () => {
    expect(revisionNumberOf({ id: "a", projectId: "p", version: 3 })).toBe(2);
    expect(revisionNumberOf({ id: "a", projectId: "p", version: 0 })).toBe(0);
    expect(revisionNumberOf({ id: "a", projectId: "p" })).toBe(0);
  });

  it("ignores unknown status values by falling back to draft-family", () => {
    const weird = { id: "a", projectId: "p", status: "bogus" } as LineageDocument;
    expect(isReadOnly(weird)).toBe(false);
  });
});

describe("lineage: read-only rules", () => {
  it.each(ALL_STATUSES)("status %s read-only state is deterministic", (status) => {
    const expected = ["accepted", "declined", "superseded", "approved"].includes(status);
    expect(isReadOnly(doc({ id: "a", status }))).toBe(expected);
  });

  it("lockedAt forces read-only even for drafts", () => {
    expect(isReadOnly(doc({ id: "a", status: "draft", lockedAt: "2026-01-02" }))).toBe(true);
  });

  it("supersededById forces read-only", () => {
    expect(isReadOnly(doc({ id: "a", status: "sent", supersededById: "b" }))).toBe(true);
  });
});

describe("lineage: change-order eligibility", () => {
  it.each(ALL_STATUSES)("only accepted estimates allow a change order (%s)", (status) => {
    const d = doc({ id: "a", status });
    expect(canCreateChangeOrder(d)).toBe(status === "accepted");
    if (status !== "accepted") {
      expect(changeOrderEligibility(d).reason).toBe("not_accepted");
    }
  });

  it("allows a change order on an accepted alternate", () => {
    expect(canCreateChangeOrder(doc({ id: "a", documentKind: "alternate", status: "accepted" }))).toBe(true);
  });

  it("never allows a change order on a change order", () => {
    const co = doc({ id: "a", documentKind: "change_order", status: "accepted" });
    expect(changeOrderEligibility(co)).toEqual({ allowed: false, reason: "source_is_change_order" });
  });

  it("blocks archived documents", () => {
    const d = doc({ id: "a", status: "accepted", archivedAt: "2026-02-01" });
    expect(changeOrderEligibility(d)).toEqual({ allowed: false, reason: "archived" });
  });
});

describe("lineage: ordering and active selection", () => {
  const v1 = doc({ id: "v1", revisionNumber: 0, status: "superseded", supersededById: "v2" });
  const v2 = doc({ id: "v2", lineageRootId: "v1", revisionNumber: 1, status: "sent" });
  const v3 = doc({ id: "v3", lineageRootId: "v1", revisionNumber: 2, status: "draft" });

  it("orders revisions oldest to newest", () => {
    expect(orderRevisions([v3, v1, v2]).map((d) => d.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("selects the newest non-superseded document", () => {
    expect(selectActiveDocument([v1, v2, v3])?.id).toBe("v3");
  });

  it("prefers an accepted document over a newer draft", () => {
    const accepted = doc({ id: "v2", lineageRootId: "v1", revisionNumber: 1, status: "accepted" });
    expect(selectActiveDocument([v1, accepted, v3])?.id).toBe("v2");
  });

  it("falls back to the newest revision when all are superseded", () => {
    const s2 = doc({ id: "v2", lineageRootId: "v1", revisionNumber: 1, status: "superseded" });
    expect(selectActiveDocument([v1, s2])?.id).toBe("v2");
  });

  it("returns null for an empty set", () => {
    expect(selectActiveDocument([])).toBeNull();
  });

  it("breaks ties by createdAt then id", () => {
    const a = doc({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = doc({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(orderRevisions([a, b]).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("lineage: grouping", () => {
  const v1 = doc({ id: "v1", status: "superseded", supersededById: "v2" });
  const v2 = doc({ id: "v2", lineageRootId: "v1", revisionNumber: 1, status: "accepted" });
  const altA = doc({ id: "altA", documentKind: "alternate", optionLabel: "Option A", createdAt: "2026-01-03" });
  const altB = doc({ id: "altB", documentKind: "alternate", createdAt: "2026-01-04" });
  const co = doc({ id: "co1", documentKind: "change_order", parentEstimateId: "v2", createdAt: "2026-01-05" });

  const lineages = buildLineages([co, altB, v2, altA, v1]);

  it("groups revisions of one lineage together and keeps alternates as peers", () => {
    expect(lineages).toHaveLength(3);
    expect(lineages[0]!.rootId).toBe("v1");
    expect(lineages[0]!.revisions.map((d) => d.id)).toEqual(["v1", "v2"]);
    expect(lineages.slice(1).map((l) => l.rootId)).toEqual(["altA", "altB"]);
    expect(lineages.slice(1).every((l) => l.kind === "alternate")).toBe(true);
  });

  it("attaches change orders to the lineage of their accepted parent", () => {
    expect(lineages[0]!.changeOrders.map((d) => d.id)).toEqual(["co1"]);
    expect(lineages[1]!.changeOrders).toEqual([]);
  });

  it("exposes active and accepted documents per lineage", () => {
    expect(lineages[0]!.active.id).toBe("v2");
    expect(lineages[0]!.accepted?.id).toBe("v2");
    expect(lineages[1]!.accepted).toBeNull();
  });

  it("finds the lineage a document belongs to", () => {
    expect(findLineageFor(lineages, "co1")?.rootId).toBe("v1");
    expect(findLineageFor(lineages, "altB")?.rootId).toBe("altB");
    expect(findLineageFor(lineages, "missing")).toBeNull();
  });

  it("handles an orphan change order without dropping it", () => {
    const orphan = doc({ id: "co9", documentKind: "change_order", parentEstimateId: "gone" });
    const out = buildLineages([orphan]);
    expect(out).toHaveLength(1);
    expect(out[0]!.changeOrders.map((d) => d.id)).toEqual(["co9"]);
    expect(out[0]!.active.id).toBe("co9");
  });

  it("returns nothing for an empty project", () => {
    expect(buildLineages([])).toEqual([]);
  });
});

describe("lineage: labels", () => {
  it("labels estimates by 1-based version", () => {
    expect(describeDocument(doc({ id: "a" })).text).toBe("Estimate v1");
    expect(describeDocument(doc({ id: "b", revisionNumber: 2 })).text).toBe("Estimate v3");
  });

  it("uses the stored option label, else a deterministic letter", () => {
    expect(describeDocument(doc({ id: "a", documentKind: "alternate", optionLabel: "Option A" })).text).toBe("Option A");
    expect(describeDocument(doc({ id: "b", documentKind: "alternate" }), { optionIndex: 1 }).text).toBe("Option B");
  });

  it("formats change-order numbers", () => {
    expect(changeOrderNumber(1)).toBe("01");
    expect(changeOrderNumber(12)).toBe("12");
    expect(describeDocument(doc({ id: "c", documentKind: "change_order" }), { changeOrderSequence: 2 }).text).toBe("CO-02");
  });

  it("generates option letters past Z", () => {
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(25)).toBe("Z");
    expect(optionLetter(26)).toBe("AA");
  });

  it("describes every document of a project", () => {
    const v1 = doc({ id: "v1" });
    const alt = doc({ id: "alt", documentKind: "alternate", createdAt: "2026-01-03" });
    const co = doc({ id: "co", documentKind: "change_order", parentEstimateId: "v1", createdAt: "2026-01-04" });
    const labels = describeLineages(buildLineages([v1, alt, co]));
    expect(labels.get("v1")?.text).toBe("Estimate v1");
    expect(labels.get("alt")?.text).toBe("Option A");
    expect(labels.get("co")?.text).toBe("CO-01");
  });

  it("classifies kinds", () => {
    expect(isAlternate(doc({ id: "a", documentKind: "alternate" }))).toBe(true);
    expect(isChangeOrder(doc({ id: "a", documentKind: "change_order" }))).toBe(true);
    expect(isOriginal(doc({ id: "a" }))).toBe(true);
    expect(isRevision(doc({ id: "b", lineageRootId: "a", revisionNumber: 1 }))).toBe(true);
  });
});
