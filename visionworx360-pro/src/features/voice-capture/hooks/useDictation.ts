import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechCapture } from "./useSpeechCapture";

export type DictationMode = "speech" | "recorder";
export type DictationStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "paused"
  | "stopping"
  | "transcribing"
  | "success"
  | "permission_denied"
  | "unsupported"
  | "error";

export type DictationErrorCode =
  | "permission_denied"
  | "no_microphone"
  | "insecure_context"
  | "unsupported"
  | "empty"
  | "no_audio"
  | "network_failed"
  | "transcription_unavailable"
  | "unsupported_audio"
  | "audio_too_large"
  | "transcription_failed"
  | "recorder_failed";

export interface UseDictationOptions {
  lang: string;
  onFinalSegment: (text: string) => void;
}

// Reject header-only blobs without discarding short, valid utterances such as
// "yes" or "94 inches", which Opus can encode well below 2 KB.
const MIN_CLIP_BYTES = 512;
const AUDIO_ACTIVITY_FLOOR = 0.012;
const ACCEPTED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
]);
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function baseMime(type: string): string {
  return type.toLowerCase().split(";")[0].trim();
}

function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return undefined;
  const supported = window.MediaRecorder.isTypeSupported;
  if (typeof supported !== "function") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => {
    try {
      return supported.call(window.MediaRecorder, type);
    } catch {
      return false;
    }
  });
}

function extensionFor(mimeType: string): string {
  const type = baseMime(mimeType);
  if (type === "audio/mp4") return "m4a";
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/wav" || type === "audio/wave") return "wav";
  return "webm";
}

function hasGetUserMedia(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function hasMediaRecorder(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

function mapGetUserMediaError(error: unknown): DictationErrorCode {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "permission_denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no_microphone";
  return "recorder_failed";
}

function mapTranscriptionError(status: number, error?: string): DictationErrorCode {
  if (error === "empty_audio") return "empty";
  if (error === "unsupported_audio") return "unsupported_audio";
  if (error === "audio_too_large" || status === 413) return "audio_too_large";
  if (error === "transcription_unavailable" || status === 503) return "transcription_unavailable";
  return "transcription_failed";
}

export function useDictation({ lang, onFinalSegment }: UseDictationOptions) {
  const [phase, setPhase] = useState<DictationStatus>("idle");
  const [mode, setMode] = useState<DictationMode>("recorder");
  const [errorCode, setErrorCode] = useState<DictationErrorCode | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechActive, setSpeechActive] = useState(false);
  const [hasRetryableAudio, setHasRetryableAudio] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const retainedBlobRef = useRef<Blob | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const startedAtRef = useRef(0);
  const peakLevelRef = useRef(0);
  const meterObservedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const finalRef = useRef(onFinalSegment);
  finalRef.current = onFinalSegment;

  const speech = useSpeechCapture({ lang, onFinalSegment: (text) => finalRef.current(text) });
  const recorderSupported = hasGetUserMedia() && hasMediaRecorder();
  const supported = recorderSupported || speech.supported || hasGetUserMedia();

  const stopTimerAndMeter = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (animationRef.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    setAudioLevel(0);
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const releaseCapture = useCallback(() => {
    stopTimerAndMeter();
    stopTracks();
  }, [stopTimerAndMeter, stopTracks]);

  const beginMeter = useCallback((stream: MediaStream) => {
    startedAtRef.current = Date.now();
    peakLevelRef.current = 0;
    meterObservedRef.current = false;
    setElapsedMs(0);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);

    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor || typeof requestAnimationFrame !== "function") return;
    try {
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = context;
      const sample = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        meterObservedRef.current = true;
        peakLevelRef.current = Math.max(peakLevelRef.current, rms);
        setAudioLevel(Math.min(1, rms * 8));
        animationRef.current = requestAnimationFrame(sample);
      };
      sample();
    } catch {
      // Recording remains usable when browser audio analysis is unavailable.
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob, attempt = attemptRef.current) => {
    const type = baseMime(blob.type);
    if (blob.size < MIN_CLIP_BYTES) {
      setPhase("error");
      setErrorCode("empty");
      setHasRetryableAudio(false);
      retainedBlobRef.current = null;
      return;
    }
    if (!ACCEPTED_MIME_TYPES.has(type)) {
      setPhase("error");
      setErrorCode("unsupported_audio");
      setHasRetryableAudio(false);
      retainedBlobRef.current = null;
      return;
    }

    retainedBlobRef.current = blob;
    setHasRetryableAudio(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("transcribing");
    setErrorCode(null);
    try {
      const form = new FormData();
      const filename = `recording-${attempt}-${Date.now()}.${extensionFor(type)}`;
      form.append("audio", blob, filename);
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
      if (attempt !== attemptRef.current || controller.signal.aborted) return;
      if (!response.ok) {
        setPhase("error");
        setErrorCode(mapTranscriptionError(response.status, payload.error));
        return;
      }
      const text = (payload.text ?? "").trim();
      if (!text) {
        setPhase("error");
        setErrorCode("no_audio");
        return;
      }
      finalRef.current(text);
      retainedBlobRef.current = null;
      setHasRetryableAudio(false);
      setPhase("success");
      setErrorCode(null);
    } catch (error) {
      if (attempt !== attemptRef.current || controller.signal.aborted) return;
      setPhase("error");
      setErrorCode(error instanceof TypeError ? "network_failed" : "transcription_failed");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const startRecorderWith = useCallback((stream: MediaStream, attempt: number) => {
    streamRef.current = stream;
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      const mimeType = pickMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      releaseCapture();
      setPhase("error");
      setErrorCode("recorder_failed");
      return;
    }

    recorder.ondataavailable = (event) => {
      if (attempt === attemptRef.current && event.data?.size) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      if (attempt !== attemptRef.current) return;
      releaseCapture();
      recorderRef.current = null;
      chunksRef.current = [];
      setPhase("error");
      setErrorCode("recorder_failed");
    };
    recorder.onstop = () => {
      if (attempt !== attemptRef.current) return;
      const detectedSilence = meterObservedRef.current && peakLevelRef.current < AUDIO_ACTIVITY_FLOOR;
      const type = recorder.mimeType || (chunksRef.current[0] instanceof Blob ? chunksRef.current[0].type : "");
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      recorderRef.current = null;
      releaseCapture();
      if (blob.size < MIN_CLIP_BYTES) {
        setPhase("error");
        setErrorCode("empty");
        return;
      }
      if (detectedSilence) {
        retainedBlobRef.current = blob;
        setHasRetryableAudio(false);
        setPhase("error");
        setErrorCode("no_audio");
        return;
      }
      void transcribe(blob, attempt);
    };
    recorderRef.current = recorder;
    try {
      recorder.start();
      beginMeter(stream);
    } catch {
      recorderRef.current = null;
      releaseCapture();
      setPhase("error");
      setErrorCode("recorder_failed");
      return;
    }
    setMode("recorder");
    setPhase("listening");
  }, [beginMeter, releaseCapture, transcribe]);

  const start = useCallback(async () => {
    if (["requesting", "listening", "stopping", "transcribing"].includes(phase)) return;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    abortRef.current?.abort();
    retainedBlobRef.current = null;
    setHasRetryableAudio(false);
    setErrorCode(null);
    setElapsedMs(0);

    if (!hasGetUserMedia()) {
      if (speech.supported) {
        setMode("speech");
        setSpeechActive(true);
        setPhase("listening");
        speech.start();
        return;
      }
      setPhase("unsupported");
      setErrorCode(typeof window !== "undefined" && window.isSecureContext === false ? "insecure_context" : "unsupported");
      return;
    }

    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      const code = mapGetUserMediaError(error);
      setErrorCode(code);
      setPhase(code === "permission_denied" ? "permission_denied" : "error");
      return;
    }
    if (attempt !== attemptRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (hasMediaRecorder()) {
      startRecorderWith(stream, attempt);
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
    if (speech.supported) {
      setMode("speech");
      setSpeechActive(true);
      setPhase("listening");
      speech.start();
      return;
    }
    setPhase("unsupported");
    setErrorCode("unsupported");
  }, [phase, speech, startRecorderWith]);

  const stop = useCallback(() => {
    if (speechActive) {
      speech.stop();
      setSpeechActive(false);
      setPhase("success");
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setPhase("stopping");
      recorder.stop();
      return;
    }
  }, [speech, speechActive]);

  const pause = useCallback(() => {
    if (speechActive) {
      speech.pause();
      setPhase("paused");
      return;
    }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      setPhase("paused");
    }
  }, [speech, speechActive]);

  const retryTranscription = useCallback(() => {
    const blob = retainedBlobRef.current;
    if (!blob || phase === "transcribing") return;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    void transcribe(blob, attempt);
  }, [phase, transcribe]);

  const recordAgain = useCallback(() => {
    abortRef.current?.abort();
    retainedBlobRef.current = null;
    setHasRetryableAudio(false);
    setErrorCode(null);
    setPhase("idle");
    setElapsedMs(0);
  }, []);

  useEffect(() => () => {
    attemptRef.current += 1;
    abortRef.current?.abort();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    retainedBlobRef.current = null;
    releaseCapture();
  }, [releaseCapture]);

  const status: DictationStatus = speechActive
    ? speech.status === "listening" ? "listening" : speech.status === "paused" ? "paused" : phase
    : phase;

  return {
    mode,
    status,
    interim: speechActive ? speech.interim : "",
    elapsedMs,
    audioLevel,
    listening: status === "listening",
    requesting: status === "requesting",
    busy: status === "requesting" || status === "stopping" || status === "transcribing",
    supported,
    errorCode,
    hasRetryableAudio,
    start,
    pause,
    stop,
    retryTranscription,
    recordAgain,
  };
}
