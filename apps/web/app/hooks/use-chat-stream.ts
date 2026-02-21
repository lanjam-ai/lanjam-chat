import { useCallback, useRef, useState } from "react";

interface ChatStreamEvent {
  type: "token" | "done" | "error" | "title";
  content?: string;
  messageId?: string;
  title?: string;
  error?: string;
}

interface UseChatStreamOptions {
  onToken?: (token: string) => void;
  onDone?: (messageId: string) => void;
  onTitle?: (title: string) => void;
  onError?: (error: string) => void;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      if (isStreaming) return;

      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json();
          options.onError?.(err.error?.message ?? "Failed to send message");
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          options.onError?.("No response stream");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;

            try {
              const event: ChatStreamEvent = JSON.parse(data);
              switch (event.type) {
                case "token":
                  if (event.content) options.onToken?.(event.content);
                  break;
                case "done":
                  if (event.messageId) options.onDone?.(event.messageId);
                  break;
                case "title":
                  if (event.title) options.onTitle?.(event.title);
                  break;
                case "error":
                  options.onError?.(event.error ?? "Stream error");
                  break;
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          options.onError?.((err as Error).message ?? "Stream failed");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, options],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, isStreaming, cancel };
}
