import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

export function meta() {
  return [{ title: "Owner Recovery - LanJAM" }];
}

export default function OwnerRecoverPage() {
  const navigate = useNavigate();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPasscode !== confirmPasscode) {
      setError("Passcodes do not match");
      return;
    }
    if (newPasscode.length < 4) {
      setError("Passcode must be at least 4 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/owner/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryKey: recoveryKey.trim(), newPasscode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Recovery failed");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <KeyRound className="h-8 w-8 text-green-500" />
          </div>
          <h1 className="text-xl font-bold">Passcode Reset</h1>
          <p className="text-sm text-muted-foreground">
            Your owner passcode has been updated. You can now log in with your new passcode.
          </p>
          <button
            onClick={() => navigate("/owner")}
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-6 text-sm font-medium text-white hover:bg-red-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <KeyRound className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold">Recovery Key</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your recovery key to reset the owner passcode
          </p>
        </div>

        <form onSubmit={handleRecover} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="recoveryKey" className="text-sm font-medium">
              Recovery Key
            </label>
            <input
              id="recoveryKey"
              type="text"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXX"
              autoFocus
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="newPasscode" className="text-sm font-medium">
              New Passcode
            </label>
            <input
              id="newPasscode"
              type="password"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              placeholder="At least 4 characters"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPasscode" className="text-sm font-medium">
              Confirm Passcode
            </label>
            <input
              id="confirmPasscode"
              type="password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              placeholder="Confirm passcode"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !recoveryKey || !newPasscode || !confirmPasscode}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Recovering..." : "Reset Passcode"}
          </button>
        </form>

        <div className="text-center">
          <Link
            to="/owner"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Owner Login
          </Link>
        </div>
      </div>
    </div>
  );
}
