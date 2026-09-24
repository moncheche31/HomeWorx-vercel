import { describe, expect, it } from "vitest";
import {
  detectAction,
  detectMeasurements,
  detectQuantity,
  detectRoom,
  detectUnit,
  mergeDrafts,
  parseTranscript,
  splitDraft,
  splitUtterances,
} from "../parser";
import type { VoiceAssemblyRef } from "../types";

const assemblies: VoiceAssemblyRef[] = [
  {
    assemblyKey: "demo-vanity", workItem: "Remove vanity", tradeKey: "plumbing",
    categoryKey: "site_prep", subcategoryKey: "demolition", unitKey: "each",
    keywords: ["vanity", "demolition", "remove"],
  },
  {
    assemblyKey: "install-vanity", workItem: "Install vanity", tradeKey: "carpentry",
    categoryKey: "fixtures_appliances", subcategoryKey: "plumbing_fixtures", unitKey: "each",
    keywords: ["vanity", "install", "cabinet"],
  },
  {
    assemblyKey: "install-recessed-light", workItem: "Install recessed light",
    tradeKey: "electrical", categoryKey: "electrical", subcategoryKey: "lighting",
    unitKey: "each", keywords: ["recessed", "light", "can"],
  },
  {
    assemblyKey: "paint-walls", workItem: "Paint walls", tradeKey: "painting",
    categoryKey: "interior_finishes", subcategoryKey: "paint", unitKey: "square_foot",
    keywords: ["paint", "walls"],
  },
];

describe("voice transcript segmentation", () => {
  it("splits on punctuation and spoken connectors", () => {
    expect(splitUtterances("Remove existing vanity. Install a new vanity and then paint walls"))
      .toEqual(["Remove existing vanity", "Install a new vanity", "paint walls"]);
  });
});

describe("detectors", () => {
  it("detects word and digit quantities", () => {
    expect(detectQuantity("install two recessed lights").quantity).toBe(2);
    expect(detectQuantity("five outlets").quantity).toBe(5);
    expect(detectQuantity("thirty square feet of tile").quantity).toBe(30);
    expect(detectQuantity("twelve recessed lights").quantity).toBe(12);
    expect(detectQuantity("paint walls").quantity).toBeNull();
  });

  it("detects units", () => {
    expect(detectUnit("thirty square feet of tile")).toBe("square_foot");
    expect(detectUnit("40 linear feet of trim")).toBe("linear_foot");
    expect(detectUnit("install a vanity")).toBeNull();
  });

  it("detects actions", () => {
    expect(detectAction("remove existing vanity")).toBe("remove");
    expect(detectAction("replace faucet")).toBe("replace");
    expect(detectAction("paint all walls")).toBe("paint");
    expect(detectAction("quitar el tocador")).toBe("remove");
  });

  it("captures measurements verbatim without interpreting them", () => {
    expect(detectMeasurements("5 by 8 bathroom")[0]).toMatchObject({
      kind: "area_dimensions", values: [5, 8], raw: "5 by 8",
    });
    expect(detectMeasurements("10-foot ceiling")[0]).toMatchObject({ kind: "height", unit: "foot" });
    expect(detectMeasurements("install a 48-inch vanity")[0]).toMatchObject({
      kind: "size", unit: "inch", values: [48],
    });
  });

  it("detects rooms from the lexicon and project rooms", () => {
    expect(detectRoom("in the master bath", [])?.name).toBe("Master Bath");
    expect(detectRoom("moving to the bonus room", [{ id: "r1", name: "Bonus Room" }])?.id).toBe("r1");
    expect(detectRoom("replace faucet", [])).toBeNull();
  });
});

describe("parseTranscript", () => {
  const transcript = [
    "In the master bath.",
    "Remove existing vanity.",
    "Install a new 48-inch vanity.",
    "Replace faucet.",
    "Install two recessed lights.",
    "Paint all walls.",
    "Reconfigure the widget bracket thing.",
  ].join(" ");

  const result = parseTranscript(transcript, {
    rooms: [{ id: "room-1", name: "Master Bath" }],
    assemblies,
  });

  it("skips context-only utterances", () => {
    expect(result.contextUtterances).toContain("In the master bath");
  });

  it("associates every draft with the detected room", () => {
    expect(result.drafts.every((d) => d.roomId === "room-1")).toBe(true);
  });

  it("matches the knowledge base and keeps quantities editable", () => {
    const lights = result.drafts.find((d) => d.sourceText.includes("recessed"));
    expect(lights?.assemblyKey).toBe("install-recessed-light");
    expect(lights?.quantity).toBe(2);
    expect(lights?.unitKey).toBe("each");
  });

  it("creates a custom draft when nothing matches", () => {
    const custom = result.drafts.find((d) => d.sourceText.includes("widget"));
    expect(custom?.origin).toBe("custom");
    expect(custom?.assemblyKey).toBeNull();
    expect(custom?.confidence).toBe("low");
  });

  it("preselects only high-confidence drafts", () => {
    expect(result.drafts.every((d) => d.selected === (d.confidence === "high"))).toBe(true);
  });

  it("flags ambiguous matches for review", () => {
    const ambiguous = parseTranscript("vanity", { assemblies }).drafts[0];
    expect(ambiguous.needsReview).toBe(true);
    expect(ambiguous.assemblyKey).toBeNull();
    expect(ambiguous.matches.length).toBeGreaterThan(1);
  });
});

describe("review operations", () => {
  const [a, b] = parseTranscript("Remove vanity. Install vanity", { assemblies }).drafts;

  it("merges drafts", () => {
    const merged = mergeDrafts(a, b);
    expect(merged.title).toContain("Remove vanity");
    expect(merged.title).toContain("Install vanity");
  });

  it("splits drafts", () => {
    const draft = parseTranscript("Install vanity and mirror", { assemblies }).drafts[0];
    const parts = splitDraft(draft);
    expect(parts).toHaveLength(2);
    expect(parts[1].sourceText).toBe("mirror");
  });
});

describe("performance", () => {
  it("parses a long walkthrough quickly", () => {
    const long = Array.from({ length: 1000 }, () => "Install two recessed lights.").join(" ");
    const start = performance.now();
    const out = parseTranscript(long, { assemblies });
    expect(out.drafts).toHaveLength(1000);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
