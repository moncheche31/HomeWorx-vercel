/**
 * PHASE 1 — automatic, NON-DESTRUCTIVE visual analysis.
 *
 * The regression these lock down: adding a photo used to blank the project's
 * visual observations (fingerprint-change wipe) with nothing re-triggering
 * analysis, so a project silently lost its own evidence.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  emptyVisualUnderstanding,
  markVisualUnderstandingStale,
  type VisualUnderstandingResult,
} from "@/domains/remoteVision/visualUnderstanding";
import type { RemoteVisionMedia, VisionAnalysisResult } from "@/domains/remoteVision";
import { analyzeDescription } from "@/domains/remoteVision/analyze";

const analyzeMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => analyzeMock,
}));
vi.mock("@/features/remote-vision/services/visionUnderstanding.functions", () => ({
  analyzeProjectMedia: {},
}));

const { useProjectUnderstanding, AUTO_ANALYSIS_DEBOUNCE_MS } = await import(
  "@/features/remote-vision/hooks/useProjectUnderstanding"
);

const EMPTY_TEXT: VisionAnalysisResult = analyzeDescription({
  locale: "en-US",
  description: "",
  media: [],
});

function photo(id: string): RemoteVisionMedia {
  return {
    id,
    kind: "before_photo",
    name: `${id}.jpg`,
    previewUrl: "data:image/jpeg;base64,AAAA",
  } as unknown as RemoteVisionMedia;
}

function okResult(object: string): VisualUnderstandingResult {
  return {
    ...emptyVisualUnderstanding("ok", "test-model"),
    status: "ok",
    observations: [
      {
        subjectKey: null,
        object,
        nature: "observed_existing",
        actionKey: null,
        mediaIds: ["a"],
        confidence: 0.8,
        note: null,
      },
    ],
  };
}

function render(media: RemoteVisionMedia[], persisted: VisualUnderstandingResult | null = null) {
  return renderHook(
    ({ items, persistedVisual }: { items: RemoteVisionMedia[]; persistedVisual: VisualUnderstandingResult | null }) =>
      useProjectUnderstanding(EMPTY_TEXT, items, "", "", [], undefined, persistedVisual, {
        autoAnalyze: true,
        ready: true,
      }),
    { initialProps: { items: media, persistedVisual: persisted } },
  );
}

describe("automatic visual analysis", () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    analyzeMock.mockResolvedValue(okResult("new cabinets"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks prior observations stale instead of blanking them", () => {
    const previous = okResult("old cabinets");
    expect(markVisualUnderstandingStale(previous).observations).toHaveLength(1);
    expect(markVisualUnderstandingStale(previous).status).toBe("analyzing");
    expect(markVisualUnderstandingStale(previous).stale).toBe(true);
    /* Nothing to preserve -> plain analyzing state, still not "no_media". */
    expect(markVisualUnderstandingStale(emptyVisualUnderstanding("ok")).status).toBe("analyzing");
  });

  it("runs automatically once a media set appears, after the debounce", async () => {
    render([photo("a")]);
    expect(analyzeMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
  });

  it("coalesces an upload burst into a single gateway call", async () => {
    const view = render([photo("a")]);
    view.rerender({ items: [photo("a"), photo("b")], persistedVisual: null });
    view.rerender({ items: [photo("a"), photo("b"), photo("c")], persistedVisual: null });
    view.rerender({ items: [photo("a"), photo("b"), photo("c"), photo("d")], persistedVisual: null });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
  });

  it("never re-pays for a media set a stored result already covers", async () => {
    render([photo("a")], okResult("stored cabinets"));
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS * 2);
    });
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("keeps prior facts when the provider fails, and does not auto-retry", async () => {
    analyzeMock.mockResolvedValueOnce(okResult("original cabinets"));
    const view = render([photo("a")]);
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(view.result.current.visual.observations).toHaveLength(1));

    analyzeMock.mockRejectedValue(new Error("gateway down"));
    view.rerender({ items: [photo("a"), photo("b")], persistedVisual: null });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(view.result.current.visual.status).toBe("provider_error"));
    /* Evidence survives the failure. */
    expect(view.result.current.visual.observations).toHaveLength(1);
    const callsAfterFailure = analyzeMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS * 3);
    });
    expect(analyzeMock).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("holds back auto-analysis until the durable record has loaded", async () => {
    renderHook(() =>
      useProjectUnderstanding(EMPTY_TEXT, [photo("a")], "", "", [], undefined, null, {
        autoAnalyze: true,
        ready: false,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(AUTO_ANALYSIS_DEBOUNCE_MS * 2);
    });
    expect(analyzeMock).not.toHaveBeenCalled();
  });
});
