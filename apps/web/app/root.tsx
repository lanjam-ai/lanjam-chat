import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { LinksFunction } from "react-router";
import { Toaster } from "sonner";
import { applyTheme } from "~/hooks/use-theme.js";
import { callApi } from "~/server/api.js";
import stylesheet from "./app.css?url";
import type { Route } from "./+types/root";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const meRes = await callApi(request, "/api/auth/me");
    if (meRes.ok) {
      const { user } = await meRes.json();
      return { theme: (user.ui_theme as "light" | "dark" | "system") ?? "system" };
    }
  } catch {}
  return { theme: "system" as const };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Toaster richColors position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { theme } = useLoaderData<typeof loader>();

  // Apply theme on every navigation (loader re-runs, returning the current user's theme)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for OS preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message =
    "An unexpected error occurred. This may be because the backend services are not running.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Page not found";
      message = "The page you're looking for doesn't exist.";
    } else if (error.status >= 500) {
      title = "Server error";
      message =
        "LanJAM encountered a server error. Make sure the Docker containers are running and try again.";
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-8 w-8 text-destructive"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-left">
          <p className="text-sm font-medium mb-2">Try these steps:</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Make sure Docker Desktop is running</li>
            <li>
              Start the containers:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                docker compose up -d
              </code>
            </li>
            <li>Wait a few seconds, then click retry</li>
          </ol>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
