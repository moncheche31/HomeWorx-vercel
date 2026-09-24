import { useCallback, useEffect, useState } from "react";
import type { VoiceCaptureSessionSnapshot } from "@/domains/voiceCapture";

const KEY = "vwx.voice.session";

/** Offline resilience: keep the partial transcript so a walkthrough can resume. */
export function useVoiceSessionStore(projectId: string | undefined) {
  const [restored, setRestored] = useState<VoiceCaptureSessionSnapshot | null>(null);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`${KEY}.${projectId}`);
      setRestored(raw ? (JSON.parse(raw) as VoiceCaptureSessionSnapshot) : null);
    } catch {
      setRestored(null);
    }
  }, [projectId]);

  const save = useCallback(
    (transcript: string) => {
      if (!projectId || typeof window === "undefined") return;
      try {
        if (!transcript.trim()) {
          window.localStorage.removeItem(`${KEY}.${projectId}`);
          return;
        }
        const snapshot: VoiceCaptureSessionSnapshot = {
          projectId,
          transcript,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(`${KEY}.${projectId}`, JSON.stringify(snapshot));
      } catch {
        /* storage unavailable — capture still works in-memory */
      }
    },
    [projectId],
  );

  const clear = useCallback(() => {
    if (!projectId || typeof window === "undefined") return;
    window.localStorage.removeItem(`${KEY}.${projectId}`);
    setRestored(null);
  }, [projectId]);

  return { restored, save, clear };
}
