import {
  Archive,
  ChevronDown,
  CircleHelp,
  Download,
  Loader2,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLoaderData, useNavigate } from "react-router";
import { Logo } from "~/components/logo.js";
import { ActivityProvider, useActivity } from "~/hooks/use-activity.js";
import { applyTheme } from "~/hooks/use-theme.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/authenticated-layout";

type Theme = "light" | "dark" | "system";

interface AuthUser {
  id: string;
  name: string;
  role: string;
  ui_theme?: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  let meRes: Response;
  try {
    meRes = await callApi(request, "/api/auth/me");
  } catch {
    // Services likely down — redirect to home which shows a friendly message
    throw new Response(null, { status: 302, headers: { Location: "/" } });
  }
  if (!meRes.ok) {
    throw new Response(null, { status: 302, headers: { Location: "/" } });
  }
  const { user }: { user: AuthUser } = await meRes.json();
  return { user };
}

export default function AuthenticatedLayout() {
  return (
    <ActivityProvider>
      <LayoutShell />
    </ActivityProvider>
  );
}

function LayoutShell() {
  const { user } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>((user.ui_theme as Theme) ?? "system");

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  function cycleTheme() {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    applyTheme(next);
    // Persist to profile (fire-and-forget)
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui_theme: next }),
    }).catch(() => {});
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    applyTheme("system");
    navigate("/");
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Global header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        {/* Left: Logo */}
        <Link to="/chats" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Logo size={28} />
          <div className="flex items-baseline gap-0.5">
            <span className="text-base font-light tracking-wide text-muted-foreground">Lan</span>
            <span className="text-lg font-bold tracking-tight text-foreground">JAM</span>
          </div>
        </Link>

        {/* Right: Activity + Help + User dropdown */}
        <div className="flex items-center gap-1">
          <ActivityIndicator />
          <Link
            to="/help"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Help"
          >
            <CircleHelp className="h-4 w-4" />
          </Link>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium">{user.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-popover py-1 shadow-lg z-50">
                <Link
                  to="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  My Profile
                </Link>
                <Link
                  to="/chats"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  My Conversations
                </Link>
                <div className="my-1 border-t border-border" />
                <Link
                  to="/chats?archived=true"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                  Archive
                </Link>
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Admin
                  </Link>
                )}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity indicator — shows in header when background tasks are active
// ---------------------------------------------------------------------------

function ActivityIndicator() {
  const { tasks, hasActive } = useActivity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Auto-close when no tasks remain
  useEffect(() => {
    if (!hasActive) setOpen(false);
  }, [hasActive]);

  if (!hasActive) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Background activity"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
          {tasks.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border border-border bg-popover p-3 shadow-lg z-50">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Activity
          </p>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{task.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{task.status}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${task.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
