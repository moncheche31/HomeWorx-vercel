"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, AlertCircle } from "lucide-react";
import { Language } from "@/types";

interface Props {
  lang: Language;
  onTranscript: (text: string) => void;
  tapToSpeak: string;
  listening: string;
  stopListening: string;
}

const MAX_SECONDS = 60; // hard stop after 60 seconds

export default function VoiceInput({ lang, onTranscript, tapToSpeak, listening, stopListening }: Props) {
  const [isListening, setIsListening]   = useState(false);
  const [interim, setInterim]           = useState("");
  const [supported, setSupported]       = useState<boolean | null>(null);
  const [seconds, setSeconds]           = useState(0);

  const activeRef      = useRef(false);   // true while user wants to listen
  const accumulatedRef = useRef("");
  const recRef         = useRef<SpeechRecognition | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef       = useRef(0);

  // Check support once on mount
  useEffect(() => {
    const SR = getSR();
    setSupported(!!SR);
  }, []);

  const stopEverything = useCallback(() => {
    activeRef.current = false;
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* ignore */ }
      recRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    countRef.current = 0;
    setIsListening(false);
    setInterim("");
    setSeconds(0);
  }, []);

  const startSession = useCallback(() => {
    const SR = getSR();
    if (!SR || !activeRef.current) return;

    // Always create a fresh instance — reusing causes iOS freeze
    const rec = new SR();
    rec.continuous      = false;   // false = iOS-safe
    rec.interimResults  = true;
    rec.lang            = lang === "es" ? "es-US" : "en-US";
    rec.maxAlternatives = 1;
    recRef.current      = rec;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript + " ";
          onTranscript(accumulatedRef.current.trim());
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" just means silence — restart silently
      if (event.error === "no-speech") {
        rec.abort();
        return;
      }
      // Any other error — give up cleanly
      stopEverything();
    };

    rec.onend = () => {
      setInterim("");
      // If user hasn't stopped, restart automatically
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) startSession();
        }, 150);
      }
    };

    try {
      rec.start();
    } catch {
      // If start() throws (e.g. already running), back off and retry
      setTimeout(() => {
        if (activeRef.current) startSession();
      }, 300);
    }
  }, [lang, onTranscript, stopEverything]);

  const startListening = useCallback(() => {
    activeRef.current    = true;
    accumulatedRef.current = "";
    countRef.current     = 0;
    setIsListening(true);
    setInterim("");
    setSeconds(0);

    // Countdown timer + hard timeout
    timerRef.current = setInterval(() => {
      countRef.current += 1;
      setSeconds(countRef.current);
      if (countRef.current >= MAX_SECONDS) {
        stopEverything();
      }
    }, 1000);

    startSession();
  }, [startSession, stopEverything]);

  const handleToggle = () => {
    if (isListening) {
      stopEverything();
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => () => stopEverything(), [stopEverything]);

  if (supported === null) return null; // loading

  if (!supported) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
        <AlertCircle size={18} className="flex-shrink-0" />
        <span>
          {lang === "es"
            ? "Reconocimiento de voz no disponible. Usa Chrome o escribe abajo."
            : "Voice input not available in this browser. Use Chrome or type below."}
        </span>
      </div>
    );
  }

  const remaining = MAX_SECONDS - seconds;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mic button */}
      <div className="relative flex items-center justify-center">
        {isListening && (
          <>
            <span className="absolute w-28 h-28 rounded-full bg-red-400 opacity-30 pulse-ring" />
            <span className="absolute w-24 h-24 rounded-full bg-red-400 opacity-20 pulse-ring"
                  style={{ animationDelay: "0.3s" }} />
          </>
        )}
        <button
          onClick={handleToggle}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 ${
            isListening
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-blue-700 hover:bg-blue-800 text-white"
          }`}
          aria-label={isListening ? stopListening : tapToSpeak}
        >
          {isListening ? <Square size={28} fill="white" /> : <Mic size={32} />}
        </button>
      </div>

      {/* Label + timer */}
      <p className={`text-sm font-semibold ${isListening ? "text-red-500" : "text-slate-500"}`}>
        {isListening ? `${listening} (${remaining}s)` : tapToSpeak}
      </p>

      {/* Always-visible STOP button while listening — extra escape hatch */}
      {isListening && (
        <button
          onClick={stopEverything}
          className="px-6 py-2 rounded-xl bg-red-100 text-red-600 font-semibold text-sm border border-red-300 active:bg-red-200"
        >
          {stopListening}
        </button>
      )}

      {/* Live transcript preview */}
      {isListening && interim && (
        <div className="w-full p-3 bg-slate-100 rounded-xl text-sm text-slate-600 italic">
          {interim}
        </div>
      )}
    </div>
  );
}

function getSR(): typeof SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  return (
    (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
    (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition ??
    null
  );
}
