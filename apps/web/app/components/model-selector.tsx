import { Check, ChevronDown, Globe, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface AvailableModel {
  id: string;
  name: string;
  host: string | null;
}

interface ModelSelectorProps {
  models: AvailableModel[];
  selected: AvailableModel | null;
  onSelect: (model: AvailableModel) => void;
  disabled?: boolean;
}

export function ModelSelector({ models, selected, onSelect, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (models.length > 1) {
    return (
      <div ref={ref} className="relative ml-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {selected?.host ? (
            <Globe className="h-3 w-3 text-blue-500" />
          ) : (
            <Zap className="h-3 w-3" />
          )}
          <span className="max-w-[120px] truncate">{selected?.name ?? "Select model"}</span>
          {selected?.host && (
            <span className="rounded bg-blue-500/10 px-1 py-px text-[9px] font-medium text-blue-500">
              Remote
            </span>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="absolute left-0 bottom-full z-20 mb-1 min-w-[200px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent ${
                  selected?.id === m.id ? "bg-accent/50 font-medium" : ""
                }`}
              >
                {m.host ? <Globe className="h-3 w-3 text-blue-500" /> : <Zap className="h-3 w-3" />}
                <span className="truncate">{m.name}</span>
                {m.host && (
                  <span className="rounded bg-blue-500/10 px-1 py-px text-[9px] font-medium text-blue-500">
                    Remote
                  </span>
                )}
                {selected?.id === m.id && <Check className="h-3 w-3 ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (models.length === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 ml-1 px-1">
        {models[0].host ? <Globe className="h-3 w-3 text-blue-500" /> : <Zap className="h-3 w-3" />}
        <span className="max-w-[120px] truncate">{models[0].name}</span>
        {models[0].host && (
          <span className="rounded bg-blue-500/10 px-1 py-px text-[9px] font-medium text-blue-500">
            Remote
          </span>
        )}
      </span>
    );
  }

  return null;
}
