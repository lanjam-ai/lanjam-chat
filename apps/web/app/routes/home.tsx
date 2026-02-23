import { AlertTriangle, Lock, RefreshCw, User } from "lucide-react";
import { useState } from "react";
import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { SplashScreen } from "~/components/splash-screen.js";
import { applyTheme } from "~/hooks/use-theme.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "LanJAM" }];
}

interface PublicUser {
  id: string;
  name: string;
  is_disabled: boolean;
}

export async function loader({ request }: Route.LoaderArgs) {
  // Check service health first — if DB is unreachable, show a friendly page
  try {
    const healthRes = await callApi(request, "/api/status");
    if (healthRes.ok) {
      const { services } = await healthRes.json();
      if (!services.database) {
        return { servicesDown: true, users: [] as PublicUser[] };
      }
    }
  } catch {
    return { servicesDown: true, users: [] as PublicUser[] };
  }

  // Check if setup is needed
  const setupRes = await callApi(request, "/api/setup/status");
  if (!setupRes.ok) {
    return { servicesDown: true, users: [] as PublicUser[] };
  }
  const setupData = await setupRes.json();
  if (setupData.needsSetup) {
    throw new Response(null, { status: 302, headers: { Location: "/setup" } });
  }

  // Check if already authenticated
  const meRes = await callApi(request, "/api/auth/me");
  if (meRes.ok) {
    const url = new URL(request.url);
    const redirect = url.searchParams.get("redirect");
    const target = redirect && redirect.startsWith("/") ? redirect : "/chats";
    throw new Response(null, { status: 302, headers: { Location: target } });
  }

  // Get public users
  const usersRes = await callApi(request, "/api/users/public");
  if (!usersRes.ok) {
    return { servicesDown: true, users: [] as PublicUser[] };
  }
  const { users }: { users: PublicUser[] } = await usersRes.json();

  return { servicesDown: false, users };
}

export default function HomePage() {
  const { users, servicesDown } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showSplash, setShowSplash] = useState(!servicesDown);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (servicesDown) {
    return <ServicesDownPage />;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id, passcode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Login failed");
        return;
      }

      const { user } = await res.json();
      applyTheme(user.ui_theme ?? "system");
      const redirect = searchParams.get("redirect");
      navigate(redirect && redirect.startsWith("/") ? redirect : "/chats");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function closeDialog() {
    setSelectedUser(null);
    setPasscode("");
    setError("");
  }

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">LanJAM</h1>
            <p className="mt-2 text-muted-foreground">Who's chatting?</p>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-4">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => !user.is_disabled && setSelectedUser(user)}
                  disabled={user.is_disabled}
                  className={`flex w-36 flex-col items-center gap-3 rounded-xl border p-6 transition-all ${
                    user.is_disabled
                      ? "cursor-not-allowed border-border/50 opacity-50"
                      : "border-border hover:border-primary hover:bg-primary/5 hover:shadow-md hover:shadow-primary/10"
                  }`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-8 w-8" />
                  </div>
                  <span className="text-sm font-medium">{user.name}</span>
                  {user.is_disabled && (
                    <span className="text-xs text-muted-foreground">Disabled</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Owner Recovery Link */}
        <div className="text-center pt-4">
          <Link
            to="/owner"
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Owner Recovery Console
          </Link>
        </div>

        {/* Passcode Dialog */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">{selectedUser.name}</h2>
                  <p className="text-sm text-muted-foreground">Enter your passcode</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Passcode"
                  autoFocus
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !passcode}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {loading ? "..." : "Login"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ServicesDownPage() {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    // Small delay so the user sees the spinner
    await new Promise((r) => setTimeout(r, 500));
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Services Unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            LanJAM cannot connect to its backend services. This usually means the Docker containers
            are not running.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-left">
          <p className="text-sm font-medium mb-2">To fix this:</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Make sure Docker Desktop is running</li>
            <li>
              Start the containers:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                docker compose up -d
              </code>
            </li>
            <li>Wait a few seconds for services to start</li>
            <li>Click retry below</li>
          </ol>
        </div>

        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Retrying..." : "Retry Connection"}
        </button>
      </div>
    </div>
  );
}
