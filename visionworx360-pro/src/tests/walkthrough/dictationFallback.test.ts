import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * REGRESSION: "Speak / record description" was a dead button on every browser
 * without a working Web Speech engine (Firefox, embedded browsers, blocked
 * iframes). The dictation hook must always keep a working path and must never
 * discard text the contractor already typed.
 */

const hook = readFileSync("src/features/voice-capture/hooks/useDictation.ts", "utf8");
const route = readFileSync("src/routes/api/transcribe.ts", "utf8");
const intake = readFileSync("src/features/walkthrough/components/IntakeStep.tsx", "utf8");

describe("dictation fallback", () => {
  it("uses a fresh complete recording and keeps Web Speech as a fallback", () => {
    expect(hook).toContain("useSpeechCapture");
    expect(hook).toContain("MediaRecorder");
    expect(hook).toContain("getUserMedia");
  });

  it("starts each supported browser through the recorder path", () => {
    expect(hook).toContain("if (hasMediaRecorder())");
    expect(hook).toContain("startRecorderWith(stream, attempt)");
    expect(hook).toContain("attemptRef.current");
    expect(hook).toContain('setMode("recorder")');
  });

  it("uploads one complete clip and surfaces failures", () => {
    expect(hook).toContain("/api/transcribe");
    expect(hook).toContain("MIN_CLIP_BYTES");
    expect(hook).toContain('return "transcription_failed"');
    expect(hook).toContain("retainedBlobRef");
  });

  it("keeps transcription server-side with a validated upload", () => {
    expect(route).toContain("LOVABLE_API_KEY");
    expect(route).toContain("ai.gateway.lovable.dev/v1/audio/transcriptions");
    expect(route).toContain("empty_audio");
    expect(route).toContain("audio_too_large");
    expect(route).not.toContain("import.meta.env");
  });
});

describe("intake description capture", () => {
  it("dictates into an editable field and saves to this project only", () => {
    expect(intake).toContain("useDictation");
    expect(intake).toContain("useProjectDescriptionNote");
    expect(intake).toContain("intake.describe.heard");
    expect(intake).toContain("note.save(description)");
    // Typed text survives a failed save.
    expect(intake).toContain("intake.saveFailed");
  });

  it("offers capture actions before any clarification questions", () => {
    expect(intake).toContain("intake.video.record");
    expect(intake).toContain("intake.video.upload");
    expect(intake).toContain("intake.measure.title");
    expect(intake).toContain("intake.photos");
    expect(intake).toContain("intake.analyze");
  });
});
