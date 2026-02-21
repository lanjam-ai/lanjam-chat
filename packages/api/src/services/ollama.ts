import { spawn } from "node:child_process";

const getBaseUrl = (host?: string) => host ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";

/** 10 minutes — covers model loading + generation for large models. */
const CHAT_TIMEOUT_MS = 600_000;
/** 2 minutes — embedding should be fast, but model may need to load. */
const EMBED_TIMEOUT_MS = 120_000;

/** Map known Ollama error patterns to user-friendly messages. */
function friendlyOllamaError(raw: string): string {
  const lower = raw.toLowerCase();

  if (
    lower.includes("signal: killed") ||
    lower.includes("oom") ||
    lower.includes("out of memory")
  ) {
    return "The model ran out of memory and was stopped by the system. Try a smaller model or close other applications to free up RAM.";
  }
  if (lower.includes("connection refused") || lower.includes("econnrefused")) {
    return "Cannot connect to Ollama. Make sure Ollama is running and try again.";
  }
  if (lower.includes("model") && lower.includes("not found")) {
    return "The selected model is not available. Please download it from the admin panel or choose a different model.";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborterror")) {
    return "The request timed out. The model may be too large for your system, or Ollama may be overloaded. Try again or switch to a smaller model.";
  }
  if (lower.includes("context length") || lower.includes("too long")) {
    return "The conversation is too long for this model's context window. Try starting a new conversation or use a model with a larger context size.";
  }
  if (lower.includes("no response body")) {
    return "Ollama returned an empty response. It may be overloaded — please try again in a moment.";
  }

  // Fallback: strip JSON wrapper if present, keep it short
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return `Model error: ${parsed.error}`;
  } catch {}

  return `Model error: ${raw.length > 200 ? `${raw.slice(0, 200)}…` : raw}`;
}

export async function ollamaPing(host?: string): Promise<boolean> {
  try {
    const res = await fetch(getBaseUrl(host), { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaVersion(host?: string): Promise<string | null> {
  try {
    const res = await fetch(`${getBaseUrl(host)}/api/version`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data: any = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function ollamaListModels(
  host?: string,
): Promise<Array<{ name: string; size: number; modified_at: string }>> {
  const res = await fetch(`${getBaseUrl(host)}/api/tags`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Ollama list failed: ${res.status}`);
  const data: any = await res.json();
  return data.models ?? [];
}

export async function* ollamaPullModel(name: string): AsyncGenerator<{
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}> {
  const res = await fetch(`${getBaseUrl()}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch {}
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {}
  }
}

export async function ollamaDeleteModel(name: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Ollama delete failed: ${res.status}`);
  }
}

export interface OllamaChatChunk {
  content: string;
  done: boolean;
  metadata?: {
    total_duration_ns: number;
    prompt_eval_count: number;
    eval_count: number;
    eval_duration_ns: number;
  };
}

export async function* ollamaChatStream(
  model: string,
  messages: Array<{ role: string; content: string }>,
  host?: string,
): AsyncGenerator<OllamaChatChunk> {
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl(host)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(friendlyOllamaError((err as Error).message ?? "Connection failed"));
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(friendlyOllamaError(text || "no response body"));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // skip malformed JSON lines
      }

      // Ollama can send an error object mid-stream
      if (parsed.error) {
        throw new Error(friendlyOllamaError(parsed.error));
      }

      const chunk: OllamaChatChunk = {
        content: parsed.message?.content ?? "",
        done: parsed.done ?? false,
      };

      if (parsed.done) {
        chunk.metadata = {
          total_duration_ns: parsed.total_duration ?? 0,
          prompt_eval_count: parsed.prompt_eval_count ?? 0,
          eval_count: parsed.eval_count ?? 0,
          eval_duration_ns: parsed.eval_duration ?? 0,
        };
      }

      yield chunk;
    }
  }
}

export async function ollamaStart(): Promise<{ ok: boolean; error?: string }> {
  const alreadyRunning = await ollamaPing();
  if (alreadyRunning) return { ok: true };

  try {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Listen for spawn errors (e.g. ENOENT when ollama binary not found)
    const spawnError = await new Promise<Error | null>((resolve) => {
      child.once("error", (err) => resolve(err));
      // If no error within 500ms, assume spawn was successful
      setTimeout(() => resolve(null), 500);
    });

    if (spawnError) {
      const code = (spawnError as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          ok: false,
          error:
            "Ollama is not installed on this machine. Install it from https://ollama.com and try again.",
        };
      }
      return { ok: false, error: spawnError.message || "Failed to start Ollama" };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to spawn ollama" };
  }

  // Poll for up to 5 seconds
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ollamaPing()) return { ok: true };
  }

  return {
    ok: false,
    error:
      "Ollama was started but did not become reachable within 5 seconds. It may still be loading — try refreshing in a moment.",
  };
}

export async function ollamaEmbed(text: string, model?: string): Promise<number[]> {
  const embeddingModel = model ?? process.env.ACTIVE_EMBEDDING_MODEL ?? "nomic-embed-text";
  const res = await fetch(`${getBaseUrl()}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: embeddingModel, input: text }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Ollama embed failed: ${res.status}`);
  }

  const data: any = await res.json();
  return data.embeddings?.[0] ?? [];
}
