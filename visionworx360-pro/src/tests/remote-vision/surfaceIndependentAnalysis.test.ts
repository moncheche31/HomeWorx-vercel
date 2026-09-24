import { describe, expect, it, vi, afterEach } from "vitest";
import {
  planMediaAnalysis,
  visionRefsForPhotos,
} from "@/features/remote-vision/services/ensureMediaAnalysis.shared";
import {
  scheduleProjectMediaAnalysis,
  resetAnalysisScheduler,
} from "@/features/remote-vision/services/analysisScheduler";

afterEach(() => {
  resetAnalysisScheduler();
  vi.useRealTimers();
});

describe("vision refs from durable photos", () => {
  const photo = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    storagePath: `org/proj/photos/${id}.jpg`,
    mimeType: "image/jpeg",
    photoType: "existing",
    caption: null,
    ...over,
  });

  it("maps stored photos regardless of upload surface", () => {
    const refs = visionRefsForPhotos([photo("a"), photo("b")], 12);
    expect(refs.map((r) => r.id)).toEqual(["a", "b"]);
    expect(refs[0]!.kind).toBe("before_photo");
    expect(refs[0]!.storagePath).toContain("a.jpg");
  });

  it("keeps floor plan and rendering authority classes", () => {
    const refs = visionRefsForPhotos(
      [photo("f", { caption: "floor_plan" }), photo("r", { photoType: "rendering" })],
      12,
    );
    expect(refs[0]!.kind).toBe("floor_plan");
    expect(refs[1]!.kind).toBe("after_rendering");
  });

  it("skips rows without stored bytes and honours the image cap", () => {
    const refs = visionRefsForPhotos(
      [photo("x", { storagePath: null }), photo("y"), photo("z")],
      1,
    );
    expect(refs.map((r) => r.id)).toEqual(["y"]);
  });
});

describe("one run per real media-set change", () => {
  it("runs when a new photo arrives", () => {
    expect(
      planMediaAnalysis({ mediaIds: ["a", "b"], storedFingerprint: "a", storedStatus: "ok" }).run,
    ).toBe(true);
  });

  it("does not re-run for an unchanged media set (page visits are free)", () => {
    const plan = planMediaAnalysis({
      mediaIds: ["b", "a"],
      storedFingerprint: "a|b",
      storedStatus: "ok",
    });
    expect(plan.run).toBe(false);
    expect(plan.reason).toBe("already_analyzed");
  });

  it("treats a superset fingerprint (video keyframes) as covered", () => {
    expect(
      planMediaAnalysis({
        mediaIds: ["a"],
        storedFingerprint: "a|vid#frame-0",
        storedStatus: "ok",
      }).run,
    ).toBe(false);
  });

  it("retries after a stored provider failure", () => {
    expect(
      planMediaAnalysis({
        mediaIds: ["a"],
        storedFingerprint: "a",
        storedStatus: "provider_error",
      }).run,
    ).toBe(true);
  });

  it("never runs with no media", () => {
    const plan = planMediaAnalysis({ mediaIds: [], storedFingerprint: null, storedStatus: "no_media" });
    expect(plan).toEqual({ run: false, reason: "no_media", fingerprint: null });
  });
});

describe("upload-burst debounce", () => {
  it("coalesces a three-photo burst into one call", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({ status: "analyzed" });
    for (let i = 0; i < 3; i += 1) scheduleProjectMediaAnalysis("p1", run, 50);
    await vi.advanceTimersByTimeAsync(60);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("p1");
  });

  it("keeps projects independent and swallows failures", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(new Error("gateway down"));
    scheduleProjectMediaAnalysis("p1", run, 50);
    scheduleProjectMediaAnalysis("p2", run, 50);
    await vi.advanceTimersByTimeAsync(60);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
