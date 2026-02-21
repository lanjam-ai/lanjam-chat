import { createContext, useCallback, useContext, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityTaskType = "model-install";

export interface ActivityTask {
  id: string;
  type: ActivityTaskType;
  label: string;
  status: string;
  percent: number;
  startedAt: number;
}

interface ActivityContextValue {
  tasks: ActivityTask[];
  hasActive: boolean;
  startModelInstall: (name: string) => void;
  /** For the LLM page to subscribe to install completion */
  onInstallComplete: (cb: (name: string) => void) => () => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const completeCbsRef = useRef<Set<(name: string) => void>>(new Set());

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notifyComplete = useCallback((name: string) => {
    for (const cb of completeCbsRef.current) cb(name);
  }, []);

  const startModelInstall = useCallback(
    (name: string) => {
      const id = `model-${name}-${Date.now()}`;

      setTasks((prev) => [
        ...prev,
        {
          id,
          type: "model-install",
          label: name,
          status: "Starting...",
          percent: 0,
          startedAt: Date.now(),
        },
      ]);

      // Fire-and-forget SSE stream — runs independently of any page
      (async () => {
        try {
          const res = await fetch("/api/admin/llm/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setTasks((prev) =>
              prev.map((t) =>
                t.id === id
                  ? { ...t, status: data.error?.message ?? "Install failed", percent: 0 }
                  : t,
              ),
            );
            setTimeout(() => removeTask(id), 5000);
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            removeTask(id);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let currentEventType = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEventType = line.slice(7).trim();
                continue;
              }
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw || raw === "[DONE]") continue;

              try {
                const parsed = JSON.parse(raw);
                setTasks((prev) =>
                  prev.map((t) => {
                    if (t.id !== id) return t;
                    const updates: Partial<ActivityTask> = {};
                    if (parsed.status) updates.status = parsed.status;
                    if (parsed.completed != null && parsed.total) {
                      updates.percent = Math.round((parsed.completed / parsed.total) * 100);
                    }
                    return { ...t, ...updates };
                  }),
                );

                if (currentEventType === "done") {
                  notifyComplete(parsed.name ?? name);
                }
              } catch {
                // skip malformed lines
              }
              currentEventType = "";
            }
          }
        } catch {
          setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: "Install failed" } : t)),
          );
          setTimeout(() => removeTask(id), 5000);
        } finally {
          // small delay so the UI can show 100% briefly
          setTimeout(() => removeTask(id), 800);
        }
      })();
    },
    [removeTask, notifyComplete],
  );

  const onInstallComplete = useCallback((cb: (name: string) => void) => {
    completeCbsRef.current.add(cb);
    return () => {
      completeCbsRef.current.delete(cb);
    };
  }, []);

  return (
    <ActivityContext.Provider
      value={{
        tasks,
        hasActive: tasks.length > 0,
        startModelInstall,
        onInstallComplete,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}
