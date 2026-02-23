import {
  AlertTriangle,
  KeyRound,
  Loader2,
  LogOut,
  RotateCcw,
  ScrollText,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/console";

export function meta() {
  return [{ title: "Owner Console - LanJAM" }];
}

interface OwnerUser {
  id: string;
  name: string;
  role: string;
  is_disabled: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  target_user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/owner/me");
  if (!meRes.ok) {
    throw new Response(null, { status: 302, headers: { Location: "/owner" } });
  }

  const [usersRes, auditRes] = await Promise.all([
    callApi(request, "/api/owner/users"),
    callApi(request, "/api/owner/audit-log"),
  ]);

  const { users } = usersRes.ok ? await usersRes.json() : { users: [] };
  const { entries } = auditRes.ok ? await auditRes.json() : { entries: [] };

  return { users, entries };
}

export default function OwnerConsolePage() {
  const { users: initialUsers, entries: initialEntries } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [users, setUsers] = useState<OwnerUser[]>(initialUsers);
  const [entries] = useState<AuditEntry[]>(initialEntries);
  const [tab, setTab] = useState<"users" | "reset" | "audit">("users");

  // Reset passcode state
  const [selectedUser, setSelectedUser] = useState<OwnerUser | null>(null);
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  // System reset state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetStep, setResetStep] = useState("");
  const [resetProgress, setResetProgress] = useState({ step: 0, total: 0 });
  const [systemResetError, setSystemResetError] = useState("");

  async function handleLogout() {
    await fetch("/api/owner/logout", { method: "POST" });
    navigate("/owner");
  }

  async function handleResetPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setResetError("");
    setResetSuccess("");

    if (newPasscode !== confirmPasscode) {
      setResetError("Passcodes do not match");
      return;
    }
    if (newPasscode.length < 4) {
      setResetError("Passcode must be at least 4 characters");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`/api/owner/users/${selectedUser.id}/reset-passcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPasscode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setResetError(data.error?.message ?? "Reset failed");
        return;
      }

      setResetSuccess(`Passcode reset for ${selectedUser.name}`);
      setSelectedUser(null);
      setNewPasscode("");
      setConfirmPasscode("");
    } catch {
      setResetError("Network error");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSystemReset() {
    setShowResetModal(false);
    setResetting(true);
    setResetStep("Starting reset...");
    setResetProgress({ step: 0, total: 0 });
    setSystemResetError("");
    setResetInput("");

    try {
      const res = await fetch("/api/owner/system-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "reset" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSystemResetError(data.error?.message ?? "Reset failed");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setSystemResetError("No response stream");
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
              setSystemResetError(event.message ?? "Reset failed");
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
      setSystemResetError((err as Error).message ?? "Reset failed");
    }
  }

  const tabs = [
    { id: "users" as const, label: "Users", icon: Users },
    { id: "reset" as const, label: "System Reset", icon: RotateCcw },
    { id: "audit" as const, label: "Audit Log", icon: ScrollText },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Owner Console</h1>
              <p className="text-sm text-muted-foreground">
                Account recovery and system management
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.id ? "bg-red-600 text-white" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="space-y-4">
            {resetSuccess && (
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {resetSuccess}
              </div>
            )}

            <div className="rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-sm capitalize text-muted-foreground">
                        {user.role}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {user.is_disabled ? (
                          <span className="text-destructive">Disabled</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setResetError("");
                            setNewPasscode("");
                            setConfirmPasscode("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                        >
                          <KeyRound className="h-3 w-3" />
                          Reset Passcode
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Reset Passcode Modal */}
            {selectedUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
                  <div className="mb-4">
                    <h2 className="font-semibold">Reset Passcode</h2>
                    <p className="text-sm text-muted-foreground">
                      Set a new passcode for{" "}
                      <span className="font-medium text-foreground">{selectedUser.name}</span>
                    </p>
                  </div>

                  <form onSubmit={handleResetPasscode} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="newPass" className="text-sm font-medium">
                        New Passcode
                      </label>
                      <input
                        id="newPass"
                        type="password"
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        placeholder="At least 4 characters"
                        autoFocus
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="confirmPass" className="text-sm font-medium">
                        Confirm Passcode
                      </label>
                      <input
                        id="confirmPass"
                        type="password"
                        value={confirmPasscode}
                        onChange={(e) => setConfirmPasscode(e.target.value)}
                        placeholder="Confirm passcode"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>

                    {resetError && <p className="text-sm text-destructive">{resetError}</p>}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(null)}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={resetLoading || !newPasscode || !confirmPasscode}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {resetLoading ? "..." : "Reset"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Reset Tab */}
        {tab === "reset" && (
          <div className="rounded-lg border border-destructive/50 p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold">System Reset</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will permanently delete all users, chats, messages, files, and
                  settings. The system will return to the initial setup state. The owner account
                  will be preserved.
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
        )}

        {/* Audit Log Tab */}
        {tab === "audit" && (
          <div className="rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Target
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    IP
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-mono">{entry.action}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {entry.target_user_id
                        ? (users.find((u) => u.id === entry.target_user_id)?.name ??
                          entry.target_user_id.slice(0, 8))
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.ip ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No audit log entries
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Reset Confirmation Modal */}
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
                <li>All chats and messages</li>
                <li>All uploaded files and extracted content</li>
                <li>All embeddings and search indexes</li>
                <li>All LLM model configuration</li>
              </ul>
              <p className="text-xs">The owner account will be preserved.</p>
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
                onClick={handleSystemReset}
                disabled={resetInput !== "reset"}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Reset Progress Overlay */}
      {resetting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95">
          <div className="w-full max-w-sm text-center space-y-6">
            {systemResetError ? (
              <>
                <XCircle className="mx-auto h-12 w-12 text-destructive" />
                <div>
                  <h2 className="text-xl font-semibold">Reset Failed</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{systemResetError}</p>
                </div>
                <button
                  onClick={() => {
                    setResetting(false);
                    setSystemResetError("");
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-red-500" />
                <div>
                  <h2 className="text-xl font-semibold">Resetting System</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{resetStep}</p>
                </div>
                {resetProgress.total > 0 && (
                  <div className="space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-red-500 transition-all"
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
