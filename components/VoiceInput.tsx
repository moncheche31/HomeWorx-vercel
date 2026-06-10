"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { Language } from "@/types";

interface Props {
  lang: Language;
  onTranscript: (text: string) => void;
  tapToSpeak: string;
  listening: string;
  stopListening: string;
}

type RecordingMode = "whisper" | "webspeech" | "unavailable";
type UIState = "idle" | "recording" | "transcribing" | "done" | "error";

export default function VoiceInput({ lang, onTranscript, tapToSpeak, listening, stopListening }: Props) {
  const [mode, setMode]       = useState<RecordingMode | null>(null); // null = detecting
  const [uiState, setUiState] = useState<UIState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // MediaRecorder state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const mimeTypeRef      = useRef<string>("audio/webm");

  // Web Speech fallback state
  const speechRecRef  = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef("");
  const activeRef      = useRef(false);

  // Timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);

  // ── Capability detection ────────────────────────────────────────────────
  useEffect(() => {
    const hasMediaRecorder =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    const hasSpeechRecognition =
      typeof window !== "undefined" &&
      !!(
        (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition ??
        (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
      );

    if (hasMediaRecorder) {
      setMode("whisper");
    } else if (hasSpeechRecognition) {
      setMode("webspeech");
    } else {
      setMode("unavailable");
    }
  }, []);

  // ── Timer helpers ───────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    countRef.current = 0;
    timerRef.current = setInterval(() => {
      countRef.current += 1;
      setSeconds(countRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    countRef.current = 0;
    setSeconds(0);
  }, []);

  // ── Whisper (MediaRecorder) mode ────────────────────────────────────────
  const handleWhisperStop = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];
    stopTimer();

    if (blob.size < 500) {
      setUiState("idle");
      return;
    }

    setUiState("transcribing");

    try {
      const ext = mimeTypeRef.current.includes("mp4") ? ".mp4" : ".webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording${ext}`);
      formData.append("language", lang);

      const res = await fetch("/api/transcribe", { method: "POST", body: formData });

      if (!res.ok) {
        // Whisper endpoint unavailable — fall back to WebSpeech if possible
        const hasSR = !!(
          (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition ??
          (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
        );
        if (hasSR) {
          setMode("webspeech");
          setUiState("idle");
          setErrorMsg(
            lang === "es"
              ? "Whisper no disponible. Cambiando a reconocimiento de voz del navegador."
              : "Whisper unavailable. Switched to browser voice recognition.",
          );
        } else {
          setUiState("error");
          setErrorMsg(
            lang === "es"
              ? "No se pudo transcribir. Por favor escribe tu descripción abajo."
              : "Could not transcribe. Please type your description below.",
          );
        }
        return;
      }

      const data = await res.json();
      if (data.transcript) {
        onTranscript(data.transcript.trim());
        setUiState("done");
        setTimeout(() => setUiState("idle"), 2500);
      } else {
        setUiState("idle");
      }
    } catch {
      setUiState("error");
      setErrorMsg(
        lang === "es"
          ? "Error de red. Por favor escribe tu descripción abajo."
          : "Network error. Please type your description below.",
      );
    }
  }, [lang, onTranscript, stopTimer]);

  const startWhisper = useCallback(async () => {
    setErrorMsg("");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleWhisperStop;

      recorder.start(250); // collect chunks every 250 ms
      setUiState("recording");
      startTimer();
    } catch {
      setUiState("error");
      setErrorMsg(
        lang === "es"
          ? "No se pudo acceder al micrófono. Verifica los permisos."
          : "Could not access microphone. Please check your permissions.",
      );
    }
  }, [handleWhisperStop, lang, startTimer]);

  const stopWhisper = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop(); // triggers onstop → handleWhisperStop
    }
  }, []);

  // ── Web Speech API fallback mode ────────────────────────────────────────
  const getSR = (): typeof SpeechRecognition | null => {
    if (typeof window === "undefined") return null;
    return (
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition ??
      null
    );
  };

  const startSpeechSession = useCallback(() => {
    const SR = getSR();
    if (!SR || !activeRef.current) return;

    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = lang === "es" ? "es-US" : "en-US";
    speechRecRef.current = rec;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript + " ";
          onTranscript(accumulatedRef.current.trim());
        }
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") stopSpeech();
    };

    rec.onend = () => {
      if (activeRef.current) {
        setTimeout(() => { if (activeRef.current) startSpeechSession(); }, 150);
      }
    };

    try { rec.start(); } catch { setTimeout(() => { if (activeRef.current) startSpeechSession(); }, 300); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, onTranscript]);

  const startSpeech = useCallback(() => {
    activeRef.current = true;
    accumulatedRef.current = "";
    setUiState("recording");
    setErrorMsg("");
    startTimer();
    startSpeechSession();
  }, [startSpeechSession, startTimer]);

  const stopSpeech = useCallback(() => {
    activeRef.current = false;
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch { /* ignore */ }
      speechRecRef.current = null;
    }
    stopTimer();
    setUiState("idle");
  }, [stopTimer]);

  // ── Toggle handler ──────────────────────────────────────────────────────
  const handleToggle = () => {
    if (uiState === "recording") {
      if (mode === "whisper") stopWhisper();
      else stopSpeech();
    } else if (uiState === "idle" || uiState === "error" || uiState === "done") {
      if (mode === "whisper") startWhisper();
      else if (mode === "webspeech") startSpeech();
    }
  };

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopWhisper();
      stopSpeech();
    },
    [stopWhisper, stopSpeech],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  if (mode === null) return null; // still detecting

  if (mode === "unavailable") {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
        <AlertCircle size={18} className="flex-shrink-0" />
        <span>
          {lang === "es"
            ? "Entrada de voz no disponible en este navegador. Escribe tu descripción abajo."
            : "Voice input not available in this browser. Please type your description below."}
        </span>
      </div>
    );
  }

  const isRecording    = uiState === "recording";
  const isTranscribing = uiState === "transcribing";
  const isDone         = uiState === "done";
  const isDisabled     = isTranscribing;

  const statusLabel = isRecording
    ? `${listening} (${seconds}s)`
    : isTranscribing
    ? (lang === "es" ? "Transcribiendo con IA..." : "Transcribing with AI...")
    : isDone
    ? (lang === "es" ? "¡Transcripción completa!" : "Transcription complete!")
    : tapToSpeak;

  const modeTag = mode === "whisper"
    ? (lang === "es" ? "Whisper AI" : "Whisper AI")
    : (lang === "es" ? "Navegador" : "Browser");

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mode badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200">
        <div className={`w-1.5 h-1.5 rounded-full ${mode === "whisper" ? "bg-accent-500" : "bg-slate-400"}`} />
        <span className="text-xs font-medium text-brand-700">{modeTag}</span>
      </div>

      {/* Mic button */}
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <>
            <span className="absolute w-28 h-28 rounded-full bg-red-400 opacity-30 pulse-ring" />
            <span
              className="absolute w-24 h-24 rounded-full bg-red-400 opacity-20 pulse-ring"
              style={{ animationDelay: "0.3s" }}
            />
          </>
        )}
        <button
          onClick={handleToggle}
          disabled={isDisabled}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white"
              : isTranscribing
              ? "bg-brand-300 text-white cursor-not-allowed"
              : isDone
              ? "bg-accent-500 text-white"
              : "bg-brand-700 hover:bg-brand-800 text-white"
          }`}
          aria-label={isRecording ? stopListening : tapToSpeak}
        >
          {isTranscribing ? (
            <Loader2 size={28} className="animate-spin" />
          ) : isRecording ? (
            <Square size={28} fill="white" />
          ) : isDone ? (
            <CheckCircle size={32} />
          ) : (
            <Mic size={32} />
          )}
        </button>
      </div>

      {/* Status label */}
      <p
        className={`text-sm font-semibold text-center ${
          isRecording
            ? "text-red-500"
            : isTranscribing
            ? "text-brand-600"
            : isDone
            ? "text-accent-600"
            : "text-slate-500"
        }`}
      >
        {statusLabel}
      </p>

      {/* Stop button while recording */}
      {isRecording && (
        <button
          onClick={handleToggle}
          className="px-6 py-2 rounded-xl bg-red-100 text-red-600 font-semibold text-sm border border-red-300 active:bg-red-200"
        >
          {stopListening}
        </button>
      )}

      {/* Error / info message */}
      {(uiState === "error" || errorMsg) && (
        <div className="w-full flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
