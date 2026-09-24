import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  emptyVisualUnderstanding,
  fuseProjectUnderstanding,
  markVisualUnderstandingStale,
  type ProjectUnderstanding,
  type RemoteVisionMedia,
  type VisionAnalysisResult,
  type VisualEvidenceKind,
  type VisualUnderstandingResult,
} from "@/domains/remoteVision";
import type { ConfirmedRunMeasurement } from "@/domains/scopeGrounding";
import { analyzeProjectMedia } from "../services/visionUnderstanding.functions";

/** Media kind -> the evidence class the fusion layer reasons about. */
function evidenceKind(kind: RemoteVisionMedia["kind"]): VisualEvidenceKind {
  return kind === "walkthrough_video" ? "video_keyframe" : kind;
}

interface VisionImagePayload {
  id: string;
  kind: VisualEvidenceKind;
  dataUrl?: string;
  storagePath?: string;
  mimeType?: string;
}

/**
 * Analyzable images for the current project only.
 *
 * A durable photo carries NO preview data URL — only a `storagePath` — so it
 * used to be filtered out here and never analyzed. Storage-backed items are
 * now passed through and inlined server-side; keyframes and any in-flight
 * data-URL preview keep the direct path.
 */
export function buildImages(media: RemoteVisionMedia[]): VisionImagePayload[] {
  const out: VisionImagePayload[] = [];
  for (const item of media) {
    if (item.kind === "walkthrough_video") {
      for (const [index, frame] of (item.keyframePreviews ?? []).entries()) {
        if (frame?.startsWith("data:image/")) {
          out.push({ id: `${item.id}#frame-${index}`, kind: "video_keyframe", dataUrl: frame });
        }
      }
      continue;
    }
    if (item.previewUrl?.startsWith("data:image/")) {
      out.push({ id: item.id, kind: evidenceKind(item.kind), dataUrl: item.previewUrl });
      continue;
    }
    /* Persisted photo: the server signs and downloads these bytes. */
    if (item.storagePath && item.uploadState === "uploaded") {
      out.push({
        id: item.id,
        kind: evidenceKind(item.kind),
        storagePath: item.storagePath,
        mimeType: item.mimeType ?? undefined,
      });
    }
  }
  return out;
}


/** Coalesce an upload burst into ONE gateway call. */
export const AUTO_ANALYSIS_DEBOUNCE_MS = 2_500;
/** Hard ceiling on automatic runs per mounted session, so nothing can fan out. */
export const AUTO_ANALYSIS_MAX_RUNS = 3;

export interface ProjectUnderstandingOptions {
  /** Run analysis automatically when the media set changes. */
  autoAnalyze?: boolean;
  /**
   * True once the durable understanding record has loaded. Until then we
   * cannot tell whether a stored result already covers this media set, so
   * auto-analysis is held back rather than paying for a duplicate run.
   */
  ready?: boolean;
  /** Required to read storage-backed photos: it scopes the signed read. */
  projectId?: string | null;
}

/**
 * Fuses the deterministic text analysis with REAL multimodal analysis of the
 * project's own media, and exposes one provenance-carrying understanding.
 *
 * Phase 1 behaviour:
 *  - analysis runs AUTOMATICALLY when the media set changes (debounced, one
 *    call per distinct media fingerprint, capped per session);
 *  - a change never blanks prior visual facts: they are kept and flagged
 *    `stale` while the new run is in flight, and replaced only on success;
 *  - a provider error keeps the previous facts too, and never auto-retries.
 */
export function useProjectUnderstanding(
  textResult: VisionAnalysisResult,
  media: RemoteVisionMedia[],
  transcript: string,
  measurementFacts: string,
  confirmedMeasurements: ConfirmedRunMeasurement[],
  onVisualResult?: (result: VisualUnderstandingResult) => void | Promise<void>,
  persistedVisual?: VisualUnderstandingResult | null,
  options?: ProjectUnderstandingOptions,
) {
  const analyze = useServerFn(analyzeProjectMedia);
  const [visual, setVisual] = useState<VisualUnderstandingResult>(() =>
    emptyVisualUnderstanding("no_media"),
  );
  const [analyzing, setAnalyzing] = useState(false);

  const images = useMemo(() => buildImages(media), [media]);
  const signature = images.map((i) => i.id).sort().join("|");
  const imageCount = images.length;

  /* Latest inputs, read at call time so they never retrigger the scheduler. */
  const projectId = options?.projectId ?? null;
  const latest = useRef({ analyze, images, transcript, measurementFacts, onVisualResult, projectId });
  latest.current = { analyze, images, transcript, measurementFacts, onVisualResult, projectId };

  /* Media set the in-memory result belongs to, and in-flight bookkeeping. */
  const resultSignature = useRef<string | null>(null);
  const runningSignature = useRef<string | null>(null);
  const attemptedSignature = useRef<string | null>(null);
  const autoRuns = useRef(0);

  /*
   * Media changed. NEVER blank what we already know: hydrate a matching stored
   * result, or keep the previous facts and mark them stale until a fresh run
   * lands. The old behaviour wiped observations here and nothing re-ran.
   */
  useEffect(() => {
    if (resultSignature.current === signature) return;
    if (persistedVisual) {
      /*
       * Only a SUCCESSFUL stored result closes out this media set. A stored
       * provider error used to claim the signature too, which permanently
       * suppressed the retry for that project.
       */
      if (persistedVisual.status === "ok") resultSignature.current = signature;
      setVisual(persistedVisual);
      return;
    }
    setVisual((previous) =>
      imageCount === 0
        ? emptyVisualUnderstanding("no_media")
        : markVisualUnderstandingStale(previous),
    );
  }, [signature, imageCount, persistedVisual]);

  const runVisualAnalysis = useCallback(async () => {
    const current = latest.current;
    if (current.images.length === 0) return;
    const runSignature = current.images.map((i) => i.id).sort().join("|");
    if (runningSignature.current === runSignature) return;
    runningSignature.current = runSignature;
    setAnalyzing(true);
    setVisual((previous) => markVisualUnderstandingStale(previous));
    try {
      const result = await current.analyze({
        data: {
          projectId: current.projectId,
          images: current.images,
          transcript: current.transcript,
          measurementFacts: current.measurementFacts,
        },
      });
      /* A slower earlier run must never overwrite a newer media set. */
      const stillCurrent = runSignature === latest.current.images.map((i) => i.id).sort().join("|");
      if (!stillCurrent) return;
      resultSignature.current = runSignature;
      setVisual(result);
      try {
        await current.onVisualResult?.(result);
      } catch {
        /* Persistence failure must not hide a successful visual analysis. */
      }
    } catch {
      /* Keep prior facts; surface the failure without erasing evidence. */
      setVisual((previous) => ({
        ...previous,
        status: "provider_error",
        errorCode: "call_failed",
        stale: previous.observations.length > 0,
      }));
    } finally {
      if (runningSignature.current === runSignature) runningSignature.current = null;
      setAnalyzing(false);
    }
  }, []);

  /* Auto-trigger: one debounced call per NEW media fingerprint. */
  const autoAnalyze = options?.autoAnalyze ?? false;
  const ready = options?.ready ?? false;
  useEffect(() => {
    if (!autoAnalyze || !ready) return;
    if (imageCount === 0) return;
    /* A stored result already covers this media set — re-running costs money. */
    if (persistedVisual && persistedVisual.status === "ok") return;
    if (resultSignature.current === signature) return;
    if (attemptedSignature.current === signature) return;
    if (autoRuns.current >= AUTO_ANALYSIS_MAX_RUNS) return;
    const timer = setTimeout(() => {
      attemptedSignature.current = signature;
      autoRuns.current += 1;
      void runVisualAnalysis();
    }, AUTO_ANALYSIS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [autoAnalyze, ready, imageCount, signature, persistedVisual, runVisualAnalysis]);

  const understanding: ProjectUnderstanding = useMemo(
    () => fuseProjectUnderstanding({ textResult, visual, confirmedMeasurements }),
    [textResult, visual, confirmedMeasurements],
  );

  return {
    understanding,
    visual,
    analyzing,
    /** Facts on screen describe an earlier media set. */
    stale: Boolean(visual.stale),
    canAnalyzeVisually: imageCount > 0,
    imageCount,
    runVisualAnalysis,
  };
}
