import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  HardDrive,
  KeyRound,
  Mic,
  Loader2,
  Play,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: "Admin - LanJAM" }];
}

interface ServiceCheck {
  ok: boolean;
  message: string;
  details?: { version?: string; modelCount?: number };
}

interface StatusCheck {
  database: ServiceCheck;
  minio: ServiceCheck;
  ollama: ServiceCheck;
  whisper: ServiceCheck;
}

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/auth/me");
  const { user } = await meRes.json();
  if (user.role !== "admin") {
    throw new Response(null, { status: 302, headers: { Location: "/chats?notice=no-permission" } });
  }

  const [statusRes, ownerStatusRes] = await Promise.all([
    callApi(request, "/api/admin/status"),
    callApi(request, "/api/owner/status"),
  ]);

  const { checks: status }: { checks: StatusCheck } = statusRes.ok
    ? await statusRes.json()
    : {
        checks: {
          database: { ok: false, message: "Unreachable" },
          minio: { ok: false, message: "Unreachable" },
          ollama: { ok: false, message: "Unreachable" },
          whisper: { ok: false, message: "Unreachable" },
        },
      };

  const { initialized: ownerInitialized } = ownerStatusRes.ok
    ? await ownerStatusRes.json()
    : { initialized: false };

  return { user, status, ownerInitialized };
}

export default function AdminDashboard() {
  const { status: initialStatus, ownerInitialized: initialOwnerInit } =
    useLoaderData<typeof loader>();
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);

  // Ollama state
  const [showOllamaAlert, setShowOllamaAlert] = useState(!initialStatus.ollama.ok);
  const [startingOllama, setStartingOllama] = useState(false);
  const [ollamaStartError, setOllamaStartError] = useState("");

  // Reset state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetStep, setResetStep] = useState("");
  const [resetProgress, setResetProgress] = useState({ step: 0, total: 0 });
  const [resetError, setResetError] = useState("");

  // Owner state
  const [ownerInitialized, setOwnerInitialized] = useState(initialOwnerInit);
  const [showOwnerSetup, setShowOwnerSetup] = useState(false);
  const [ownerPasscode, setOwnerPasscode] = useState("");
  const [ownerConfirmPasscode, setOwnerConfirmPasscode] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerRecoveryKey, setOwnerRecoveryKey] = useState<string | null>(null);
  const [ownerKeyCopied, setOwnerKeyCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/status");
      if (res.ok) {
        const { checks } = await res.json();
        setStatus(checks);
        if (!checks.ollama.ok) setShowOllamaAlert(true);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStartOllama() {
    setStartingOllama(true);
    setOllamaStartError("");
    try {
      const res = await fetch("/api/admin/ollama/start", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setShowOllamaAlert(false);
        await refresh();
      } else {
        setOllamaStartError(data.error ?? "Failed to start Ollama");
      }
    } catch (err) {
      setOllamaStartError((err as Error).message ?? "Failed to start Ollama");
    } finally {
      setStartingOllama(false);
    }
  }

  async function handleReset() {
    setShowResetModal(false);
    setResetting(true);
    setResetStep("Starting reset...");
    setResetProgress({ step: 0, total: 0 });
    setResetError("");
    setResetInput("");

    try {
      const res = await fetch("/api/admin/system/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "reset" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setResetError(data.error?.message ?? "Reset failed");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setResetError("No response stream");
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
          if (!data) continue;

          try {
            const event = JSON.parse(data);
            if (event.done) {
              window.location.href = "/setup";
              return;
            }
            if (event.error) {
              setResetError(event.message ?? "Reset failed");
              return;
            }
            if (event.message) {
              setResetStep(event.message);
              setResetProgress({ step: event.step, total: event.total });
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      setResetError((err as Error).message ?? "Reset failed");
    }
  }

  async function handleInitializeOwner(e: React.FormEvent) {
    e.preventDefault();
    setOwnerError("");

    if (ownerPasscode !== ownerConfirmPasscode) {
      setOwnerError("Passcodes do not match");
      return;
    }
    if (ownerPasscode.length < 4) {
      setOwnerError("Passcode must be at least 4 characters");
      return;
    }

    setOwnerLoading(true);
    try {
      const res = await fetch("/api/admin/owner/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: ownerPasscode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setOwnerError(data.error?.message ?? "Failed to initialize owner");
        return;
      }

      const data = await res.json();
      setOwnerRecoveryKey(data.recoveryKey);
      setOwnerInitialized(true);
      setShowOwnerSetup(false);
      setOwnerPasscode("");
      setOwnerConfirmPasscode("");
    } catch {
      setOwnerError("Network error");
    } finally {
      setOwnerLoading(false);
    }
  }

  async function handleRegenerateKey() {
    setRegenerating(true);
    setOwnerError("");
    try {
      const res = await fetch("/api/admin/owner/regenerate-recovery-key", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setOwnerError(data.error?.message ?? "Failed to regenerate key");
        return;
      }

      const data = await res.json();
      setOwnerRecoveryKey(data.recoveryKey);
    } catch {
      setOwnerError("Network error");
    } finally {
      setRegenerating(false);
    }
  }

  function handleCopyOwnerKey() {
    if (ownerRecoveryKey) {
      navigator.clipboard.writeText(ownerRecoveryKey);
      setOwnerKeyCopied(true);
      setTimeout(() => setOwnerKeyCopied(false), 2000);
    }
  }

  const checks = [
    {
      name: "Database",
      icon: Database,
      ok: status.database.ok,
      detail: status.database.message ?? (status.database.ok ? "Connected" : "Unreachable"),
    },
    {
      name: "MinIO Storage",
      icon: HardDrive,
      ok: status.minio.ok,
      detail: status.minio.message ?? (status.minio.ok ? "Connected" : "Unreachable"),
    },
    {
      name: "Ollama",
      icon: Cpu,
      ok: status.ollama.ok,
      detail: status.ollama.message ?? (status.ollama.ok ? "Connected" : "Unreachable"),
    },
    {
      name: "Whisper",
      icon: Mic,
      ok: status.whisper.ok,
      detail: status.whisper.message ?? (status.whisper.ok ? "Connected" : "Unreachable"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Nav */}
        <div className="mb-8 flex gap-2">
          <Link
            to="/admin"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Status
          </Link>
          <Link
            to="/admin/users"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Users
          </Link>
          <Link
            to="/admin/llm"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            AI Models
          </Link>
          <Link
            to="/admin/safety"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Safety
          </Link>
        </div>

        {/* Ollama alert banner */}
        {showOllamaAlert && !status.ollama.ok && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Ollama is unreachable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The Ollama service is not running. You may need to restart it or start it from the
                status card below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOllamaAlert(false)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Status checks */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {checks.map((check) => (
            <div key={check.name} className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex items-center justify-between">
                <check.icon className="h-5 w-5 text-muted-foreground" />
                {check.ok ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">{check.name}</h3>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              </div>
              {check.name === "Ollama" && !check.ok && (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Ollama may need to be started or restarted after a system reboot.
                  </p>
                  {ollamaStartError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
                      <p className="text-xs text-destructive">{ollamaStartError}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStartOllama}
                      disabled={startingOllama}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {startingOllama ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {startingOllama ? "Starting..." : "Start Ollama"}
                    </button>
                    <Link
                      to="/help/ollama-setup"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Setup guide
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Owner Account */}
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Owner Account</h2>
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="flex items-start gap-4">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <h3 className="font-semibold">Recovery Console</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The owner account provides a recovery path if all admins forget their passcodes.
                  It can only reset user passcodes and perform system resets — it cannot access
                  chats.
                </p>

                {ownerRecoveryKey && (
                  <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 space-y-3">
                    <p className="text-sm font-medium">
                      Save this recovery key — it will not be shown again:
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <code className="flex-1 text-center text-lg font-bold tracking-wider break-all">
                        {ownerRecoveryKey}
                      </code>
                      <button
                        onClick={handleCopyOwnerKey}
                        className="shrink-0 rounded-md border border-input p-2 hover:bg-accent"
                        title="Copy to clipboard"
                      >
                        {ownerKeyCopied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => setOwnerRecoveryKey(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {ownerError && <p className="mt-2 text-sm text-destructive">{ownerError}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {!ownerInitialized ? (
                    <button
                      onClick={() => setShowOwnerSetup(true)}
                      className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Initialize Owner Account
                    </button>
                  ) : (
                    <button
                      onClick={handleRegenerateKey}
                      disabled={regenerating}
                      className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                    >
                      {regenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      {regenerating ? "Regenerating..." : "Regenerate Recovery Key"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-destructive">Danger Zone</h2>
          <div className="rounded-lg border border-destructive/50 p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold">Reset System</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will permanently delete all users, conversations, messages, files, and
                  settings. The system will return to the initial setup state.
                </p>
                <button
                  onClick={() => setShowResetModal(true)}
                  className="mt-4 inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset System
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Confirm System Reset</h2>
            </div>

            <div className="mb-6 space-y-3 text-sm text-muted-foreground">
              <p>This action is irreversible. The following will be permanently deleted:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>All user accounts and sessions</li>
                <li>All conversations and messages</li>
                <li>All uploaded files and extracted content</li>
                <li>All embeddings and search indexes</li>
                <li>All LLM model configuration</li>
              </ul>
              <p className="font-medium text-foreground">
                Type{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-destructive">
                  reset
                </span>{" "}
                to confirm.
              </p>
            </div>

            <input
              type="text"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder='Type "reset" to confirm'
              autoFocus
              className="mb-4 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetInput("");
                }}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetInput !== "reset"}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Setup Modal */}
      {showOwnerSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4">
              <h2 className="font-semibold">Initialize Owner Account</h2>
              <p className="text-sm text-muted-foreground">
                Set a passcode for the owner recovery account
              </p>
            </div>

            <form onSubmit={handleInitializeOwner} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="ownerPass" className="text-sm font-medium">
                  Passcode
                </label>
                <input
                  id="ownerPass"
                  type="password"
                  value={ownerPasscode}
                  onChange={(e) => setOwnerPasscode(e.target.value)}
                  placeholder="At least 4 characters"
                  autoFocus
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ownerConfirm" className="text-sm font-medium">
                  Confirm Passcode
                </label>
                <input
                  id="ownerConfirm"
                  type="password"
                  value={ownerConfirmPasscode}
                  onChange={(e) => setOwnerConfirmPasscode(e.target.value)}
                  placeholder="Confirm passcode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {ownerError && <p className="text-sm text-destructive">{ownerError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOwnerSetup(false);
                    setOwnerPasscode("");
                    setOwnerConfirmPasscode("");
                    setOwnerError("");
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ownerLoading || !ownerPasscode || !ownerConfirmPasscode}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {ownerLoading ? "Creating..." : "Initialize"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-screen Reset Progress Overlay */}
      {resetting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95">
          <div className="w-full max-w-sm text-center space-y-6">
            {resetError ? (
              <>
                <XCircle className="mx-auto h-12 w-12 text-destructive" />
                <div>
                  <h2 className="text-xl font-semibold">Reset Failed</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{resetError}</p>
                </div>
                <button
                  onClick={() => {
                    setResetting(false);
                    setResetError("");
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <div>
                  <h2 className="text-xl font-semibold">Resetting System</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{resetStep}</p>
                </div>
                {resetProgress.total > 0 && (
                  <div className="space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.round((resetProgress.step / resetProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Step {resetProgress.step} of {resetProgress.total}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
