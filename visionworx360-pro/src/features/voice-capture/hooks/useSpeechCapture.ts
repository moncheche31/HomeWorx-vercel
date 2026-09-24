import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper around the browser Web Speech API. No external AI services.
 * Falls back to manual transcript editing when recognition is unavailable.
 */

type RecognitionStatus =
  | "idle"
  | "listening"
  | "paused"
  | "unsupported"
  | "permission_denied"
  | "error";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export interface UseSpeechCaptureOptions {
  lang: string;
  onFinalSegment?: (text: string) => void;
}

export function useSpeechCapture({ lang, onFinalSegment }: UseSpeechCaptureOptions) {
  const [status, setStatus] = useState<RecognitionStatus>("idle");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);
  const finalRef = useRef(onFinalSegment);
  finalRef.current = onFinalSegment;

  useEffect(() => {
    const ok = getRecognitionCtor() !== null;
    setSupported(ok);
    if (!ok) setStatus("unsupported");
  }, []);

  const build = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? "").trim();
        if (!text) continue;
        if (result.isFinal) finalRef.current?.(text);
        else live += ` ${text}`;
      }
      setInterim(live.trim());
    };
    rec.onerror = (event: any) => {
      const code = String(event?.error ?? "");
      if (code === "not-allowed" || code === "service-not-allowed") {
        shouldRunRef.current = false;
        setStatus("permission_denied");
      } else if (code !== "no-speech" && code !== "aborted") {
        setStatus("error");
      }
    };
    rec.onend = () => {
      setInterim("");
      // Browsers stop recognition on silence; restart while the user is recording.
      if (shouldRunRef.current) {
        try {
          rec.start();
        } catch {
          setStatus("error");
        }
      }
    };
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current ?? build();
    if (!rec) {
      setStatus("unsupported");
      return;
    }
    recognitionRef.current = rec;
    shouldRunRef.current = true;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      setStatus("listening");
    }
  }, [build]);

  const pause = useCallback(() => {
    shouldRunRef.current = false;
    recognitionRef.current?.stop();
    setStatus("paused");
    setInterim("");
  }, []);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatus("idle");
    setInterim("");
  }, []);

  useEffect(
    () => () => {
      shouldRunRef.current = false;
      recognitionRef.current?.abort();
    },
    [],
  );

  return { status, interim, supported, start, pause, stop };
}
