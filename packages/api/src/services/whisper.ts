const getBaseUrl = () => process.env.WHISPER_HOST ?? "http://localhost:8000";

const TRANSCRIBE_TIMEOUT_MS = 60_000;

export async function whisperPing(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function mimeExtension(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
  };
  return map[mime] ?? "webm";
}

/**
 * Common phrases Whisper hallucinates when given silence or background noise.
 * Checked case-insensitively after stripping punctuation.
 */
const HALLUCINATION_PHRASES = new Set([
  "thank you",
  "thank you very much",
  "thanks",
  "thanks for watching",
  "thanks for listening",
  "please subscribe",
  "like and subscribe",
  "see you next time",
  "see you in the next video",
  "bye",
  "goodbye",
  "you",
  "okay",
  "ok",
  "yeah",
  "yes",
  "no",
  "right",
  "so",
  "oh",
  "uh",
  "um",
  "hmm",
  "ah",
  "the end",
  "subtitle",
  "subtitles",
  "subtitles by",
  "translated by",
]);

function isHallucination(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"…\-–—]/g, "")
    .trim();
  return HALLUCINATION_PHRASES.has(normalized);
}

export async function whisperTranscribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append("file", blob, `audio.${mimeExtension(mimeType)}`);
  formData.append("model", process.env.WHISPER_MODEL ?? "Systran/faster-whisper-small.en");
  formData.append("language", "en");
  formData.append("vad_filter", "true");

  const res = await fetch(`${getBaseUrl()}/v1/audio/transcriptions`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whisper transcription failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();

  // Filter out common hallucination phrases from silence/noise
  if (isHallucination(text)) return "";

  return text;
}
