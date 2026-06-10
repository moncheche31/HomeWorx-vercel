import { NextRequest, NextResponse } from "next/server";

// Explicit runtime declaration — ensures full Node.js APIs (FormData, Blob, etc.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured — voice transcription unavailable." },
      { status: 503 },
    );
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("[transcribe] formData parse error:", err);
    return NextResponse.json({ error: "Could not parse audio upload" }, { status: 400 });
  }

  const audioFile = formData.get("audio") as File | null;
  const language  = ((formData.get("language") as string | null) ?? "en").toLowerCase();

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: "No audio data received" }, { status: 400 });
  }

  // Determine correct file extension for Whisper format detection
  const mimeType = audioFile.type || "audio/webm";
  const ext =
    mimeType.includes("mp4") || mimeType.includes("m4a") ? ".mp4" :
    mimeType.includes("wav")                              ? ".wav" :
                                                            ".webm";

  // Build the multipart request for OpenAI Whisper
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile, `recording${ext}`);
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", language === "es" ? "es" : "en");
  whisperForm.append("response_format", "text");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      console.error("[transcribe] Whisper API error:", res.status, errText);
      return NextResponse.json(
        { error: "Whisper transcription failed", detail: errText },
        { status: 502 },
      );
    }

    const transcript = await res.text();
    return NextResponse.json({ transcript: transcript.trim() });
  } catch (err) {
    console.error("[transcribe] fetch error:", err);
    return NextResponse.json({ error: "Network error reaching Whisper API" }, { status: 500 });
  }
}
