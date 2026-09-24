import { describe, expect, it } from "vitest";
import {
  interpretNarrativeEdit,
  subjectFor,
  type InterpretationScopeItem,
} from "@/domains/scopeInterpretation";

const item = (over: Partial<InterpretationScopeItem>): InterpretationScopeItem => ({
  id: "i1",
  sectionId: "s1",
  roomId: null,
  title: "Install interior door",
  actionKey: "install",
  quantity: 1,
  unitKey: "each",
  materialSelection: null,
  isIncluded: true,
  ...over,
});

const BASE = "Frame the new partition walls. Install interior door.";

describe("scope subjects", () => {
  it("matches the most specific construction subject in EN and ES", () => {
    expect(subjectFor("Install recessed lighting")?.key).toBe("electrical");
    expect(subjectFor("Instalar puertas nuevas")?.key).toBe("door");
    expect(subjectFor("New luxury vinyl flooring")?.key).toBe("flooring");
    expect(subjectFor("Thanks for your business")).toBeNull();
  });
});

describe("interpretNarrativeEdit", () => {
  const items = [item({}), item({ id: "i2", title: "Frame partition walls", unitKey: "linear_foot", quantity: 40 })];

  it("treats pure wording polish as wording only", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: "Frame the new partition walls. Install the interior door.",
      items,
    });
    expect(res.isWordingOnly).toBe(true);
    expect(res.changes).toHaveLength(0);
  });

  it("ignores narrative prose with no construction subject", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: `${BASE} All work is performed by our own crews.`,
      items,
    });
    expect(res.isWordingOnly).toBe(true);
  });

  it("interprets added demolition as new structured work", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: `${BASE} Demolish the existing tile in the bathroom.`,
      items,
    });
    expect(res.isWordingOnly).toBe(false);
    const change = res.changes[0]!;
    expect(change.kind).toBe("add");
    expect(change.actionKey).toBe("remove");
    expect(change.subjectKey).toBe("tile");
    // Nothing prices tile yet: it must be flagged, not hidden.
    expect(change.needsPricing).toBe(true);
  });

  it("adds a quantified line with high confidence and no review", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: `${BASE} Add 6 recessed lights in the living room.`,
      items,
    });
    const change = res.changes[0]!;
    expect(change.kind).toBe("add");
    expect(change.quantity).toBe(6);
    expect(change.confidence).toBe("high");
    expect(change.requiresReview).toBe(false);
  });

  it("updates an existing item when the narrative restates it with a new quantity", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: "Frame partition walls 60 linear feet. Install interior door.",
      items,
    });
    const change = res.changes.find((c) => c.kind === "update");
    expect(change?.targetItemId).toBe("i2");
    expect(change?.quantity).toBe(60);
  });

  it("flags closing in an existing opening as a reviewed removal", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: `${BASE} Close in the interior door opening.`,
      items,
    });
    const change = res.removed[0]!;
    expect(change.kind).toBe("remove");
    expect(change.targetItemId).toBe("i1");
    expect(change.requiresReview).toBe(true);
    expect(res.requiresReview).toBe(true);
  });

  it("treats a deleted sentence as a removal proposal that must be reviewed", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: "Frame the new partition walls.",
      items,
    });
    expect(res.removed).toHaveLength(1);
    expect(res.removed[0]!.targetItemId).toBe("i1");
    expect(res.removed[0]!.requiresReview).toBe(true);
  });

  it("never proposes changes against excluded scope items", () => {
    const res = interpretNarrativeEdit({
      priorText: BASE,
      nextText: "Frame the new partition walls.",
      items: [item({ isIncluded: false })],
    });
    expect(res.removed).toHaveLength(0);
  });
});
