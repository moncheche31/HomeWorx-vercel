/**
 * ESTIMATOR READING of the current project's narration.
 *
 * Runs alongside the deterministic recognizer, never instead of it: while the
 * reading is loading (or if it fails) the app behaves exactly as before, and
 * the reading only ever adds scope the recognizer missed or proposes work the
 * contractor must approve.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readNarrationAsEstimatorFn } from "@/features/estimating/services/narrationEstimator.functions";
import type { EstimatorReading } from "@/features/estimating/services/narrationEstimator.shared";

export interface EstimatorReadingImage {
  id: string;
  kind: "before_photo" | "after_rendering" | "floor_plan" | "video_keyframe";
  dataUrl: string;
}

export interface UseEstimatorReadingResult {
  reading: EstimatorReading | null;
  isLoading: boolean;
  error: string | null;
}

export function useEstimatorReading(
  narration: string,
  measurementFacts: string,
  recognizedWork: string[],
  images: EstimatorReadingImage[] = [],
): UseEstimatorReadingResult {
  const run = useServerFn(readNarrationAsEstimatorFn);
  const trimmed = narration.trim();

  const query = useQuery({
    queryKey: ["estimator-reading", trimmed, measurementFacts, images.map((i) => i.id).join(",")],
    enabled: trimmed.length > 20,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () =>
      run({
        data: {
          narration: trimmed,
          measurementFacts,
          recognizedWork: recognizedWork.slice(0, 60),
          images: images.slice(0, 8),
        },
      }),
  });

  return {
    reading: query.data?.reading ?? null,
    isLoading: query.isLoading,
    error: query.data?.error ?? (query.error ? "request_failed" : null),
  };
}
