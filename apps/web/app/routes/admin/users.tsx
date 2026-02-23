import {
  AlertTriangle,
  Ban,
  CheckCircle,
  KeyRound,
  MoreHorizontal,
  Plus,
  Trash2,
  UserCog,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData } from "react-router";
import { toast } from "sonner";
import { LoadingOverlay } from "~/components/loading-overlay.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/users";

export function meta() {
  return [{ title: "Users - Admin - LanJAM" }];
}

interface AdminUser {
  id: string;
  name: string;
  role: string;
  is_disabled: boolean;
  created_at: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/auth/me");
  const { user: me } = await meRes.json();
  if (me.role !== "admin") {
    throw new Response(null, { status: 302, headers: { Location: "/chats?notice=no-permission" } });
  }

  const usersRes = await callApi(request, "/api/admin/users");
  const { users }: { users: AdminUser[] } = usersRes.ok ? await usersRes.json() : { users: [] };

  return { me, users };
}

export default function AdminUsersPage() {
  const { me, users: initialUsers } = useLoaderData<typeof loader>();
  const [users, setUsers] = useState(initialUsers);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("adult");
  const [newPasscode, setNewPasscode] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Actions menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Passcode reset state
  const [passcodeUser, setPasscodeUser] = useState<AdminUser | null>(null);
  const [newPasscodeValue, setNewPasscodeValue] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [updatingPasscode, setUpdatingPasscode] = useState(false);

  // Delete user state
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // Loading overlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState("");

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), role: newRole, passcode: newPasscode }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed");
        return;
      }
      setShowCreate(false);
      setNewName("");
      setNewPasscode("");
      toast.success("User created");
      // Full refetch to ensure consistent data
      const listRes = await fetch("/api/admin/users");
      if (listRes.ok) {
        const { users: refreshed } = await listRes.json();
        setUsers(refreshed);
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleDisabled(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_disabled: !user.is_disabled }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_disabled: !u.is_disabled } : u)),
      );
      toast.success(user.is_disabled ? `${user.name} enabled` : `${user.name} disabled`);
    }
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    }
  }

  async function resetPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!passcodeUser) return;
    setPasscodeError("");
    setUpdatingPasscode(true);
    try {
      const res = await fetch(`/api/admin/users/${passcodeUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: newPasscodeValue }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPasscodeError(data.error?.message ?? "Failed to update passcode");
        return;
      }
      toast.success(`Passcode updated for ${passcodeUser.name}`);
      setPasscodeUser(null);
      setNewPasscodeValue("");
    } catch {
      setPasscodeError("Network error");
    } finally {
      setUpdatingPasscode(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUser) return;
    const userId = deleteUser.id;
    const userName = deleteUser.name;
    setDeleteUser(null);
    setDeleteConfirmInput("");
    setOverlayMessage(`Deleting ${userName}...`);
    setOverlayVisible(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setOverlayVisible(false);
        toast.error(data.error?.message ?? "Failed to delete user");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setOverlayVisible(false);
      toast.success(`${userName} has been deleted`);
    } catch {
      setOverlayVisible(false);
      toast.error("Network error");
    }
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
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

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Users ({users.length})</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create User
          </button>
        </div>

        {/* User list */}
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <UserCog className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">
                    {user.name}
                    {user.id === me.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={(e) => changeRole(user.id, e.target.value)}
                      disabled={user.id === me.id}
                      className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                    >
                      <option value="admin">admin</option>
                      <option value="adult">adult</option>
                      <option value="teen">teen</option>
                      <option value="child">child</option>
                    </select>
                    {user.is_disabled && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        Disabled
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {user.id !== me.id && (
                <div className="relative" ref={openMenuId === user.id ? menuRef : undefined}>
                  <button
                    type="button"
                    onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {openMenuId === user.id && (
                    <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setPasscodeUser(user);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <KeyRound className="h-4 w-4" />
                        Reset Passcode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          toggleDisabled(user);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                          user.is_disabled ? "text-green-600" : "text-destructive"
                        }`}
                      >
                        {user.is_disabled ? (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            Enable User
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4" />
                            Disable User
                          </>
                        )}
                      </button>
                      <div className="my-1 border-t border-border" />
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setDeleteUser(user);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete User
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create user dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
              <h3 className="mb-4 text-lg font-semibold">Create User</h3>
              <form onSubmit={createUser} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                  >
                    <option value="admin">Admin</option>
                    <option value="adult">Adult</option>
                    <option value="teen">Teen</option>
                    <option value="child">Child</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Passcode</label>
                  <input
                    type="password"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    placeholder="At least 4 characters"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setError("");
                    }}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reset passcode modal */}
        {passcodeUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
              <h3 className="mb-1 text-lg font-semibold">Reset Passcode</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Set a new passcode for {passcodeUser.name}.
              </p>
              <form onSubmit={resetPasscode} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Passcode</label>
                  <input
                    type="password"
                    value={newPasscodeValue}
                    onChange={(e) => setNewPasscodeValue(e.target.value)}
                    placeholder="At least 4 characters"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                    minLength={4}
                  />
                </div>

                {passcodeError && <p className="text-sm text-destructive">{passcodeError}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasscodeUser(null);
                      setNewPasscodeValue("");
                      setPasscodeError("");
                    }}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatingPasscode}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {updatingPasscode ? "Updating..." : "Update Passcode"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete user confirmation modal */}
        {deleteUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold">Delete User</h2>
              </div>

              <div className="mb-6 space-y-3 text-sm text-muted-foreground">
                <p>
                  This will permanently delete{" "}
                  <span className="font-medium text-foreground">{deleteUser.name}</span> and all
                  their data including:
                </p>
                <ul className="list-inside list-disc space-y-1">
                  <li>All conversations and messages</li>
                  <li>All uploaded files</li>
                  <li>All embeddings and search data</li>
                  <li>Their user profile and sessions</li>
                </ul>
                <p className="font-medium text-destructive">This action cannot be undone.</p>
                <p className="font-medium text-foreground">
                  Type{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-destructive">
                    {deleteUser.name}
                  </span>{" "}
                  to confirm.
                </p>
              </div>

              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={`Type "${deleteUser.name}" to confirm`}
                className="mb-4 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteUser(null);
                    setDeleteConfirmInput("");
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleteConfirmInput.toLowerCase() !== deleteUser.name.toLowerCase()}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        )}

        <LoadingOverlay visible={overlayVisible} message={overlayMessage} />
      </div>
    </div>
  );
}
