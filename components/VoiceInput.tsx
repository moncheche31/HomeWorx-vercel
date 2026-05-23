"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { Language } from "@/types";

interface Props {
  lang: Language;
  onTranscript: (text: string) => void;
  tapToSpeak: string;
  listening: string;
  stopListening: string;
}

export default function VoiceInput({ lang, onTranscript, tapToSpeak, listening, stopListening }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef("");

  useEffect(() => {
    const SR = (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
      .SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
      .webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === "es" ? "es-US" : "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript + " ";
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
      if (accumulatedRef.current) {
        onTranscript(accumulatedRef.current.trim());
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setIsListening(false);
        setInterim("");
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterim("");
    };

    recognitionRef.current = rec;

    return () => {
      rec.abort();
    };
  }, [lang, onTranscript]);

  const toggleListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;

    if (isListening) {
      rec.stop();
      setIsListening(false);
    } else {
      accumulatedRef.current = "";
      setInterim("");
      try {
        rec.start();
        setIsListening(true);
      } catch {
        // Already started
      }
    }
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
        <AlertCircle size={18} className="flex-shrink-0" />
        <span>
          {lang === "es"
            ? "El reconocimiento de voz no está disponible en este navegador. Por favor, usa Chrome."
            : "Voice input is not available in this browser. Please use Chrome."}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mic button */}
      <div className="relative flex items-center justify-center">
        {isListening && (
          <>
            <span className="absolute w-28 h-28 rounded-full bg-red-400 opacity-30 pulse-ring" />
            <span className="absolute w-24 h-24 rounded-full bg-red-400 opacity-20 pulse-ring" style={{ animationDelay: "0.3s" }} />
          </>
        )}
        <button
          onClick={toggleListening}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 ${
            isListening
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-blue-700 hover:bg-blue-800 text-white"
          }`}
          aria-label={isListening ? stopListening : tapToSpeak}
        >
          {isListening ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
      </div>

      <p className={`text-sm font-semibold ${isListening ? "text-red-500" : "text-slate-500"}`}>
        {isListening ? listening : tapToSpeak}
      </p>

      {/* Live transcript preview */}
      {isListening && interim && (
        <div className="w-full p-3 bg-slate-100 rounded-xl text-sm text-slate-600 italic min-h-[40px]">
          {interim}
        </div>
      )}
    </div>
  );
}
