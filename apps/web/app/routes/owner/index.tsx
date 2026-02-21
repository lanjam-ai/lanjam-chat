import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: "Owner Login - LanJAM" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Redirect if already authenticated
  const meRes = await callApi(request, "/api/owner/me");
  if (meRes.ok) {
    throw new Response(null, { status: 302, headers: { Location: "/owner/console" } });
  }

  // Check if owner is initialized
  const statusRes = await callApi(request, "/api/owner/status");
  const { initialized } = await statusRes.json();

  return { initialized };
}

export default function OwnerLoginPage() {
  const { initialized } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Login failed");
        return;
      }

      navigate("/owner/console");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!initialized) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <KeyRound className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold">Owner Account Not Initialized</h1>
          <p className="text-sm text-muted-foreground">
            The owner recovery account has not been set up yet. An admin can initialize it from the
            Admin Dashboard.
          </p>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent"
          >
            Back to Login
          </Link>
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
          <h1 className="text-xl font-bold">Owner Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the owner passcode to access the recovery console
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Owner passcode"
            autoFocus
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !passcode}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "..." : "Login"}
          </button>
        </form>

        <div className="text-center">
          <Link
            to="/owner/recover"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot passcode? Use recovery key
          </Link>
        </div>
      </div>
    </div>
  );
}
