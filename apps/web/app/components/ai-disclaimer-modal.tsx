import { Info } from "lucide-react";

interface AiDisclaimerModalProps {
  open: boolean;
  modelName: string;
  onAcknowledge: () => void;
  onCancel: () => void;
}

export function AiDisclaimerModal({
  open,
  modelName,
  onAcknowledge,
  onCancel,
}: AiDisclaimerModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
            <Info className="h-5 w-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold">Before you chat with {modelName}</h2>
        </div>

        <div className="mb-6 space-y-3 text-sm text-muted-foreground">
          <p>
            AI generates responses by predicting text based on patterns — it does not look up facts
            or search the internet. This means it can sometimes produce answers that sound confident
            but are actually wrong.
          </p>
          <p>
            These mistakes are called <strong className="text-foreground">hallucinations</strong>.
            The AI might state incorrect facts, make up references, or give plausible-sounding but
            inaccurate explanations.
          </p>
          <p>
            Always <strong className="text-foreground">verify important information</strong> from a
            trusted source. Treat AI responses as a helpful starting point, not guaranteed truth.
          </p>
        </div>

        <p className="mb-6 text-xs text-muted-foreground">
          Learn more:{" "}
          <a
            href="/help/understanding-ai-responses"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            Understanding AI Responses
          </a>
        </p>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
