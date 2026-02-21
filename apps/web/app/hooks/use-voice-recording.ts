import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceRecordingOptions {
  /** Called each time new transcribed text arrives (full accumulated text) */
  onTranscript: (text: string) => void;
  /** Interval in ms between segment transcription calls (default 7000) */
  segmentIntervalMs?: number;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  error: string | null;
  /** The active mic stream — use for audio visualisation */
  stream: MediaStream | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  clearRecording: () => void;
}

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Transcribe a single audio blob via the backend.
 * Returns the transcribed text, or empty string on failure / silence.
 */
async function transcribeBlob(
  blob: Blob,
  mimeType: string,
  signal: AbortSignal,
): Promise<{ text: string; error?: string }> {
  const formData = new FormData();
  const ext = mimeType.includes("ogg") ? "ogg" : "webm";
  formData.append("audio", blob, `segment.${ext}`);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok) {
    if (res.status === 503) return { text: "", error: "Voice transcription is not available" };
    const data = await res.json().catch(() => ({ error: { message: "Transcription failed" } }));
    return { text: "", error: data.error?.message ?? "Transcription failed" };
  }

  const data = await res.json();
  return { text: (data.text ?? "").trim() };
}

export function useVoiceRecording({
  onTranscript,
  segmentIntervalMs = 7000,
}: UseVoiceRecordingOptions): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentChunksRef = useRef<Blob[]>([]);
  const textSegmentsRef = useRef<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const mimeTypeRef = useRef("");
  const cancelledRef = useRef(false);
  const pendingTranscriptionRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  /** Create a fresh MediaRecorder on the existing stream. */
  const createRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return null;

    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        segmentChunksRef.current.push(e.data);
      }
    };
    return recorder;
  }, []);

  /** Stop current recorder, collect its segment, transcribe, start a new recorder. */
  const rotateAndTranscribe = useCallback(async () => {
    if (cancelledRef.current) return;
    if (pendingTranscriptionRef.current) return; // previous segment still in-flight

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    // Stop the current recorder — this triggers final ondataavailable
    const collectPromise = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await collectPromise;

    // Grab the completed segment
    const segmentBlobs = segmentChunksRef.current;
    segmentChunksRef.current = [];

    // Start a new recorder immediately so we don't miss audio
    if (!cancelledRef.current && streamRef.current?.active) {
      const newRecorder = createRecorder();
      if (newRecorder) {
        mediaRecorderRef.current = newRecorder;
        newRecorder.start(1000);
      }
    }

    // Transcribe the completed segment
    if (segmentBlobs.length === 0) return;
    const blob = new Blob(segmentBlobs, { type: mimeTypeRef.current || "audio/webm" });
    if (blob.size === 0) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    pendingTranscriptionRef.current = true;
    setIsTranscribing(true);
    try {
      const result = await transcribeBlob(blob, mimeTypeRef.current, abortRef.current.signal);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Clear any previous transient error on success
      setError(null);
      if (result.text) {
        textSegmentsRef.current.push(result.text);
        onTranscriptRef.current(textSegmentsRef.current.join(" "));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "Transcription failed");
      }
    } finally {
      pendingTranscriptionRef.current = false;
      setIsTranscribing(false);
    }
  }, [createRecorder]);

  /** Transcribe whatever is currently buffered without rotating. Used on stop. */
  const transcribeFinalSegment = useCallback(async () => {
    const segmentBlobs = segmentChunksRef.current;
    segmentChunksRef.current = [];

    if (segmentBlobs.length === 0 || cancelledRef.current) return;
    const blob = new Blob(segmentBlobs, { type: mimeTypeRef.current || "audio/webm" });
    if (blob.size === 0) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsTranscribing(true);
    try {
      const result = await transcribeBlob(blob, mimeTypeRef.current, abortRef.current.signal);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      if (result.text) {
        textSegmentsRef.current.push(result.text);
        onTranscriptRef.current(textSegmentsRef.current.join(" "));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "Transcription failed");
      }
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
      setStream(null);
    }

    segmentChunksRef.current = [];
    textSegmentsRef.current = [];
    pendingTranscriptionRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setIsTranscribing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;
    segmentChunksRef.current = [];
    textSegmentsRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not supported in this browser");
      return;
    }

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;
      setStream(micStream);

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = createRecorder();
      if (!recorder) {
        setError("Could not create audio recorder");
        cleanup();
        return;
      }
      mediaRecorderRef.current = recorder;

      // Collect data every 1s
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // Every interval: stop recorder, transcribe segment, start new recorder
      intervalRef.current = setInterval(() => {
        if (!cancelledRef.current && mediaRecorderRef.current?.state === "recording") {
          rotateAndTranscribe();
        }
      }, segmentIntervalMs);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("Permission") || msg.includes("NotAllowedError")) {
        setError(
          "Microphone access denied. Please allow microphone access in your browser settings.",
        );
      } else {
        setError("Could not access microphone");
      }
      cleanup();
    }
  }, [segmentIntervalMs, rotateAndTranscribe, createRecorder, cleanup]);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      // Collect final data
      const recorder = mediaRecorderRef.current;
      const collectPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.stop();
      collectPromise.then(() => transcribeFinalSegment());
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
      setStream(null);
    }

    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
  }, [transcribeFinalSegment]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setError(null);
  }, [cleanup]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  /** Clear accumulated transcript and audio so the next transcription starts fresh. */
  const clearRecording = useCallback(() => {
    abortRef.current?.abort();
    segmentChunksRef.current = [];
    textSegmentsRef.current = [];
  }, []);

  return {
    isRecording,
    isPaused,
    isTranscribing,
    error,
    stream,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    clearRecording,
  };
}
