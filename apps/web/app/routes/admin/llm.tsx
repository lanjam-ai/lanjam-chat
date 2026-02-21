import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  Globe,
  Loader2,
  Plus,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLoaderData } from "react-router";
import { ConfirmModal } from "~/components/confirm-modal.js";
import { useActivity } from "~/hooks/use-activity.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/llm";

export function meta() {
  return [{ title: "AI Models - Admin - LanJAM" }];
}

interface ModelAccess {
  allow_teen: boolean;
  allow_child: boolean;
  safe_mode_allowed: boolean;
}

interface InstalledModel extends ModelAccess {
  name: string;
  size: number;
}

interface RemoteModel extends ModelAccess {
  name: string;
  host: string;
  is_active: boolean;
}

interface ActiveModel {
  name: string;
  host: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/auth/me");
  const { user: me } = await meRes.json();
  if (me.role !== "admin") {
    throw new Response(null, { status: 302, headers: { Location: "/chats" } });
  }

  const modelsRes = await callApi(request, "/api/admin/llm/models");
  const data = modelsRes.ok
    ? await modelsRes.json()
    : { ollamaAvailable: false, installed: [], remote: [], suggested: [], active: null };

  return { me, ...data };
}

export default function AdminLlmPage() {
  const {
    installed: initialInstalled,
    remote: initialRemote,
    suggested,
    active: initialActive,
    ollamaAvailable: initialOllamaAvailable,
  } = useLoaderData<typeof loader>();

  const activity = useActivity();
  const installing = activity.tasks.find((t) => t.type === "model-install");

  const [installed, setInstalled] = useState<InstalledModel[]>(initialInstalled);
  const [remote, setRemote] = useState<RemoteModel[]>(initialRemote ?? []);
  const [active, setActive] = useState<ActiveModel | null>(initialActive);
  const [ollamaAvailable, setOllamaAvailable] = useState(initialOllamaAvailable ?? true);
  const [customModel, setCustomModel] = useState("");
  const [error, setError] = useState("");

  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installTab, setInstallTab] = useState<"local" | "remote">("local");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    name: string;
    host: string;
  } | null>(null);
  const [ollamaWarningDismissed, setOllamaWarningDismissed] = useState(false);
  const [makeDefaultTarget, setMakeDefaultTarget] = useState<{
    name: string;
    host: string | null;
  } | null>(null);

  // Remote tab state
  const [remoteHost, setRemoteHost] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    host?: string;
    version?: string;
    models?: Array<{ name: string; size: number }>;
    error?: string;
  } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [expandedAccess, setExpandedAccess] = useState<Set<string>>(new Set());

  const totalModels = installed.length + remote.length;

  function toggleAccessPanel(key: string) {
    setExpandedAccess((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function updateModelAccess(
    name: string,
    host: string | null,
    field: keyof ModelAccess,
    value: boolean,
  ) {
    try {
      const res = await fetch("/api/admin/llm/models/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host, [field]: value }),
      });
      if (res.ok) {
        // Update local state
        if (host === null) {
          setInstalled((prev) => prev.map((m) => (m.name === name ? { ...m, [field]: value } : m)));
        } else {
          setRemote((prev) =>
            prev.map((m) => (m.name === name && m.host === host ? { ...m, [field]: value } : m)),
          );
        }
      }
    } catch {}
  }

  async function refreshModels() {
    try {
      const res = await fetch("/api/admin/llm/models");
      if (res.ok) {
        const d = await res.json();
        setInstalled(d.installed);
        setRemote(d.remote ?? []);
        setActive(d.active);
        setOllamaAvailable(d.ollamaAvailable ?? true);
      }
    } catch {}
  }

  // Refresh model list when any install completes (works even if we navigated away and back)
  useEffect(() => {
    return activity.onInstallComplete((installedName: string) => {
      const wasFirstModel = totalModels === 0 && active === null;
      refreshModels().then(() => {
        if (wasFirstModel) {
          handleSetActive(installedName, null);
        } else if (active) {
          setMakeDefaultTarget({ name: installedName, host: null });
        }
      });
    });
  }, [activity.onInstallComplete, totalModels, active]);

  function installModel(name: string) {
    setError("");
    activity.startModelInstall(name);
  }

  async function handleSetActive(name: string, host: string | null = null) {
    const res = await fetch("/api/admin/llm/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, host }),
    });
    if (res.ok) {
      await refreshModels();
    }
  }

  async function deleteModel(name: string) {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/llm/models", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to delete model");
        return;
      }
      await refreshModels();
    } catch {
      setError("Failed to delete model");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function disconnectModel(name: string, host: string) {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/llm/remote/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to disconnect model");
        return;
      }
      await refreshModels();
    } catch {
      setError("Failed to disconnect model");
    } finally {
      setDeleting(false);
      setDisconnectTarget(null);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/llm/remote/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: remoteHost }),
      });
      const data = await res.json();
      setTestResult(data);
      // Update remoteHost to normalized version from server
      if (data.ok && data.host) {
        setRemoteHost(data.host);
      }
    } catch {
      setTestResult({ ok: false, error: "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  async function connectModel(name: string) {
    const host = testResult?.host ?? remoteHost;
    const wasFirstModel = totalModels === 0 && active === null;
    setConnecting(name);
    setError("");
    try {
      const res = await fetch("/api/admin/llm/remote/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host }),
      });
      if (res.ok) {
        await refreshModels();
        setShowInstallModal(false);
        resetRemoteTab();
        if (wasFirstModel) {
          handleSetActive(name, host);
        } else if (active) {
          setMakeDefaultTarget({ name, host });
        }
      } else {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to connect");
      }
    } catch {
      setError("Failed to connect to remote model");
    } finally {
      setConnecting(null);
    }
  }

  function resetRemoteTab() {
    setRemoteHost("");
    setTestResult(null);
    setConnecting(null);
  }

  function isModelActive(name: string, host: string | null) {
    return active?.name === name && (active?.host ?? null) === host;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>

        {/* Nav */}
        <div className="mb-8 flex gap-2">
          <Link
            to="/admin"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
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

        {/* Intro */}
        <section className="mb-8">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold">What are AI Models?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI models are what power the chat. Think of them like different brains your
                  assistant can use — some are faster, some give better answers, and some are better
                  at specific tasks. You need at least one installed or connected and selected for
                  the chat to work.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Ollama unavailable warning */}
        {!ollamaAvailable && !ollamaWarningDismissed && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Ollama is not available
              </p>
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                Local model installs are unavailable until Ollama is running. You can still connect
                to remote Ollama servers — click Add AI Model to get started. Check the{" "}
                <Link to="/admin" className="font-medium text-primary hover:underline">
                  Status page
                </Link>{" "}
                to start Ollama, or read the{" "}
                <Link to="/help/ollama-setup" className="font-medium text-primary hover:underline">
                  Ollama setup guide
                </Link>{" "}
                for help.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOllamaWarningDismissed(true)}
              className="shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Warnings */}
        {totalModels === 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                No AI models available
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                You need to install or connect at least one AI model before anyone can use the chat.
                Click the button below to get started.
              </p>
            </div>
          </div>
        )}

        {!active && totalModels > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                No AI model selected
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Chat won't work until you select an AI model. Click "Set Active" on one of your
                models below.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Install progress */}
        {installing && (
          <div className="mb-6 rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Installing {installing.label}...</span>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{installing.status}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${installing.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Models list */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Models ({totalModels})</h2>
            <button
              onClick={() => {
                setShowInstallModal(true);
                setInstallTab(ollamaAvailable ? "local" : "remote");
                resetRemoteTab();
              }}
              disabled={!!installing}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add AI Model
            </button>
          </div>

          {totalModels === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI models available yet. Click "Add AI Model" above to install or connect one.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Local models */}
              {installed.map((model) => {
                const isActive = isModelActive(model.name, null);
                const accessKey = `local:${model.name}`;
                const isAccessExpanded = expandedAccess.has(accessKey);
                return (
                  <div key={model.name} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Cpu className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{model.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(model.size)}</p>
                          {isActive && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button
                          onClick={() => toggleAccessPanel(accessKey)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Access settings"
                        >
                          {isAccessExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Access
                        </button>
                        {isActive ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <button
                            onClick={() => handleSetActive(model.name, null)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
                          >
                            <Circle className="h-3.5 w-3.5" />
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(model.name)}
                          disabled={!!installing || deleting}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </div>
                    {isAccessExpanded && (
                      <div className="border-t border-border px-4 py-3 space-y-2.5 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Who can use this model
                        </p>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Teens can use</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.allow_teen}
                            onClick={() =>
                              updateModelAccess(model.name, null, "allow_teen", !model.allow_teen)
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.allow_teen ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.allow_teen ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Children can use</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.allow_child}
                            onClick={() =>
                              updateModelAccess(model.name, null, "allow_child", !model.allow_child)
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.allow_child ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.allow_child ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Available in Safe Mode</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.safe_mode_allowed}
                            onClick={() =>
                              updateModelAccess(
                                model.name,
                                null,
                                "safe_mode_allowed",
                                !model.safe_mode_allowed,
                              )
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.safe_mode_allowed ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.safe_mode_allowed ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Remote models */}
              {remote.map((model) => {
                const isActive = isModelActive(model.name, model.host);
                const accessKey = `remote:${model.host}:${model.name}`;
                const isAccessExpanded = expandedAccess.has(accessKey);
                return (
                  <div
                    key={`${model.host}:${model.name}`}
                    className="rounded-lg border border-border"
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Globe className="h-5 w-5 shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{model.name}</p>
                            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              Remote
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{model.host}</p>
                          {isActive && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button
                          onClick={() => toggleAccessPanel(accessKey)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Access settings"
                        >
                          {isAccessExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Access
                        </button>
                        {isActive ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <button
                            onClick={() => handleSetActive(model.name, model.host)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
                          >
                            <Circle className="h-3.5 w-3.5" />
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setDisconnectTarget({ name: model.name, host: model.host })
                          }
                          disabled={!!installing || deleting}
                          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Disconnect</span>
                        </button>
                      </div>
                    </div>
                    {isAccessExpanded && (
                      <div className="border-t border-border px-4 py-3 space-y-2.5 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Who can use this model
                        </p>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Teens can use</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.allow_teen}
                            onClick={() =>
                              updateModelAccess(
                                model.name,
                                model.host,
                                "allow_teen",
                                !model.allow_teen,
                              )
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.allow_teen ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.allow_teen ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Children can use</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.allow_child}
                            onClick={() =>
                              updateModelAccess(
                                model.name,
                                model.host,
                                "allow_child",
                                !model.allow_child,
                              )
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.allow_child ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.allow_child ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                        <label className="flex items-center justify-between">
                          <span className="text-sm">Available in Safe Mode</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={model.safe_mode_allowed}
                            onClick={() =>
                              updateModelAccess(
                                model.name,
                                model.host,
                                "safe_mode_allowed",
                                !model.safe_mode_allowed,
                              )
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${model.safe_mode_allowed ? "bg-primary" : "bg-input"}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${model.safe_mode_allowed ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                          </button>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Install Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="flex max-h-[90vh] w-full flex-col rounded-t-xl border bg-card shadow-lg sm:max-w-md sm:rounded-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Add AI Model</h2>
              <button
                onClick={() => {
                  setShowInstallModal(false);
                  resetRemoteTab();
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-6">
              <button
                onClick={() => ollamaAvailable && setInstallTab("local")}
                disabled={!ollamaAvailable}
                title={
                  !ollamaAvailable
                    ? "Ollama is not running — local installs unavailable"
                    : undefined
                }
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  installTab === "local"
                    ? "border-primary text-foreground"
                    : !ollamaAvailable
                      ? "border-transparent text-muted-foreground/50 cursor-not-allowed"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Local
              </button>
              <button
                onClick={() => setInstallTab("remote")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  installTab === "remote"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Remote
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {installTab === "local" ? (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Choose a recommended model to install, or enter a custom model name at the
                    bottom.
                  </p>

                  {/* Suggested models */}
                  <div className="space-y-2">
                    {suggested.map((model: any) => {
                      const isInstalled = installed.some(
                        (m) => m.name === model.name || m.name === `${model.name}:latest`,
                      );
                      return (
                        <div
                          key={model.name}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {model.description} ({model.size})
                            </p>
                          </div>
                          {isInstalled ? (
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                              Installed
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                installModel(model.name);
                                setShowInstallModal(false);
                              }}
                              disabled={!!installing}
                              className="ml-3 shrink-0 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              Install
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom model input */}
                  <div className="mt-6 border-t pt-4">
                    <p className="mb-2 text-sm font-medium">Install a different model</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Enter the name of any model available on Ollama.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (customModel.trim()) {
                          installModel(customModel.trim());
                          setCustomModel("");
                          setShowInstallModal(false);
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="e.g. llama3.2:latest"
                        className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="submit"
                        disabled={!!installing || !customModel.trim()}
                        className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Install
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Connect to a model running on another Ollama server on your network.
                  </p>

                  {/* Host URL input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={remoteHost}
                      onChange={(e) => {
                        setRemoteHost(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="e.g. 192.168.1.100:11434"
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      onClick={testConnection}
                      disabled={testing || !remoteHost.trim()}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                    </button>
                  </div>

                  {/* Test error */}
                  {testResult && !testResult.ok && (
                    <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {testResult.error}
                    </div>
                  )}

                  {/* Test success: show available models */}
                  {testResult?.ok && (
                    <div className="mt-4">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 dark:text-green-400">
                          Connected{testResult.version ? ` (v${testResult.version})` : ""}
                        </span>
                      </div>

                      {testResult.models && testResult.models.length > 0 ? (
                        <>
                          <p className="mb-2 text-sm font-medium">Available models:</p>
                          <div className="space-y-2">
                            {testResult.models.map((model) => {
                              const normalizedHost = testResult.host ?? remoteHost;
                              const alreadyConnected = remote.some(
                                (r) => r.name === model.name && r.host === normalizedHost,
                              );
                              return (
                                <div
                                  key={model.name}
                                  className="flex items-center justify-between rounded-lg border border-border p-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">{model.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatBytes(model.size)}
                                    </p>
                                  </div>
                                  {alreadyConnected ? (
                                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                                      Connected
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => connectModel(model.name)}
                                      disabled={!!connecting}
                                      className="ml-3 shrink-0 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                    >
                                      {connecting === model.name ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Connect"
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No models found on this server. Install a model on the remote Ollama
                          instance first.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation (local) */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete AI Model"
        message={`Are you sure you want to delete "${deleteTarget}"? This will remove it from this device. Other apps on the same server that use this model will also be affected.`}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={() => deleteTarget && deleteModel(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Disconnect confirmation (remote) */}
      <ConfirmModal
        open={!!disconnectTarget}
        title="Disconnect Remote Model"
        message={`Disconnect "${disconnectTarget?.name}" from ${disconnectTarget?.host}? This only removes it from LanJAM — the model will still be available on the remote server.`}
        confirmLabel="Disconnect"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={() =>
          disconnectTarget && disconnectModel(disconnectTarget.name, disconnectTarget.host)
        }
        onCancel={() => setDisconnectTarget(null)}
      />

      {/* Make default confirmation */}
      <ConfirmModal
        open={!!makeDefaultTarget}
        title="Set as Default Model?"
        message={`Would you like to make "${makeDefaultTarget?.name}" the default model for all chats?`}
        confirmLabel="Set as Default"
        cancelLabel="Not Now"
        variant="default"
        onConfirm={() => {
          if (makeDefaultTarget) {
            handleSetActive(makeDefaultTarget.name, makeDefaultTarget.host);
          }
          setMakeDefaultTarget(null);
        }}
        onCancel={() => setMakeDefaultTarget(null)}
      />
    </div>
  );
}
