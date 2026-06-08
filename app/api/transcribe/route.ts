import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured — voice transcription unavailable." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audioFile = formData.get("audio") as File | null;
  const language  = (formData.get("language") as string | null) ?? "en";

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  // Whisper requires the filename to have the correct extension for format detection
  const mimeType = audioFile.type || "audio/webm";
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? ".mp4"
    : mimeType.includes("wav")
    ? ".wav"
    : ".webm";

  const whisperForm = new FormData();
  whisperForm.append("file", audioFile, `recording${ext}`);
  whisperForm.append("model", "whisper-1");
  // Map language codes: "en" → "en", "es" → "es"
  whisperForm.append("language", language === "es" ? "es" : "en");
  whisperForm.append("response_format", "text");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper API error:", err);
      return NextResponse.json(
        { error: "Whisper transcription failed", detail: err },
        { status: 502 },
      );
    }

    const transcript = await res.text(); // response_format=text returns plain text
    return NextResponse.json({ transcript: transcript.trim() });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json({ error: "Transcription request failed" }, { status: 500 });
  }
}
