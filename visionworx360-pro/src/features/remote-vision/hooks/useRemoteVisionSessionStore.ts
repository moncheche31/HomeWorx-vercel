import { useCallback, useEffect, useState } from "react";
import type {
  EstimateLevel,
  RemoteVisionDimensions,
  RemoteVisionMedia,
  RemoteVisionSession,
} from "@/domains/remoteVision";

const KEY = "vwx.remoteVision.session";

function emptySession(projectId: string | null): RemoteVisionSession {
  return {
    projectId,
    projectName: "",
    description: "",
    media: [],
    voiceTranscript: "",
    typedNotes: "",
    dimensions: [],
    assumptionOverrides: {},
    answers: {},
    editedNarrative: null,
    approvedNarrative: null,
    approvedAt: null,
    selectedLevel: "mid_range",
    removedFeatureKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Local-first persistence (same approach as Modules 009/010B): no schema
 * changes, and the contractor can close the app mid-session without losing
 * uploads metadata, description, assumptions or answers.
 */
export function useRemoteVisionSessionStore(projectId: string | null) {
  /* Unlinked capture is memory-only. A shared `unlinked` localStorage bucket
     allowed one project/account's intake to hydrate into the next one. */
  const storageKey = projectId ? `${KEY}.${projectId}` : null;
  const [session, setSession] = useState<RemoteVisionSession>(() => emptySession(projectId));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!storageKey) {
        setSession(emptySession(null));
        setHydrated(true);
        return;
      }
      const raw = window.localStorage.getItem(storageKey);
      // Object URLs from a previous visit are dead — keep metadata, drop previews.
      const parsed = raw ? (JSON.parse(raw) as RemoteVisionSession) : emptySession(projectId);
      setSession({
        ...emptySession(projectId),
        ...parsed,
        voiceTranscript: parsed.voiceTranscript ?? "",
        typedNotes: parsed.typedNotes ?? "",
        dimensions: parsed.dimensions ?? [],
        media: (parsed.media ?? []).map((m) => ({
          ...m,
          previewUrl: null,
          keyframePreviews: [],
        })),
      });
    } catch {
      setSession(emptySession(projectId));
    }
    setHydrated(true);
  }, [storageKey, projectId]);

  const persist = useCallback(
    (next: RemoteVisionSession) => {
      setSession(next);
      if (typeof window === "undefined" || !storageKey) return;
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            ...next,
            // Object URLs and frame data URLs are per-session; keep metadata only.
            media: next.media.map((m) => ({ ...m, previewUrl: null, keyframePreviews: [] })),
          }),
        );
      } catch {
        /* storage unavailable — the session still works in memory */
      }
    },
    [storageKey],
  );

  const update = useCallback(
    (patch: Partial<RemoteVisionSession>) =>
      persist({ ...session, ...patch, updatedAt: new Date().toISOString() }),
    [persist, session],
  );

  const addMedia = useCallback(
    (media: RemoteVisionMedia[]) => update({ media: [...session.media, ...media] }),
    [update, session.media],
  );

  const removeMedia = useCallback(
    (id: string) => update({ media: session.media.filter((m) => m.id !== id) }),
    [update, session.media],
  );

  const updateMedia = useCallback(
    (id: string, patch: Partial<RemoteVisionMedia>) =>
      update({ media: session.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
    [update, session.media],
  );

  const setDimensions = useCallback(
    (dimensions: RemoteVisionDimensions[]) => update({ dimensions }),
    [update],
  );

  const setLevel = useCallback((level: EstimateLevel) => update({ selectedLevel: level }), [update]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined" && storageKey) window.localStorage.removeItem(storageKey);
    setSession(emptySession(projectId));
  }, [projectId, storageKey]);

  return {
    session,
    hydrated,
    update,
    addMedia,
    removeMedia,
    updateMedia,
    setDimensions,
    setLevel,
    reset,
  };
}
