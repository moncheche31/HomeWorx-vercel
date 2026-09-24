import { describe, expect, it, vi, beforeEach } from "vitest";

const analyzeMediaWithModel = vi.fn();
const resolveProjectVisionImages = vi.fn();
const loadMediaUnderstanding = vi.fn();
const persistMediaUnderstanding = vi.fn();

vi.mock("@/features/remote-vision/services/visionUnderstanding.server", () => ({
  analyzeMediaWithModel: (...a: unknown[]) => analyzeMediaWithModel(...a),
}));
vi.mock("@/features/remote-vision/services/visionRequest.server", () => ({
  resolveProjectVisionImages: (...a: unknown[]) => resolveProjectVisionImages(...a),
}));
vi.mock("@/features/remote-vision/services/mediaUnderstanding.server", () => ({
  loadMediaUnderstanding: (...a: unknown[]) => loadMediaUnderstanding(...a),
  persistMediaUnderstanding: (...a: unknown[]) => persistMediaUnderstanding(...a),
}));

import { ensureProjectMediaAnalysisFor } from "@/features/remote-vision/services/ensureMediaAnalysis.server";

function supabaseWithPhotos(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    is: self,
    order: () => Promise.resolve({ data: rows, error: null }),
  });
  return { from: () => chain };
}

const photoRow = {
  id: "11111111-1111-1111-1111-111111111111",
  storage_path: "org/proj/photos/a.jpg",
  mime_type: "image/jpeg",
  photo_type: "existing",
  caption: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadMediaUnderstanding.mockResolvedValue(null);
  persistMediaUnderstanding.mockResolvedValue({});
  resolveProjectVisionImages.mockResolvedValue([
    { id: photoRow.id, kind: "before_photo", dataUrl: "data:image/jpeg;base64,AAA" },
  ]);
});

describe("ensureProjectMediaAnalysisFor", () => {
  it("analyzes a photo uploaded from any surface and persists the result", async () => {
    analyzeMediaWithModel.mockResolvedValue({
      status: "ok",
      observations: [{ id: "o1" }],
    });
    const out = await ensureProjectMediaAnalysisFor(supabaseWithPhotos([photoRow]), "u1", "p1");
    expect(out).toEqual({ status: "analyzed", observations: 1 });
    expect(persistMediaUnderstanding).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "p1",
      expect.objectContaining({ mediaFingerprint: photoRow.id, visualStatus: "ok" }),
    );
  });

  it("skips an already-analyzed media set (no gateway call)", async () => {
    loadMediaUnderstanding.mockResolvedValue({
      mediaFingerprint: photoRow.id,
      visualStatus: "ok",
      spokenNarration: "",
    });
    const out = await ensureProjectMediaAnalysisFor(supabaseWithPhotos([photoRow]), "u1", "p1");
    expect(out).toEqual({ status: "skipped", reason: "already_analyzed" });
    expect(analyzeMediaWithModel).not.toHaveBeenCalled();
  });

  it("does nothing when the project has no photos", async () => {
    const out = await ensureProjectMediaAnalysisFor(supabaseWithPhotos([]), "u1", "p1");
    expect(out).toEqual({ status: "skipped", reason: "no_media" });
  });

  it("never throws on a provider failure and does not claim the fingerprint", async () => {
    analyzeMediaWithModel.mockResolvedValue({
      status: "provider_error",
      observations: [],
      errorCode: "call_failed",
    });
    const out = await ensureProjectMediaAnalysisFor(supabaseWithPhotos([photoRow]), "u1", "p1");
    expect(out).toEqual({ status: "failed", reason: "call_failed" });
    expect(persistMediaUnderstanding).toHaveBeenCalledWith(expect.anything(), "u1", "p1", {
      visualStatus: "provider_error",
    });
  });

  it("swallows an unexpected error so an upload can never fail because of analysis", async () => {
    analyzeMediaWithModel.mockRejectedValue(new Error("boom"));
    const out = await ensureProjectMediaAnalysisFor(supabaseWithPhotos([photoRow]), "u1", "p1");
    expect(out).toEqual({ status: "failed", reason: "boom" });
  });
});
