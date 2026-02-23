import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/setup";

export function meta() {
  return [{ title: "Setup - LanJAM" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const res = await callApi(request, "/api/setup/status");
  if (!res.ok) {
    // Services likely down — redirect to home which shows a friendly message
    throw new Response(null, { status: 302, headers: { Location: "/" } });
  }
  const data = await res.json();
  if (!data.needsSetup) {
    throw new Response(null, { status: 302, headers: { Location: "/" } });
  }
  return { needsSetup: true };
}

export default function SetupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (passcode !== confirmPasscode) {
      setError("Passcodes do not match");
      return;
    }
    if (passcode.length < 4) {
      setError("Passcode must be at least 4 characters");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), passcode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Setup failed");
        return;
      }

      const data = await res.json();
      if (data.recoveryKey) {
        setRecoveryKey(data.recoveryKey);
      } else {
        navigate("/");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyKey() {
    if (recoveryKey) {
      navigator.clipboard.writeText(recoveryKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  }

  // Recovery key screen
  if (recoveryKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <KeyRound className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold">Save Your Recovery Key</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This key is the only way to recover the owner account if you forget the passcode.
              Store it somewhere safe — it will not be shown again.
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="flex-1 text-center text-lg font-bold tracking-wider break-all">
                {recoveryKey}
              </code>
              <button
                onClick={handleCopyKey}
                className="shrink-0 rounded-md border border-input p-2 hover:bg-accent"
                title="Copy to clipboard"
              >
                {keyCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={keyAcknowledged}
              onChange={(e) => setKeyAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span className="text-sm">
              I have saved this recovery key in a safe place. I understand it will not be shown
              again.
            </span>
          </label>

          <button
            onClick={() => navigate("/")}
            disabled={!keyAcknowledged}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Continue to LanJAM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to LanJAM</h1>
          <p className="mt-2 text-muted-foreground">Create your admin account to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Display Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="passcode" className="text-sm font-medium">
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="At least 4 characters"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="text-sm font-medium">
              Confirm Passcode
            </label>
            <input
              id="confirm"
              type="password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              placeholder="Confirm passcode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
