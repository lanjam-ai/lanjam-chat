import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowUp,
  ChevronDown,
  Filter,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { AiDisclaimerModal } from "~/components/ai-disclaimer-modal.js";
import { ConfirmModal } from "~/components/confirm-modal.js";
import { ModelSelector, type AvailableModel } from "~/components/model-selector.js";
import { VoiceOverlay } from "~/components/voice-overlay.js";
import { useVoiceRecording } from "~/hooks/use-voice-recording.js";
import {
  FILE_INPUT_ACCEPT,
  getSupportedFileTypesDescription,
  partitionFilesBySupport,
} from "~/lib/file-validation.js";
import { waitForExtraction } from "~/lib/wait-for-extraction.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/chats";

export function meta() {
  return [{ title: "Conversations - LanJAM" }];
}

interface ConversationTag {
  id: string;
  name: string;
}

interface ConversationGroup {
  id: string;
  name: string;
  guidance_text: string | null;
  conversation_count: number;
}

interface Conversation {
  id: string;
  title: string;
  is_archived: boolean;
  updated_at: string;
  group_id: string | null;
  group_name: string | null;
  tags: ConversationTag[];
}

interface SearchResult {
  id: string;
  title: string;
  is_archived: boolean;
  updated_at: string;
  snippet: string | null;
  relevance: number;
}

interface AuthUser {
  id: string;
  name: string;
  role: string;
  ui_theme: string;
}

type ScopeMode = "none" | "topic";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightSnippet(snippet: string, query: string): string {
  const clean = snippet.replace(/\*\*/g, "");
  const escaped = escapeHtml(clean);
  if (!query.trim()) return escaped;
  const pattern = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return escaped.replace(new RegExp(`(${pattern})`, "gi"), "<mark>$1</mark>");
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const isArchived = url.searchParams.get("archived") === "true";

  const [meRes, convRes, modelsRes, tagsRes, groupsRes] = await Promise.all([
    callApi(request, "/api/auth/me"),
    callApi(
      request,
      isArchived ? "/api/conversations?archived=true" : "/api/conversations?ungrouped=true",
    ),
    callApi(request, "/api/models"),
    callApi(request, "/api/tags"),
    callApi(request, "/api/groups"),
  ]);

  const { user }: { user: AuthUser } = meRes.ok
    ? await meRes.json()
    : { user: { id: "", name: "", role: "adult", ui_theme: "system" } };

  const { conversations }: { conversations: Conversation[] } = convRes.ok
    ? await convRes.json()
    : { conversations: [] };

  const modelsData = modelsRes.ok
    ? await modelsRes.json()
    : { models: [], active: null, acknowledgedModelIds: [] };
  const availableModels = modelsData.models as AvailableModel[];
  const activeModel = modelsData.active as AvailableModel | null;
  const acknowledgedModelIds = (modelsData.acknowledgedModelIds ?? []) as string[];

  const { tags: userTags }: { tags: ConversationTag[] } = tagsRes.ok
    ? await tagsRes.json()
    : { tags: [] };

  const { groups }: { groups: ConversationGroup[] } = groupsRes.ok
    ? await groupsRes.json()
    : { groups: [] };

  return {
    user,
    conversations,
    availableModels,
    activeModel,
    acknowledgedModelIds,
    userTags,
    groups,
    isArchived,
  };
}

export default function ChatsPage() {
  const {
    user,
    conversations: initialConversations,
    availableModels,
    activeModel,
    acknowledgedModelIds: initialAcknowledgedModelIds,
    userTags: initialUserTags,
    groups: initialGroups,
    isArchived: initialIsArchived,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState(initialConversations);
  const [isArchivedView, setIsArchivedView] = useState(initialIsArchived);

  // Re-sync when loader data changes (e.g. client-side navigation)
  useEffect(() => {
    setIsArchivedView(initialIsArchived);
    setConversations(initialConversations);
  }, [initialIsArchived]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingInput, setPendingInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  // Scope state: "none" = ungrouped conversations, "topic" = specific topic
  const [scope, setScope] = useState<ScopeMode>("none");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  // Groups & tags state
  const [groups, setGroups] = useState(initialGroups);
  const [userTags, setUserTags] = useState(initialUserTags);
  const [activeTagNames, setActiveTagNames] = useState<Set<string>>(new Set());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTopicSidebar, setShowTopicSidebar] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConversationGroup | null>(null);
  const [groupFormName, setGroupFormName] = useState("");
  const [groupFormGuidance, setGroupFormGuidance] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);

  // AI disclaimer state
  const [acknowledgedModelIds, setAcknowledgedModelIds] = useState<Set<string>>(
    () => new Set(initialAcknowledgedModelIds),
  );
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(
    activeModel ?? (availableModels.length > 0 ? availableModels[0] : null),
  );

  // Bulk selection
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const voicePrefixRef = useRef("");
  const voice = useVoiceRecording({
    onTranscript: (text) => {
      const prefix = voicePrefixRef.current;
      setPendingInput(prefix ? `${prefix} ${text}` : text);
    },
  });

  // Determine if we're in "filtering mode" (search or tags active)
  const isFiltering = search.trim().length > 0 || activeTagNames.size > 0;

  // Get active topic object
  const activeTopic = activeTopicId ? (groups.find((g) => g.id === activeTopicId) ?? null) : null;

  // Scope display text
  const scopeLabel = scope === "topic" && activeTopic ? `Topic: ${activeTopic.name}` : "No topic";

  // Debounced full-text search via API
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/conversations?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (!pendingInput) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }

    const prevH = el.style.height;
    const prevMinH = el.style.minHeight;
    el.style.minHeight = "0px";
    el.style.height = "0px";
    const scrollH = el.scrollHeight;
    el.style.minHeight = prevMinH;
    el.style.height = prevH;

    const currentH = el.offsetHeight;
    const maxH = window.matchMedia("(min-width: 768px)").matches ? 200 : 136;

    if (scrollH > currentH) {
      const newH = Math.min(scrollH, maxH);
      el.style.height = `${newH}px`;
      el.style.overflowY = newH >= maxH ? "auto" : "hidden";
    }
  }, [pendingInput]);

  // Close topic sidebar on outside click
  const topicSidebarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTopicSidebar) return;
    function handleClick(e: MouseEvent) {
      if (topicSidebarRef.current && !topicSidebarRef.current.contains(e.target as Node)) {
        setShowTopicSidebar(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTopicSidebar]);

  // Query param persistence
  useEffect(() => {
    const params = new URLSearchParams();
    if (isArchivedView) params.set("archived", "true");
    if (scope !== "none") params.set("scope", scope);
    if (activeTopicId) params.set("topicId", activeTopicId);
    if (search.trim()) params.set("q", search.trim());
    for (const name of activeTagNames) params.append("tags", name);
    if (editMode) params.set("mode", "edit");
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [scope, activeTopicId, search, activeTagNames, editMode, isArchivedView]);

  // Re-fetch conversations when scope/group/tag filters change
  const fetchConversations = useCallback(async () => {
    const params = new URLSearchParams();

    if (isArchivedView) {
      params.set("archived", "true");
    } else if (isFiltering) {
      // In filtering mode: search/tags across ALL conversations (no scope filter)
      for (const name of activeTagNames) params.append("tag", name);
    } else {
      // In browsing mode: respect scope
      if (scope === "topic" && activeTopicId) {
        params.set("group", activeTopicId);
      } else {
        params.set("ungrouped", "true");
      }
    }

    const qs = params.toString();
    try {
      const res = await fetch(`/api/conversations${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch {}
  }, [scope, activeTopicId, activeTagNames, isFiltering, isArchivedView]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Selection helpers
  function exitEditMode() {
    setEditMode(false);
    setSelectedIds(new Set());
  }
  function selectAll() {
    setSelectedIds(new Set(conversations.map((c) => c.id)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch {}
    }
    setConversations((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
    setEditMode(false);
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_archived: true }),
        });
      } catch {}
    }
    setConversations((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setEditMode(false);
  }

  async function handleUnarchive(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: false }),
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  }

  // Bulk add to group
  const [showBulkGroupMenu, setShowBulkGroupMenu] = useState(false);
  const bulkGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBulkGroupMenu) return;
    function handleClick(e: MouseEvent) {
      if (bulkGroupRef.current && !bulkGroupRef.current.contains(e.target as Node)) {
        setShowBulkGroupMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showBulkGroupMenu]);

  async function handleBulkAddToGroup(groupId: string | null) {
    setShowBulkGroupMenu(false);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: groupId }),
        });
      } catch {}
    }
    // Re-fetch to reflect changes
    await fetchConversations();
    setSelectedIds(new Set());
    setEditMode(false);
  }

  // Topic selection
  function selectTopic(groupId: string) {
    setScope("topic");
    setActiveTopicId(groupId);
    setShowTopicSidebar(false);
    // Clear search/tags when switching topics in browse mode
    setSearch("");
    setActiveTagNames(new Set());
    setShowTagPanel(false);
  }

  function selectNoTopic() {
    setScope("none");
    setActiveTopicId(null);
    setShowTopicSidebar(false);
    setSearch("");
    setActiveTagNames(new Set());
    setShowTagPanel(false);
  }

  // Toggle tag panel — toggling off also clears selected tags
  function toggleTagPanel() {
    if (showTagPanel) {
      setShowTagPanel(false);
      setActiveTagNames(new Set());
    } else {
      setShowTagPanel(true);
    }
  }

  // Group management
  function openCreateGroup() {
    setEditingGroup(null);
    setGroupFormName("");
    setGroupFormGuidance("");
    setShowGroupModal(true);
  }

  function openEditGroup(g: ConversationGroup) {
    setEditingGroup(g);
    setGroupFormName(g.name);
    setGroupFormGuidance(g.guidance_text ?? "");
    setShowGroupModal(true);
  }

  async function handleSaveGroup() {
    if (!groupFormName.trim()) return;
    setGroupSaving(true);
    try {
      if (editingGroup) {
        const res = await fetch(`/api/groups/${editingGroup.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: groupFormName.trim(),
            guidance_text: groupFormGuidance.trim() || null,
          }),
        });
        if (res.ok) {
          const { group } = await res.json();
          setGroups((prev) => prev.map((g) => (g.id === group.id ? group : g)));
        }
      } else {
        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: groupFormName.trim(),
            guidance_text: groupFormGuidance.trim() || undefined,
          }),
        });
        if (res.ok) {
          const { group } = await res.json();
          setGroups((prev) => [...prev, group]);
        }
      }
      setShowGroupModal(false);
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (res.ok) {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (activeTopicId === groupId) {
        setScope("none");
        setActiveTopicId(null);
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const { supported, unsupported } = partitionFilesBySupport(Array.from(fileList));
      if (unsupported.length > 0) {
        const names = unsupported.map((f) => f.name).join(", ");
        setFileErrors([
          `Unsupported file${unsupported.length > 1 ? "s" : ""}: ${names}. ${getSupportedFileTypesDescription()}`,
        ]);
      }
      if (supported.length > 0) {
        setSelectedFiles((prev) => [...prev, ...supported]);
      }
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function maybeShowDisclaimer() {
    const model = selectedModel;
    if (model && !acknowledgedModelIds.has(model.id)) {
      setShowDisclaimerModal(true);
      return;
    }
    handleSendFromHome();
  }

  async function handleAcknowledge() {
    const model = selectedModel;
    if (!model) return;

    try {
      await fetch(`/api/models/${model.id}/acknowledge`, { method: "POST" });
    } catch {}

    setAcknowledgedModelIds((prev) => new Set(prev).add(model.id));
    setShowDisclaimerModal(false);
    handleSendFromHome();
  }

  function handleDisclaimerCancel() {
    setShowDisclaimerModal(false);
  }

  async function handleSendFromHome() {
    const content = pendingInput.trim();
    if (!content && selectedFiles.length === 0) return;
    if (creating) return;

    setCreating(true);
    try {
      // In browsing mode, associate new conversation with active topic
      const groupId =
        !isFiltering && scope === "topic" && activeTopicId ? activeTopicId : undefined;

      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!res.ok) return;
      const { conversation: conv } = await res.json();

      const fileIds: string[] = [];
      for (const file of selectedFiles) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const uploadRes = await fetch(`/api/conversations/${conv.id}/files`, {
            method: "POST",
            body: formData,
          });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            if (data.file?.id) fileIds.push(data.file.id);
          }
        } catch {}
      }

      if (fileIds.length > 0) {
        await waitForExtraction(conv.id);
      }

      if (content) {
        const pending: Record<string, unknown> = { content, fileIds };
        if (selectedModel) {
          pending.modelName = selectedModel.name;
          pending.modelHost = selectedModel.host;
        }
        sessionStorage.setItem(`pendingChat:${conv.id}`, JSON.stringify(pending));
      }
      navigate(`/chats/${conv.id}`);
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      maybeShowDisclaimer();
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Page content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {/* No models notice */}
          {availableModels.length === 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  No AI models available
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {user.role === "admin" ? (
                    <>
                      No AI models installed. Go to{" "}
                      <Link to="/admin/llm" className="underline font-medium">
                        Admin &gt; AI Models
                      </Link>{" "}
                      to set one up.
                    </>
                  ) : (
                    "An administrator must install or connect a model before you can chat."
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Page heading */}
          {isArchivedView ? (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <Archive className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-300">
                Archived Conversations
              </h2>
            </div>
          ) : (
            <h2 className="mb-3 text-lg font-semibold">Conversations</h2>
          )}

          {/* Top bar: [Search...] [Topic] [Filter] [Edit] */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isArchivedView ? "Search archived..." : "Search conversations..."}
                className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!isArchivedView && (
              <>
                <button
                  type="button"
                  onClick={() => setShowTopicSidebar(!showTopicSidebar)}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                    showTopicSidebar || scope === "topic"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Topics"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleTagPanel}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                    showTagPanel
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Filter by tags"
                >
                  <Filter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (editMode ? exitEditMode() : setEditMode(true))}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                    editMode
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title={editMode ? "Done editing" : "Edit"}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Scope display / filtering helper */}
          {isArchivedView ? null : isFiltering ? (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground italic">
                Showing results across all conversations
              </p>
            </div>
          ) : scope === "topic" && activeTopic ? (
            <div className="mb-3 flex items-center gap-2 min-w-0">
              <FolderOpen className="h-5 w-5 shrink-0 text-foreground" />
              <h2
                className="flex-1 min-w-0 truncate text-lg font-semibold"
                title={activeTopic.name}
              >
                {activeTopic.name}
              </h2>
              <button
                type="button"
                onClick={() => openEditGroup(activeTopic)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Edit topic"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {/* Tag filter chips */}
          {showTagPanel && !isArchivedView && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {userTags.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No tags yet. Create tags from a conversation.
                </p>
              ) : (
                userTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setActiveTagNames((prev) => {
                        const next = new Set(prev);
                        if (next.has(tag.name)) next.delete(tag.name);
                        else next.add(tag.name);
                        return next;
                      })
                    }
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      activeTagNames.has(tag.name)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    <Tag className="h-3 w-3" />
                    {tag.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selection controls (edit mode only) */}
          {editMode && !isArchivedView && conversations.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Select All
              </button>
              <span className="text-xs text-muted-foreground">|</span>
              <button
                type="button"
                onClick={selectNone}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                None
              </button>
            </div>
          )}

          {/* Bulk action bar (edit mode only) */}
          {editMode && !isArchivedView && selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 rounded-lg border border-border bg-secondary/50 px-4 py-2.5">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              <button
                type="button"
                onClick={handleBulkArchive}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
              <div ref={bulkGroupRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowBulkGroupMenu(!showBulkGroupMenu)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add to Topic
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showBulkGroupMenu && (
                  <div className="absolute right-0 bottom-full mb-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-lg z-20">
                    <button
                      type="button"
                      onClick={() => handleBulkAddToGroup(null)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      Remove from topic
                    </button>
                    {groups.length > 0 && <div className="my-1 border-t border-border" />}
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleBulkAddToGroup(g.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                      >
                        {g.name}
                      </button>
                    ))}
                    {groups.length === 0 && (
                      <p className="px-3 py-1.5 text-xs text-muted-foreground italic">
                        No topics yet
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversation list */}
          {search && searchResults !== null ? (
            // Search results view
            searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {isSearching ? "Searching..." : "No matches found"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {searchResults.map((result) => (
                  <Link
                    key={result.id}
                    to={`/chats/${result.id}`}
                    className="block rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm font-medium">
                        {result.title || "New Conversation"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(result.updated_at)}
                      </span>
                    </div>
                    {result.snippet && (
                      <p
                        className="mt-1 ml-7 text-xs text-muted-foreground line-clamp-2 [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                        dangerouslySetInnerHTML={{
                          __html: highlightSnippet(result.snippet, search),
                        }}
                      />
                    )}
                  </Link>
                ))}
              </div>
            )
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {isArchivedView
                  ? "No archived conversations"
                  : isFiltering
                    ? "No conversations match the current filters"
                    : scope === "topic" && activeTopic
                      ? `No conversations in "${activeTopic.name}" yet`
                      : "No conversations yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  {editMode && !isArchivedView && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(conv.id)}
                      onChange={() => toggleSelect(conv.id)}
                      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                  )}
                  <Link to={`/chats/${conv.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      {!editMode && (
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-sm font-medium">
                        {conv.title || "New Conversation"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(conv.updated_at)}
                      </span>
                    </div>
                    {!isArchivedView &&
                      (conv.tags.length > 0 || (isFiltering && conv.group_name)) && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${editMode ? "" : "ml-7"}`}>
                          {isFiltering && conv.group_name && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              <FolderOpen className="h-2.5 w-2.5" />
                              {conv.group_name}
                            </span>
                          )}
                          {conv.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                  </Link>
                  {isArchivedView && (
                    <button
                      type="button"
                      onClick={() => handleUnarchive(conv.id)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Restore conversation"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom composer */}
      {!isArchivedView && (
        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto max-w-3xl">
            {/* File type error banner */}
            {fileErrors.length > 0 && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  {fileErrors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFileErrors([])}
                  className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Selected file chips */}
            {selectedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedFiles.map((file, i) => (
                  <div
                    key={`upload-${i}`}
                    className="flex items-center gap-1.5 rounded-md border bg-secondary px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Composer container */}
            <div
              className={`rounded-2xl border border-input bg-background dark:bg-[#232840] ${availableModels.length === 0 ? "opacity-50 pointer-events-none" : ""}`}
            >
              <textarea
                ref={textareaRef}
                value={pendingInput}
                onChange={(e) => setPendingInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  availableModels.length === 0
                    ? "No models available..."
                    : "Type a message to start a new chat..."
                }
                rows={1}
                disabled={creating || availableModels.length === 0}
                className="w-full min-h-[36px] md:min-h-[76px] resize-none overflow-hidden border-0 bg-transparent px-4 pt-3 pb-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={FILE_INPUT_ACCEPT}
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={creating}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                    title="Attach file"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      voicePrefixRef.current = pendingInput.trim();
                      setVoiceOverlayOpen(true);
                      await voice.startRecording();
                    }}
                    disabled={creating || voiceOverlayOpen}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                    title="Voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  {/* Model selector */}
                  <ModelSelector
                    models={availableModels}
                    selected={selectedModel}
                    onSelect={setSelectedModel}
                  />
                </div>
                <button
                  type="button"
                  onClick={maybeShowDisclaimer}
                  disabled={creating || (!pendingInput.trim() && selectedFiles.length === 0)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topic sidebar overlay */}
      {showTopicSidebar && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/30" />
          {/* Sidebar panel */}
          <div
            ref={topicSidebarRef}
            className="fixed right-0 top-0 z-50 flex h-full w-72 flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-200"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Topics</h2>
              <button
                type="button"
                onClick={() => setShowTopicSidebar(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {/* "No topic" option */}
              <button
                type="button"
                onClick={selectNoTopic}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  scope === "none"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>No topic</span>
              </button>

              {/* Divider */}
              {groups.length > 0 && <div className="my-2 mx-4 border-t border-border" />}

              {/* Topic list */}
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectTopic(g.id)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    scope === "topic" && activeTopicId === g.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{g.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {g.conversation_count}
                  </span>
                </button>
              ))}
            </div>
            {/* Create topic button */}
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => {
                  setShowTopicSidebar(false);
                  openCreateGroup();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Topic
              </button>
            </div>
          </div>
        </>
      )}

      {/* AI disclaimer modal */}
      <AiDisclaimerModal
        open={showDisclaimerModal}
        modelName={selectedModel?.name ?? "this AI model"}
        onAcknowledge={handleAcknowledge}
        onCancel={handleDisclaimerCancel}
      />

      {/* Bulk delete confirmation */}
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title="Delete Conversations"
        message={`${selectedIds.size} conversation${selectedIds.size > 1 ? "s" : ""} will be deleted. This cannot be undone.`}
        confirmLabel={bulkDeleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {/* Voice recording overlay */}
      {voiceOverlayOpen && (
        <VoiceOverlay
          isRecording={voice.isRecording}
          isPaused={voice.isPaused}
          isTranscribing={voice.isTranscribing}
          error={voice.error}
          stream={voice.stream}
          transcript={pendingInput}
          onPause={voice.pauseRecording}
          onResume={voice.resumeRecording}
          onCancel={() => {
            voice.cancelRecording();
            setVoiceOverlayOpen(false);
            setPendingInput(voicePrefixRef.current);
          }}
          onClear={() => {
            voice.clearRecording();
            setPendingInput(voicePrefixRef.current);
          }}
          onClose={() => {
            voice.stopRecording();
            setVoiceOverlayOpen(false);
          }}
          onSubmit={() => {
            voice.stopRecording();
            setVoiceOverlayOpen(false);
            maybeShowDisclaimer();
          }}
        />
      )}

      {/* Group create/edit modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="mb-4 font-semibold">{editingGroup ? "Edit Topic" : "Create Topic"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={groupFormName}
                  onChange={(e) => setGroupFormName(e.target.value)}
                  placeholder="e.g. Work, Study, Projects..."
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Guidance (optional)</label>
                <textarea
                  value={groupFormGuidance}
                  onChange={(e) => setGroupFormGuidance(e.target.value)}
                  placeholder="Optional: provide guidance for the AI when chatting in this topic..."
                  rows={3}
                  maxLength={2000}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  This text will be sent as a system prompt when chatting in this topic.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-6">
              {editingGroup && (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteGroup(editingGroup.id);
                    setShowGroupModal(false);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  Delete
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGroup}
                disabled={!groupFormName.trim() || groupSaving}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {groupSaving ? "Saving..." : editingGroup ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
