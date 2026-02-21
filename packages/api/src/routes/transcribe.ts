import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { whisperPing, whisperTranscribe } from "../services/whisper.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function transcribeAudio(request: Request, ctx: ApiContext) {
  await requireAuth(request, ctx);

  const available = await whisperPing();
  if (!available) {
    return Response.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Voice transcription is not available" } },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!audio || !(audio instanceof File)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "No audio file provided" } },
      { status: 400 },
    );
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Audio file too large" } },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await audio.arrayBuffer());

  try {
    const text = await whisperTranscribe(buffer, audio.type || "audio/webm");
    return Response.json({ text });
  } catch {
    // Whisper can fail on very short or silent segments — return empty text instead of 500
    return Response.json({ text: "" });
  }
}
