import { useCallback, useEffect, useRef, useState } from "react";
import {
  isIntakeSource,
  isPhotoKind,
  type BallparkIntakeSource,
  type PhotoKind,
  type PhotoScaleObservation,
  type DurableBallparkSession,
} from "@/domains/ballpark";

/**
 * Everything the ballpark flow needs to survive a refresh, a phone lock or a
 * navigation away and back.
 *
 * The old page kept the chosen source, the uploaded photos and the "intake
 * finished" flag in component state. A remount — which a refresh, a route
 * change or even React's own reconciliation can cause — reset all three, which
 * is what dropped contractors back on "How are you estimating this job?" after
 * they had already finished the questionnaire. Stage is now an explicit,
 * persisted value: nothing infers "where am I" from transient state.
 */
export type BallparkStage =
  | "intake"
  | "review"
  | "questions"
  /** Editable assumptions review, shown before a range is produced. */
  | "assumptions"
  | "results";

export interface FlowPhoto {
  id: string;
  name: string;
  kind: PhotoKind;
  /** Object URL for the current tab only; never persisted. */
  url?: string;
}

export interface BallparkFlowState {
  version: 3;
  source: BallparkIntakeSource | null;
  stage: BallparkStage;
  photos: FlowPhoto[];
  observations: PhotoScaleObservation[];
  /** Corrections keyed by measurement: a number, or "confirm" to accept as-is. */
  corrections: Record<string, number | "confirm">;
  /**
   * The high-value question ids chosen for this session, frozen when the
   * contractor leaves the analysis summary. Frozen on purpose: recomputing it
   * from unanswered questions would make the interview shrink under the user's
   * feet as they answer.
   */
  clarifications: string[];
  description: string;
  updatedAt: string;
}

const STORAGE_PREFIX = "vwx.ballpark.flow.";

function emptyState(source: BallparkIntakeSource | null): BallparkFlowState {
  return {
    version: 3,
    source,
    stage: source === "onsite" ? "questions" : "intake",
    photos: [],
    observations: [],
    corrections: {},
    clarifications: [],
    description: "",
    updatedAt: new Date().toISOString(),
  };
}

function sanitize(raw: unknown, fallbackSource: BallparkIntakeSource | null): BallparkFlowState {
  const base = emptyState(fallbackSource);
  if (!raw || typeof raw !== "object") return base;
  const parsed = raw as Partial<BallparkFlowState>;
  if (parsed.version !== 3) return base;

  const source = isIntakeSource(parsed.source) ? parsed.source : base.source;
  const stage: BallparkStage =
    parsed.stage === "intake" ||
    parsed.stage === "review" ||
    parsed.stage === "questions" ||
    parsed.stage === "assumptions" ||
    parsed.stage === "results"
      ? parsed.stage
      : base.stage;

  return {
    version: 3,
    source,
    stage: source ? stage : "intake",
    photos: Array.isArray(parsed.photos)
      ? parsed.photos
          .filter((p): p is FlowPhoto => Boolean(p) && typeof p.id === "string")
          .map((p) => ({
            id: p.id,
            name: typeof p.name === "string" ? p.name : p.id,
            kind: isPhotoKind(p.kind) ? p.kind : "room_photo",
          }))
      : [],
    observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    corrections:
      parsed.corrections && typeof parsed.corrections === "object" ? parsed.corrections : {},
    clarifications: Array.isArray(parsed.clarifications)
      ? parsed.clarifications.filter((id): id is string => typeof id === "string")
      : [],
    description: typeof parsed.description === "string" ? parsed.description : "",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Persisted ballpark flow state, scoped to one project.
 *
 * Photo *files* cannot survive a refresh (object URLs die with the tab), but
 * their identity, kind and every derived answer do — so a refreshed contractor
 * lands exactly where they were, with the same assumptions, and is told which
 * previews need re-adding rather than silently losing their work.
 */
export function useBallparkFlow(
  projectId: string | null,
  initialSource: BallparkIntakeSource | null,
  estimateId?: string | null,
  serverSession?: DurableBallparkSession | null,
  waitForServer = false,
) {
  const [state, setState] = useState<BallparkFlowState>(() => emptyState(initialSource));
  const [hydrated, setHydrated] = useState(false);

  /*
   * Hydrate once per estimate, plus once more when the first server session
   * lands. Re-hydrating on every autosave response (each one is a fresh object
   * identity) used to overwrite live stage/answer navigation mid-interview.
   */
  const hydratedFor = useRef<string | null>(null);
  const hydrationKey = `${projectId ?? "none"}|${estimateId ?? "none"}|${initialSource ?? "none"}|${
    serverSession ? "server" : "local"
  }`;

  useEffect(() => {
    if (waitForServer) return;
    if (hydratedFor.current === hydrationKey) return;
    hydratedFor.current = hydrationKey;
    if (!projectId || typeof window === "undefined") {
      setState(emptyState(initialSource));
      setHydrated(true);
      return;
    }
    let next = emptyState(initialSource);
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${estimateId ?? projectId}`);
      if (raw) next = sanitize(JSON.parse(raw), initialSource);
    } catch {
      /* Private browsing: the flow still works, it just cannot resume. */
    }
    /* A source given in the URL wins over a stale stored one. */
    if (initialSource && next.source !== initialSource) next = emptyState(initialSource);
    if (serverSession) {
      next = {
        ...next,
        source: serverSession.intakeSource,
        stage: serverSession.currentStage,
        photos: (serverSession.photoReferences ?? []) as unknown as FlowPhoto[],
        observations: (serverSession.observations ?? []) as unknown as PhotoScaleObservation[],
        corrections: serverSession.corrections ?? {},
        clarifications: serverSession.clarifications ?? [],
        description: serverSession.description ?? "",
        updatedAt: serverSession.updatedAt,
      };
    }
    setState(next);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationKey, projectId, initialSource, estimateId, serverSession, waitForServer]);

  useEffect(() => {
    if (!hydrated || !projectId || typeof window === "undefined") return;
    try {
      const persisted: BallparkFlowState = {
        ...state,
        photos: state.photos.map(({ id, name, kind }) => ({ id, name, kind })),
      };
      window.localStorage.setItem(`${STORAGE_PREFIX}${estimateId ?? projectId}`, JSON.stringify(persisted));
    } catch {
      /* ignore */
    }
  }, [state, hydrated, projectId, estimateId]);

  const patch = useCallback((changes: Partial<BallparkFlowState>) => {
    setState((prev) => ({ ...prev, ...changes, updatedAt: new Date().toISOString() }));
  }, []);

  const setSource = useCallback(
    (source: BallparkIntakeSource) =>
      patch({ source, stage: source === "onsite" ? "questions" : "intake" }),
    [patch],
  );

  const setStage = useCallback((stage: BallparkStage) => patch({ stage }), [patch]);

  const reset = useCallback(() => {
    setState(emptyState(null));
    if (projectId && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${estimateId ?? projectId}`);
      } catch {
        /* ignore */
      }
    }
  }, [projectId, estimateId]);

  return { ...state, hydrated, patch, setSource, setStage, reset };
}
