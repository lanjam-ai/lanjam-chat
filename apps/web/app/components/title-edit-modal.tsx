import { Loader2, Sparkles, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TitleEditModalProps {
  open: boolean;
  currentTitle: string;
  conversationId: string;
  onSave: (newTitle: string) => void;
  onCancel: () => void;
}

export function TitleEditModal({
  open,
  currentTitle,
  conversationId,
  onSave,
  onCancel,
}: TitleEditModalProps) {
  const [value, setValue] = useState(currentTitle);
  const [generating, setGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentTitle);
      setGenerating(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open, currentTitle]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel, generating]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/conversations/${conversationId}/generate-title`, {
        method: "POST",
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let generatedTitle = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "done" && event.title) {
              generatedTitle = event.title;
            }
          } catch {}
        }
      }

      if (generatedTitle) {
        setValue(generatedTitle);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Title generation failed:", err);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  if (!open) return null;

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentTitle && !generating;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current && !generating) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Title</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={generating}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) onSave(trimmed);
          }}
          disabled={generating}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          placeholder="Chat title"
        />

        <div className="mt-4 flex items-center justify-between">
          <div>
            {generating ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Suggest title
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={generating}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canSave && onSave(trimmed)}
              disabled={!canSave}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
