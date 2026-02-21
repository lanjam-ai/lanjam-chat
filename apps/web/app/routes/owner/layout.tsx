import { KeyRound } from "lucide-react";
import { Link, Outlet, useLoaderData } from "react-router";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if owner is authenticated
  const meRes = await callApi(request, "/api/owner/me");
  return { authenticated: meRes.ok };
}

export default function OwnerLayout() {
  const { authenticated } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-red-500/30 bg-card px-4">
        <Link to="/owner" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/10">
            <KeyRound className="h-4 w-4 text-red-500" />
          </div>
          <span className="text-sm font-semibold text-red-500">Owner Recovery Console</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to LanJAM
          </Link>
        </div>
      </header>

      <div className="flex-1">
        <Outlet context={{ authenticated }} />
      </div>
    </div>
  );
}
