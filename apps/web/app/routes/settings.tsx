import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/settings";

export function meta() {
  return [{ title: "Settings - LanJAM" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/auth/me");
  const { user } = meRes.ok
    ? await meRes.json()
    : { user: { name: "", role: "adult", ui_theme: "system", safe_mode_enabled: false } };
  return { user };
}

export default function SettingsPage() {
  const { user } = useLoaderData<typeof loader>();

  const [theme, setTheme] = useState<string>(user.ui_theme ?? "system");
  const [safeModeEnabled, setSafeModeEnabled] = useState(user.safe_mode_enabled ?? false);
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Name editing
  const [name, setName] = useState(user.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [nameError, setNameError] = useState("");

  async function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    // Apply immediately
    if (typeof document !== "undefined") {
      const resolved =
        newTheme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : newTheme;
      document.documentElement.classList.toggle("dark", resolved === "dark");
    }

    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui_theme: newTheme }),
    });
  }

  async function handleNameSave() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name) return;

    setNameError("");
    setNameMessage("");
    setSavingName(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNameError(data.error?.message ?? "Failed to update name");
        return;
      }
      setNameMessage("Name updated");
      user.name = trimmed;
    } catch {
      setNameError("Network error");
    } finally {
      setSavingName(false);
    }
  }

  async function handlePasscodeChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (passcode.length < 4) {
      setError("Passcode must be at least 4 characters");
      return;
    }
    if (passcode !== confirmPasscode) {
      setError("Passcodes do not match");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to update passcode");
        return;
      }

      setPasscode("");
      setConfirmPasscode("");
      setMessage("Passcode updated successfully");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* Name */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Display Name</h2>
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-end gap-3 max-w-sm">
              <div className="flex-1 space-y-2">
                <label htmlFor="display-name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={handleNameSave}
                disabled={savingName || !name.trim() || name.trim() === user.name}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {savingName ? "Saving..." : "Save"}
              </button>
            </div>
            {nameError && <p className="mt-2 text-sm text-destructive">{nameError}</p>}
            {nameMessage && (
              <p className="mt-2 text-sm text-green-600 dark:text-green-400">{nameMessage}</p>
            )}
          </div>
        </section>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Appearance</h2>
          <div className="grid grid-cols-3 gap-3">
            {themes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                  theme === value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-sm font-medium">{label}</span>
                {theme === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Safe Mode - only for adults and admins */}
        {(user.role === "adult" || user.role === "admin") && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold">Safe Mode</h2>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Enable Safe Mode by default</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New conversations will start with content safety rules applied. You can still
                    change it per conversation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const newValue = !safeModeEnabled;
                    setSafeModeEnabled(newValue);
                    await fetch("/api/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ safe_mode_enabled: newValue }),
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    safeModeEnabled ? "bg-primary" : "bg-input"
                  }`}
                  role="switch"
                  aria-checked={safeModeEnabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      safeModeEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Passcode */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Change Passcode</h2>
          <div className="rounded-lg border border-border p-4">
            <form onSubmit={handlePasscodeChange} className="space-y-4 max-w-sm">
              <div className="space-y-2">
                <label htmlFor="new-passcode" className="text-sm font-medium">
                  New Passcode
                </label>
                <input
                  id="new-passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="At least 4 characters"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-new" className="text-sm font-medium">
                  Confirm Passcode
                </label>
                <input
                  id="confirm-new"
                  type="password"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Confirm new passcode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

              <button
                type="submit"
                disabled={saving || !passcode}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? "Saving..." : "Update Passcode"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
