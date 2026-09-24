import { createFileRoute } from "@tanstack/react-router";

/**
 * Speech-to-text for the dictation fallback (browsers without a working Web
 * Speech engine). The client uploads one complete audio clip; we forward it to
 * the AI gateway and return plain text. The API key never leaves the server.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const MODEL = "openai/gpt-4o-mini-transcribe";
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
]);

function extensionForAudioType(type: string): string {
  if (type === "audio/mp4") return "m4a";
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/wav" || type === "audio/wave") return "wav";
  return "webm";
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "transcription_unavailable" }, { status: 503 });
        }

        let audio: File | null = null;
        try {
          const form = await request.formData();
          const value = form.get("audio");
          if (value instanceof File) audio = value;
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }

        if (!audio || audio.size === 0) {
          return Response.json({ error: "empty_audio" }, { status: 400 });
        }
        if (audio.size > MAX_BYTES) {
          return Response.json({ error: "audio_too_large" }, { status: 413 });
        }
        const audioType = audio.type.toLowerCase().split(";")[0].trim();
        if (!ACCEPTED_AUDIO_TYPES.has(audioType)) {
          return Response.json({ error: "unsupported_audio" }, { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", MODEL);
        // The upstream decoder infers the container from the filename. Always
        // derive it from the validated MIME type rather than trusting a missing
        // or browser-generated name with the wrong extension.
        upstream.append("file", audio, `recording.${extensionForAudioType(audioType)}`);
        upstream.append("stream", "false");

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          return Response.json(
            { error: "transcription_failed", detail: detail.slice(0, 500) },
            { status: response.status },
          );
        }

        const payload = (await response.json()) as { text?: string };
        return Response.json({ text: (payload.text ?? "").trim() });
      },
    },
  },
});
