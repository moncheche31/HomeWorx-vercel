# Shared Recorder Reliability Repair

## Goal
Make every voice-note surface use one repeatable, observable recording lifecycle that supports sequential recordings, retains valid audio for transcription retry, reports precise failures, and preserves project/media attachment isolation.

## Implementation
1. Refactor `useDictation` around an attempt-scoped lifecycle: each start creates fresh stream, recorder, chunks, timing, metering, and request cancellation state; every success, error, re-record, and unmount releases those resources.
2. Prefer complete WAV capture from Web Audio PCM where supported so browser containers cannot poison later attempts; retain a safe complete-file MediaRecorder fallback with MIME-derived filenames and accepted-type validation.
3. Retain the most recent valid clip after transcription errors and expose `retryTranscription` and `recordAgain`; clear retained audio only on success or explicit replacement.
4. Add explicit Ready, Requesting, Recording, Processing, Success, and Error presentation, with elapsed time, pulsing recording indicator, and a live microphone level meter. Keep real Web Speech interim text only when that engine is genuinely active.
5. Harden `/api/transcribe` validation and error passthrough so client messages can distinguish empty/no-audio, unsupported format, network/service, and unavailable configuration failures.
6. Keep all existing callers on the shared hook/control and preserve their local callbacks so transcripts continue attaching only to the mounted project/media/note target.

## Regression Coverage
- Exercise five sequential recordings in one mounted session and verify fresh streams/recorders/files plus first, second, and fifth transcript attachment.
- Cover stop/re-record, transcription error then retained-audio retry, record-again replacement, permission denial, no device, empty/no-audio, and cleanup after errors/unmount.
- Verify separate mounted targets and project navigation cannot receive each other’s transcript.
- Run focused voice tests, full test suite, TypeScript validation, lint, and production build. Do not publish.
