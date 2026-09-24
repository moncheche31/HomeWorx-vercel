import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  buildInputLedger,
  buildMeasurementFacts,
  emptyDimensions,
  keyframeTimestamps,
  mergeIntakeText,
  validateVideoFile,
} from "@/domains/remoteVision";
import en from "@/i18n/locales/en-US/remote-vision.json";
import es from "@/i18n/locales/es-US/remote-vision.json";
import enWorkspace from "@/i18n/locales/en-US/workspace.json";
import esWorkspace from "@/i18n/locales/es-US/workspace.json";

const ctx = (over: Partial<Parameters<typeof mergeIntakeText>[1]> = {}) => ({
  voiceTranscript: "",
  typedNotes: "",
  dimensions: [],
  ...over,
});

describe("prerecorded video intake", () => {
  it("accepts common device video types", () => {
    for (const mime of ["video/mp4", "video/quicktime", "video/webm"]) {
      expect(validateVideoFile({ mimeType: mime, sizeBytes: 10_000_000 })).toBeNull();
    }
  });

  it("rejects unsupported types, oversized and over-long video", () => {
    expect(validateVideoFile({ mimeType: "application/zip", sizeBytes: 10 })).toBe(
      "unsupported_type",
    );
    expect(validateVideoFile({ mimeType: "video/mp4", sizeBytes: MAX_VIDEO_BYTES + 1 })).toBe(
      "too_large",
    );
    expect(
      validateVideoFile({
        mimeType: "video/mp4",
        sizeBytes: 10,
        durationSeconds: MAX_VIDEO_SECONDS + 1,
      }),
    ).toBe("too_long");
  });

  it("samples representative frames across the clip", () => {
    const stamps = keyframeTimestamps(120, 8);
    expect(stamps).toHaveLength(8);
    expect(stamps[0]).toBeGreaterThan(0);
    expect(stamps.at(-1)!).toBeLessThan(120);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });
});

describe("follow-up context merging", () => {
  it("merges description, voice note, typed notes and measurements", () => {
    const dims = { ...emptyDimensions("d1", "Garage"), lengthFt: 20, widthFt: 22, ceilingHeightFt: 9 };
    const text = mergeIntakeText("Convert the garage.", {
      voiceTranscript: "Add a full bathroom.",
      typedNotes: "Customer wants LVP flooring.",
      dimensions: [dims],
    });
    expect(text).toContain("Convert the garage.");
    expect(text).toContain("Add a full bathroom.");
    expect(text).toContain("LVP flooring");
    expect(text).toContain("20 by 22 feet");
    expect(text).toContain("9 foot ceilings");
  });

  it("turns contractor measurements into facts and never media", () => {
    const dims = { ...emptyDimensions("d1", "Garage"), lengthFt: 20, widthFt: 22 };
    const facts = buildMeasurementFacts(ctx({ dimensions: [dims] }));
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.source === "contractor")).toBe(true);
  });

  it("marks media as observed and contractor input as confirmed", () => {
    const ledger = buildInputLedger(
      "Convert the garage.",
      ctx({ typedNotes: "Notes" }),
      [
        {
          id: "v1",
          kind: "walkthrough_video",
          fileName: "walk.mp4",
          mimeType: "video/mp4",
          sizeBytes: 100,
          previewUrl: null,
          storagePath: "org/proj/documents/x/walk.mp4",
          roomHint: null,
          createdAt: new Date().toISOString(),
          keyframeCount: 8,
        },
      ],
    );
    const video = ledger.find((r) => r.kind === "video");
    expect(video?.contractorConfirmed).toBe(false);
    expect(ledger.filter((r) => r.contractorConfirmed).length).toBe(2);
  });
});

describe("bilingual labels", () => {
  it("uses Photos or Video for the create-estimate method in both locales", () => {
    const en0 = enWorkspace as Record<string, any>;
    const es0 = esWorkspace as Record<string, any>;
    const find = (node: any): any => {
      if (node && typeof node === "object") {
        if (node.photos?.title) return node.photos;
        for (const v of Object.values(node)) {
          const hit = find(v);
          if (hit) return hit;
        }
      }
      return null;
    };
    expect(find(en0).title).toBe("Photos or Video");
    expect(find(es0).title).toBe("Fotos o Video");
  });

  it("has EN/ES parity for the new video, details and ledger keys", () => {
    const keys = (o: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(keys(es as Record<string, unknown>).sort()).toEqual(
      keys(en as Record<string, unknown>).sort(),
    );
    for (const k of ["video.add", "details.title", "details.dimensions.lengthFt", "ledger.title"]) {
      expect(keys(en as Record<string, unknown>)).toContain(k);
    }
  });
});
