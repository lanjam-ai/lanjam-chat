import { ArrowUp, ChevronDown, Mic, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface VoiceOverlayProps {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  error: string | null;
  transcript: string;
  stream: MediaStream | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onClose: () => void;
  onClear: () => void;
}

const BAR_COUNT = 24;

const animations = `
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

/** Hook that connects to a MediaStream and returns live frequency levels. */
function useAudioLevels(stream: MediaStream | null, paused: boolean) {
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!stream) {
      setLevels(new Array(BAR_COUNT).fill(0));
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    ctxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(freqData);

      // Map frequency bins to our bar count
      const binCount = freqData.length;
      const barsPerBin = binCount / BAR_COUNT;
      const bars: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const start = Math.floor(i * barsPerBin);
        const end = Math.floor((i + 1) * barsPerBin);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += freqData[j];
        }
        // Normalize to 0..1
        bars.push(sum / ((end - start) * 255));
      }
      setLevels(bars);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      ctx.close();
      ctxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [stream]);

  // When paused, return zeroed levels
  if (paused) return new Array(BAR_COUNT).fill(0);
  return levels;
}

export function VoiceOverlay({
  isRecording,
  isPaused,
  isTranscribing,
  error,
  transcript,
  stream,
  onPause,
  onResume,
  onCancel,
  onSubmit,
  onClose,
  onClear,
}: VoiceOverlayProps) {
  const listening = isRecording && !isPaused;
  const levels = useAudioLevels(stream, isPaused);

  let statusText: string;
  if (error) {
    statusText = error;
  } else if (isTranscribing) {
    const base = isPaused ? "Paused" : isRecording ? "Listening" : "Starting";
    statusText = `${base} | Transcribing`;
  } else {
    if (isPaused) statusText = "Paused";
    else if (isRecording) statusText = "Listening...";
    else statusText = "Starting...";
  }

  return (
    <>
      <style>{animations}</style>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" />

      {/* Floating panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2">
              {/* Recording indicator dot */}
              {listening && (
                <span
                  className="h-2 w-2 rounded-full bg-red-500"
                  style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
                />
              )}
              <Mic className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Voice Input</span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Cancel recording"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4">
            {/* Equalizer visualisation + status */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-end justify-center gap-[3px] h-12 w-full max-w-[280px]">
                {levels.map((level, i) => {
                  const minHeight = 0.06;
                  const height = Math.max(minHeight, level);
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${error ? "bg-destructive/60" : "bg-primary"}`}
                      style={{
                        height: `${height * 100}%`,
                        opacity: error ? 0.5 : 0.4 + level * 0.6,
                        transition: "height 80ms ease-out, opacity 80ms ease-out",
                      }}
                    />
                  );
                })}
              </div>
              <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
                {statusText}
              </p>
            </div>

            {/* Transcript preview */}
            <div
              className={`min-h-[80px] max-h-[200px] overflow-y-auto rounded-lg border px-3 py-2 transition-colors ${
                isTranscribing ? "border-primary/40 bg-primary/5" : "bg-muted/50"
              }`}
            >
              {transcript ? (
                <p className="text-sm whitespace-pre-wrap">{transcript}</p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  {listening ? "Start speaking..." : "Waiting..."}
                </p>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-between border-t px-5 py-3">
            <div className="flex items-center gap-2">
              {/* Pause / Resume */}
              {isRecording && (
                <button
                  type="button"
                  onClick={isPaused ? onResume : onPause}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title={isPaused ? "Resume recording" : "Pause recording"}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {isPaused ? "Resume" : "Pause"}
                </button>
              )}

              {/* Clear transcript */}
              {transcript && (
                <button
                  type="button"
                  onClick={onClear}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="Clear and start over"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}

              {/* Close (keep text, edit in textarea) */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Close and edit text"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!transcript.trim()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Send message"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
