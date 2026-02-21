import { AlertTriangle, Info, Loader2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { toast } from "sonner";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/safety";

export function meta() {
  return [{ title: "Safety - Admin - LanJAM" }];
}

interface SafetyRule {
  id: string | null;
  type: string;
  content: string;
  previous_content: string | null;
  is_default: boolean;
  has_previous: boolean;
  updated_at: string | null;
}

const LABELS: Record<string, { title: string; description: string }> = {
  child: {
    title: "Children (Under 13)",
    description: "Always applied for users with the Child role. Cannot be disabled by the user.",
  },
  teen: {
    title: "Teenagers (13-16)",
    description: "Always applied for users with the Teen role. Cannot be disabled by the user.",
  },
  adult: {
    title: "Adult (Optional)",
    description:
      "Adults can opt in via their profile settings or enable it per conversation before sending any messages.",
  },
};

export async function loader({ request }: Route.LoaderArgs) {
  const meRes = await callApi(request, "/api/auth/me");
  const { user } = await meRes.json();
  if (user.role !== "admin")
    throw new Response(null, { status: 302, headers: { Location: "/chats" } });

  const rulesRes = await callApi(request, "/api/admin/safety/rules");
  const { rules }: { rules: SafetyRule[] } = rulesRes.ok ? await rulesRes.json() : { rules: [] };

  return { user, rules };
}

export default function AdminSafetyPage() {
  const { rules: initialRules } = useLoaderData<typeof loader>();
  const [rules, setRules] = useState(initialRules);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    action: "revert" | "reset";
  } | null>(null);

  function getContent(type: string) {
    return editedContent[type] ?? rules.find((r) => r.type === type)?.content ?? "";
  }

  function isEdited(type: string) {
    const original = rules.find((r) => r.type === type)?.content ?? "";
    return editedContent[type] !== undefined && editedContent[type] !== original;
  }

  async function refreshRules() {
    const res = await fetch("/api/admin/safety/rules");
    if (res.ok) {
      const { rules: updated } = await res.json();
      setRules(updated);
    }
  }

  async function handleSave(type: string) {
    setSaving(type);
    try {
      const res = await fetch(`/api/admin/safety/rules/${type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: getContent(type) }),
      });
      if (res.ok) {
        await refreshRules();
        setEditedContent((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        toast.success("Safety rule updated");
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to save");
      }
    } finally {
      setSaving(null);
    }
  }

  async function handleRevert(type: string) {
    setConfirmAction(null);
    setSaving(type);
    try {
      const res = await fetch(`/api/admin/safety/rules/${type}/revert`, { method: "POST" });
      if (res.ok) {
        await refreshRules();
        setEditedContent((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        toast.success("Reverted to previous version");
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to revert");
      }
    } finally {
      setSaving(null);
    }
  }

  async function handleReset(type: string) {
    setConfirmAction(null);
    setSaving(type);
    try {
      const res = await fetch(`/api/admin/safety/rules/${type}/reset`, { method: "POST" });
      if (res.ok) {
        await refreshRules();
        setEditedContent((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        toast.success("Reset to default");
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to reset");
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
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
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Safety
          </Link>
        </div>

        {/* Info banner */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Changes to safety rules only affect new conversations. Existing conversations will keep
            their current safety content.
          </p>
        </div>

        {/* Rule cards */}
        <div className="space-y-6">
          {["child", "teen", "adult"].map((type) => {
            const rule = rules.find((r) => r.type === type);
            const label = LABELS[type];
            return (
              <div key={type} className="rounded-lg border border-border p-6 space-y-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">{label.title}</h3>
                    {rule?.is_default && (
                      <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        Using defaults
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{label.description}</p>
                </div>

                <textarea
                  value={getContent(type)}
                  onChange={(e) =>
                    setEditedContent((prev) => ({ ...prev, [type]: e.target.value }))
                  }
                  rows={8}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSave(type)}
                    disabled={!isEdited(type) || saving === type}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {saving === type ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type, action: "revert" })}
                    disabled={!rule?.has_previous || saving === type}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Revert to Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type, action: "reset" })}
                    disabled={rule?.is_default || saving === type}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to Default
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="font-semibold">
                {confirmAction.action === "revert" ? "Revert Safety Rule" : "Reset to Default"}
              </h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              {confirmAction.action === "revert"
                ? "Are you sure you want to revert to the previous version? The current content will become the previous version."
                : "Are you sure you want to reset this rule to its default content? Your current content will be saved as the previous version."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  confirmAction.action === "revert"
                    ? handleRevert(confirmAction.type)
                    : handleReset(confirmAction.type)
                }
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {confirmAction.action === "revert" ? "Revert" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
