import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowUp,
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldOff,
  Square,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { useLoaderData, useNavigate } from "react-router";
import remarkGfm from "remark-gfm";
import { AiDisclaimerModal } from "~/components/ai-disclaimer-modal.js";
import { ConfirmModal } from "~/components/confirm-modal.js";
import { ModelSelector, type AvailableModel } from "~/components/model-selector.js";
import { FilesModal } from "~/components/files-modal.js";
import { TitleEditModal } from "~/components/title-edit-modal.js";
import { VoiceOverlay } from "~/components/voice-overlay.js";
import { useVoiceRecording } from "~/hooks/use-voice-recording.js";
import {
  FILE_INPUT_ACCEPT,
  getSupportedFileTypesDescription,
  partitionFilesBySupport,
} from "~/lib/file-validation.js";
import { waitForExtraction } from "~/lib/wait-for-extraction.js";
import { callApi } from "~/server/api.js";
import type { Route } from "./+types/chats.$conversationId";

export function meta() {
  return [{ title: "Chat - LanJAM" }];
}

function PreBlock(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = ref.current?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative">
      <pre ref={ref} {...props} />
      <div className="absolute right-2 top-1 z-10 flex items-center gap-1.5">
        {copied && (
          <span className="inline-flex items-center rounded-md bg-emerald-500/20 backdrop-blur-sm px-2 py-1 text-[10px] font-medium text-emerald-400 copy-pill-in">
            Copied!
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={handleCopy}
          onKeyDown={(e) => e.key === "Enter" && handleCopy()}
          title={copied ? "Copied!" : "Copy code"}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-gray-400 backdrop-blur-sm transition-colors cursor-pointer hover:bg-white/20 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </div>
  );
}

const chatMarkdownComponents: Components = { pre: PreBlock };

interface MessageFile {
  id: string;
  original_filename: string;
  extractionFailed?: boolean;
}

interface MessageMetadata {
  total_duration_ns?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration_ns?: number;
  /** Persisted status for error/cancelled messages */
  status?: "error" | "cancelled";
  /** Error detail (persisted with error status) */
  error?: string;
}

interface MessageModel {
  name: string;
  host: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
  /** Client-only: marks this message as cancelled or errored */
  status?: "cancelled" | "error";
  /** Client-only: error detail text (shown on click) */
  errorDetail?: string;
  /** Files attached to this message */
  files?: MessageFile[];
  /** Model used for this response (assistant messages only) */
  model?: MessageModel | null;
  /** Response metadata from Ollama (assistant messages only) */
  metadata?: MessageMetadata | null;
  /** Version group ID for edited messages */
  version_group_id?: string | null;
  /** Version number within the group */
  version_number?: number;
}

interface AuthUser {
  id: string;
  name: string;
  role: string;
  safe_mode_enabled: boolean;
}

interface ConversationTag {
  id: string;
  name: string;
}

interface ConversationGroup {
  id: string;
  name: string;
  guidance_text: string | null;
}

interface Conversation {
  id: string;
  title: string;
  is_archived: boolean;
  user_id: string;
  safe_mode: boolean | null;
  safety_content: string | null;
  llm_model_id: string | null;
  group_id: string | null;
}

interface ConversationFile {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Rehype plugin: highlight search matches within markdown-rendered content
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function rehypeHighlightText(options: { query: string; activeIndex: number }) {
  return (tree: HastNode) => {
    const counter = { value: 0 };
    visitNodes(tree, options.query, options.activeIndex, counter);
  };
}

function visitNodes(
  node: HastNode,
  query: string,
  activeIndex: number,
  counter: { value: number },
) {
  if (!node.children) return;

  const newChildren: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value) {
      const parts = splitByQuery(child.value, query, activeIndex, counter);
      newChildren.push(...parts);
    } else {
      visitNodes(child, query, activeIndex, counter);
      newChildren.push(child);
    }
  }
  node.children = newChildren;
}

function splitByQuery(
  text: string,
  query: string,
  activeIndex: number,
  counter: { value: number },
): HastNode[] {
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(regex);

  return parts
    .filter((p) => p !== "")
    .map((part) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        const isActive = counter.value === activeIndex;
        counter.value++;
        return {
          type: "element",
          tagName: "mark",
          properties: { className: isActive ? ["search-active"] : undefined },
          children: [{ type: "text", value: part }],
        };
      }
      return { type: "text", value: part };
    });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [convRes, msgRes, meRes, filesRes, modelsRes, tagsRes, groupsRes, convTagsRes] =
    await Promise.all([
      callApi(request, `/api/conversations/${params.conversationId}`),
      callApi(request, `/api/conversations/${params.conversationId}/messages`),
      callApi(request, "/api/auth/me"),
      callApi(request, `/api/conversations/${params.conversationId}/files`),
      callApi(request, `/api/models?conversationId=${params.conversationId}`),
      callApi(request, "/api/tags"),
      callApi(request, "/api/groups"),
      callApi(request, `/api/conversations/${params.conversationId}/tags`),
    ]);

  if (!convRes.ok) {
    throw new Response(null, { status: 302, headers: { Location: "/chats" } });
  }

  const { conversation }: { conversation: Conversation } = await convRes.json();
  const { messages }: { messages: Message[] } = msgRes.ok ? await msgRes.json() : { messages: [] };
  const { user }: { user: AuthUser } = meRes.ok
    ? await meRes.json()
    : { user: { id: "", name: "", role: "adult", safe_mode_enabled: false } };
  const { files: conversationFiles }: { files: ConversationFile[] } = filesRes.ok
    ? await filesRes.json()
    : { files: [] };
  const modelsData = modelsRes.ok
    ? await modelsRes.json()
    : { models: [], active: null, conversationModel: null, acknowledgedModelIds: [] };

  const { tags: userTags }: { tags: ConversationTag[] } = tagsRes.ok
    ? await tagsRes.json()
    : { tags: [] };

  const { groups }: { groups: ConversationGroup[] } = groupsRes.ok
    ? await groupsRes.json()
    : { groups: [] };

  const { tags: conversationTags }: { tags: ConversationTag[] } = convTagsRes.ok
    ? await convTagsRes.json()
    : { tags: [] };

  return {
    conversation,
    messages,
    user,
    conversationFiles,
    availableModels: modelsData.models as AvailableModel[],
    activeModel: modelsData.active as AvailableModel | null,
    conversationModel: modelsData.conversationModel as AvailableModel | null,
    acknowledgedModelIds: (modelsData.acknowledgedModelIds ?? []) as string[],
    userTags,
    groups,
    conversationTags,
  };
}

/** Hydrate client-only status/errorDetail fields from persisted metadata. */
function hydrateMessageStatus(msgs: Message[]): Message[] {
  return msgs.map((m) => {
    if (m.role !== "assistant" || !m.metadata) return m;
    if (m.metadata.status === "error") {
      return { ...m, status: "error" as const, errorDetail: m.metadata.error };
    }
    if (m.metadata.status === "cancelled") {
      return { ...m, status: "cancelled" as const };
    }
    return m;
  });
}

export default function ConversationPage() {
  const {
    conversation: initialConv,
    messages: initialMessages,
    user,
    conversationFiles: initialFiles,
    availableModels: initialModels,
    activeModel: initialActiveModel,
    conversationModel: initialConvModel,
    acknowledgedModelIds: initialAcknowledgedModelIds,
    userTags: initialUserTags,
    groups: initialGroups,
    conversationTags: initialConvTags,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState(initialConv);
  const [messages, setMessages] = useState<Message[]>(hydrateMessageStatus(initialMessages));
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Model selection state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>(initialModels);
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(
    initialConvModel ?? initialActiveModel ?? initialModels[0] ?? null,
  );
  const [expandedMetadata, setExpandedMetadata] = useState<Set<string>>(new Set());
  const [metadataSheetMsg, setMetadataSheetMsg] = useState<(typeof messages)[number] | null>(null);
  const [streamContent, setStreamContent] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteExchangeConfirm, setShowDeleteExchangeConfirm] = useState(false);
  const [showDeleteLastChatConfirm, setShowDeleteLastChatConfirm] = useState(false);
  const [orphanDeleteMessageId, setOrphanDeleteMessageId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showSafeModeModal, setShowSafeModeModal] = useState<"disable" | "cannot-enable" | null>(
    null,
  );
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  // File management state
  const [conversationFiles, setConversationFiles] = useState<ConversationFile[]>(initialFiles);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);

  // Edit last Q&A
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // Version selection: version_group_id → selected version_number
  const [selectedVersions, setSelectedVersions] = useState<Map<string, number>>(new Map());

  // Title edit modal + 3-dot menu
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tags & groups
  const [userTags, setUserTags] = useState(initialUserTags);
  const [groups] = useState(initialGroups);
  const [convTags, setConvTags] = useState(initialConvTags);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  // Voice recording
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const voicePrefixRef = useRef("");
  const voice = useVoiceRecording({
    onTranscript: (text) => {
      const prefix = voicePrefixRef.current;
      setInput(prefix ? `${prefix} ${text}` : text);
    },
  });

  // AI disclaimer state
  const [acknowledgedModelIds, setAcknowledgedModelIds] = useState<Set<string>>(
    () => new Set(initialAcknowledgedModelIds),
  );
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [pendingSendArgs, setPendingSendArgs] = useState<{
    content?: string;
    fileIds?: string[];
    modelOverride?: AvailableModel;
    editMessageId?: string;
  } | null>(null);

  // Copy to clipboard
  const [copiedId, setCopiedId] = useState<string | null>(null);
  function handleCopy(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // Tag management
  async function handleToggleTag(tagId: string) {
    const isAssigned = convTags.some((t) => t.id === tagId);
    const newTagIds = isAssigned
      ? convTags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...convTags.map((t) => t.id), tagId];

    const res = await fetch(`/api/conversations/${conversation.id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: newTagIds }),
    });
    if (res.ok) {
      const { tags } = await res.json();
      setConvTags(tags);
    }
  }

  async function handleCreateAndAssignTag() {
    const name = newTagName.trim();
    if (!name) return;
    const createRes = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (createRes.ok) {
      const { tag } = await createRes.json();
      setUserTags((prev) => [...prev, tag]);
      setNewTagName("");
      // Assign to conversation
      const newTagIds = [...convTags.map((t) => t.id), tag.id];
      const res = await fetch(`/api/conversations/${conversation.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: newTagIds }),
      });
      if (res.ok) {
        const { tags } = await res.json();
        setConvTags(tags);
      }
    }
  }

  async function handleDeleteTag(tagId: string) {
    const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
    if (res.ok) {
      setUserTags((prev) => prev.filter((t) => t.id !== tagId));
      setConvTags((prev) => prev.filter((t) => t.id !== tagId));
    }
  }

  // Group assignment
  async function handleSetGroup(groupId: string | null) {
    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    if (res.ok) {
      const { conversation: updated } = await res.json();
      setConversation(updated);
    }
    setShowGroupDropdown(false);
  }

  // Close tag popover on outside click
  useEffect(() => {
    if (!showTagPopover) return;
    function handleClick(e: MouseEvent) {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setShowTagPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTagPopover]);

  // Close group dropdown on outside click
  useEffect(() => {
    if (!showGroupDropdown) return;
    function handleClick(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setShowGroupDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showGroupDropdown]);

  // Thinking timer — shows elapsed time after 10s of waiting
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const thinkingStartRef = useRef<number>(0);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startThinkingTimer = useCallback(() => {
    thinkingStartRef.current = Date.now();
    setThinkingSeconds(0);
    thinkingTimerRef.current = setInterval(() => {
      setThinkingSeconds(Math.floor((Date.now() - thinkingStartRef.current) / 1000));
    }, 1_000);
  }, []);

  const stopThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    setThinkingSeconds(0);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const pendingSentRef = useRef(false);
  const userScrolledRef = useRef(false);

  // In-chat message search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
  }

  // Keyboard shortcuts for search: Cmd+F / Ctrl+F to open, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        if (searchOpen) {
          searchInputRef.current?.focus();
        } else {
          openSearch();
        }
      }
      if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // Re-sync when loader data changes (navigation)
  useEffect(() => {
    setConversation(initialConv);
    setMessages(initialMessages);
    setConversationFiles(initialFiles);
    setAvailableModels(initialModels);
    setSelectedModel(initialConvModel ?? initialActiveModel ?? initialModels[0] ?? null);
    setExpandedMetadata(new Set());
    setStreamContent("");
    setIsStreaming(false);
    setInput("");
    setSelectedFiles([]);
    setAttachedFileIds([]);
    setUploadProgress(new Map());
    setIsUploading(false);
    setFileErrors([]);
    stopThinkingTimer();
    voice.cancelRecording();
    setVoiceOverlayOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
    setSelectedVersions(new Map());
    setEditingMessageId(null);
    setAcknowledgedModelIds(new Set(initialAcknowledgedModelIds));
    setShowDisclaimerModal(false);
    setPendingSendArgs(null);
  }, [initialConv.id]);

  // Close 3-dot menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  // Detect when user scrolls away from the bottom during streaming
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    function handleScroll() {
      const { scrollTop, scrollHeight, clientHeight } = container!;
      const atBottom = scrollHeight - scrollTop - clientHeight < 60;
      userScrolledRef.current = !atBottom;
    }

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom unless the user has scrolled up
  useEffect(() => {
    if (!userScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamContent]);

  // Auto-resize textarea: only grow, never shrink unless fully cleared
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (!input) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }

    // Temporarily collapse to measure true content height
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
  }, [input]);

  // Poll for extraction status when files are pending
  useEffect(() => {
    const hasPending = conversationFiles.some((f) => f.extraction_status === "pending");
    if (!hasPending) return;

    const interval = setInterval(() => {
      refreshConversationFiles();
    }, 2_000);

    return () => clearInterval(interval);
  }, [conversationFiles]);

  // Auto-send pending message from /chats home.
  // The pending content is stored in sessionStorage by handleSendFromHome.
  // We use setTimeout(0) so the page fully loads and all React state settles
  // before we call handleSend — which then runs exactly the same code path
  // as if the user typed the message and pressed Enter.
  useEffect(() => {
    const key = `pendingChat:${initialConv.id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;

    const timer = setTimeout(() => {
      sessionStorage.removeItem(key);
      try {
        const { content, fileIds, modelName, modelHost } = JSON.parse(raw);
        let modelOverride: AvailableModel | undefined;
        if (modelName) {
          const match = availableModels.find(
            (m) => m.name === modelName && m.host === (modelHost ?? null),
          );
          if (match) {
            setSelectedModel(match);
            modelOverride = match;
          }
        }
        if (content) {
          maybeShowDisclaimer(content, fileIds?.length > 0 ? fileIds : undefined, modelOverride);
        }
      } catch {}
    }, 0);

    return () => clearTimeout(timer);
  }, [initialConv.id]);

  async function refreshConversationFiles() {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/files`);
      if (res.ok) {
        const { files } = await res.json();
        setConversationFiles(files);
      }
    } catch {}
  }

  function uploadFileWithProgress(file: File, conversationId: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("file", file);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress((prev) => new Map(prev).set(file.name, pct));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.file?.id ?? null);
          } catch {
            resolve(null);
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));

      xhr.open("POST", `/api/conversations/${conversationId}/files`);
      xhr.send(formData);
    });
  }

  async function uploadFiles(conversationId: string): Promise<string[]> {
    setIsUploading(true);
    const progress = new Map<string, number>();
    for (const f of selectedFiles) {
      progress.set(f.name, 0);
    }
    setUploadProgress(progress);

    const ids: string[] = [];
    for (const file of selectedFiles) {
      try {
        const fileId = await uploadFileWithProgress(file, conversationId);
        if (fileId) ids.push(fileId);
      } catch (err) {
        console.error("File upload failed:", file.name, err);
      }
    }

    setSelectedFiles([]);
    setUploadProgress(new Map());
    setIsUploading(false);
    await refreshConversationFiles();
    return ids;
  }

  function toggleAttachFile(fileId: string) {
    setAttachedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId],
    );
  }

  function maybeShowDisclaimer(
    content?: string,
    fileIds?: string[],
    modelOverride?: AvailableModel,
    editMessageId?: string,
  ) {
    const model = modelOverride ?? selectedModel;
    if (model && !acknowledgedModelIds.has(model.id)) {
      setPendingSendArgs({ content, fileIds, modelOverride, editMessageId });
      setShowDisclaimerModal(true);
      return;
    }
    handleSend(content, fileIds, modelOverride, editMessageId);
  }

  async function handleAcknowledge() {
    const model = pendingSendArgs?.modelOverride ?? selectedModel;
    if (!model) return;

    try {
      await fetch(`/api/models/${model.id}/acknowledge`, { method: "POST" });
    } catch {}

    setAcknowledgedModelIds((prev) => new Set(prev).add(model.id));
    setShowDisclaimerModal(false);

    const args = pendingSendArgs;
    setPendingSendArgs(null);
    if (args) {
      handleSend(args.content, args.fileIds, args.modelOverride, args.editMessageId);
    }
  }

  function handleDisclaimerCancel() {
    setShowDisclaimerModal(false);
    setPendingSendArgs(null);
  }

  async function handleSend(
    overrideContent?: string,
    overrideFileIds?: string[],
    modelOverride?: AvailableModel,
    editMessageId?: string,
  ) {
    const content = (overrideContent ?? input).trim();
    if (!content && selectedFiles.length === 0) return;
    if (isStreaming) return;

    // Upload new files first if any
    let newFileIds: string[] = [];
    if (selectedFiles.length > 0) {
      newFileIds = await uploadFiles(conversation.id);
    }

    // Combine override file IDs (from auto-send), attached file IDs (from sidebar), and new upload IDs
    const messageFileIds = [...(overrideFileIds ?? attachedFileIds), ...newFileIds];

    // Wait for extraction to complete on attached files
    if (messageFileIds.length > 0) {
      setStreamStatus("Processing files...");
      await waitForExtraction(conversation.id);
      await refreshConversationFiles();
      setStreamStatus("");
    }

    // Clear attached file selections
    setAttachedFileIds([]);

    if (!content) return;

    // Build file info for the optimistic message
    const messageFiles: MessageFile[] = messageFileIds
      .map((id) => {
        const f = conversationFiles.find((cf) => cf.id === id);
        return f
          ? {
              id: f.id,
              original_filename: f.original_filename,
              extractionFailed: f.extraction_status === "failed",
            }
          : null;
      })
      .filter((f): f is MessageFile => f !== null);

    setInput("");
    setFileErrors([]);
    setIsStreaming(true);
    setStreamContent("");
    setStreamStatus("");
    userScrolledRef.current = false;
    startThinkingTimer();

    // Optimistic: add user message
    // If editing, inherit the version group from the original message
    let optimisticVersionGroupId: string | null = null;
    let optimisticVersionNumber: number | undefined;
    if (editMessageId) {
      const origMsg = messages.find((m) => m.id === editMessageId);
      if (origMsg?.version_group_id) {
        optimisticVersionGroupId = origMsg.version_group_id;
        const maxV = versionInfo.get(origMsg.version_group_id)?.maxVersion ?? 1;
        optimisticVersionNumber = maxV + 1;
      } else {
        // Will be assigned by server, use a temp group ID for now
        optimisticVersionGroupId = `temp-vg-${Date.now()}`;
        optimisticVersionNumber = 2;
      }
      // Auto-select the new version optimistically
      if (optimisticVersionGroupId && optimisticVersionNumber) {
        setSelectedVersions((prev) => {
          const next = new Map(prev);
          next.set(optimisticVersionGroupId!, optimisticVersionNumber!);
          return next;
        });
      }
    }

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
      files: messageFiles.length > 0 ? messageFiles : undefined,
      version_group_id: optimisticVersionGroupId,
      version_number: optimisticVersionNumber,
    };
    setMessages((prev) => [...prev, userMsg]);

    abortRef.current = new AbortController();
    let accumulated = "";

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(messageFileIds.length > 0 ? { fileIds: messageFileIds } : {}),
          ...((modelOverride ?? selectedModel)
            ? {
                modelName: (modelOverride ?? selectedModel)!.name,
                modelHost: (modelOverride ?? selectedModel)!.host,
              }
            : {}),
          ...(editMessageId ? { editMessageId } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Failed to send" } }));
        const errorId = `error-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: errorId,
            role: "assistant",
            content: "",
            created_at: new Date().toISOString(),
            status: "error",
            errorDetail: err.error?.message ?? "Failed to send message",
          },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        const errorId = `error-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: errorId,
            role: "assistant",
            content: "",
            created_at: new Date().toISOString(),
            status: "error",
            errorDetail: "No response stream received from server",
          },
        ]);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            switch (event.type) {
              case "status":
                setStreamStatus(event.message ?? "");
                break;
              case "token":
                stopThinkingTimer();
                setStreamStatus("");
                accumulated += event.content ?? "";
                setStreamContent(accumulated);
                break;
              case "done":
                setMessages((prev) => {
                  let updated = [...prev];

                  if (event.versionGroupId) {
                    // If this was a first edit, retroactively tag the original Q&A as v1
                    if (event.editMessageId) {
                      const origIdx = updated.findIndex((m) => m.id === event.editMessageId);
                      if (origIdx >= 0 && !updated[origIdx].version_group_id) {
                        updated[origIdx] = {
                          ...updated[origIdx],
                          version_group_id: event.versionGroupId,
                          version_number: 1,
                        };
                        // Tag the assistant response following it
                        if (
                          origIdx + 1 < updated.length &&
                          updated[origIdx + 1].role === "assistant"
                        ) {
                          updated[origIdx + 1] = {
                            ...updated[origIdx + 1],
                            version_group_id: event.versionGroupId,
                            version_number: 1,
                          };
                        }
                      }
                    }

                    // Update temp user message with real ID and version info
                    updated = updated.map((m) => {
                      if (m.id.startsWith("temp-") && m.role === "user") {
                        return {
                          ...m,
                          id: event.userMessageId ?? m.id,
                          version_group_id: event.versionGroupId,
                          version_number: event.versionNumber,
                        };
                      }
                      return m;
                    });
                  } else if (event.userMessageId) {
                    // Non-edit: just replace temp ID with real one
                    updated = updated.map((m) =>
                      m.id.startsWith("temp-") && m.role === "user"
                        ? { ...m, id: event.userMessageId }
                        : m,
                    );
                  }

                  // Add assistant message
                  updated.push({
                    id: event.messageId ?? `ai-${Date.now()}`,
                    role: "assistant",
                    content: accumulated,
                    created_at: new Date().toISOString(),
                    metadata: event.metadata ?? null,
                    model: event.model ?? null,
                    version_group_id: event.versionGroupId ?? null,
                    version_number: event.versionNumber ?? undefined,
                  });
                  return updated;
                });
                // Auto-select the new version
                if (event.versionGroupId && event.versionNumber) {
                  setSelectedVersions((prev) => {
                    const next = new Map(prev);
                    // Remove any temp group entries
                    for (const key of next.keys()) {
                      if (key.startsWith("temp-vg-")) next.delete(key);
                    }
                    next.set(event.versionGroupId, event.versionNumber);
                    return next;
                  });
                }
                setStreamContent("");
                setIsStreaming(false);
                stopThinkingTimer();
                setTimeout(() => textareaRef.current?.focus(), 50);
                break;
              case "title":
                if (event.title) {
                  setConversation((prev) => ({ ...prev, title: event.title }));
                }
                break;
              case "error": {
                const errorId = event.messageId ?? `error-${Date.now()}`;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: errorId,
                    role: "assistant",
                    content: accumulated,
                    created_at: new Date().toISOString(),
                    status: "error",
                    errorDetail: event.error ?? "An unexpected error occurred",
                  },
                ]);
                setStreamContent("");
                accumulated = "";
                break;
              }
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled — add temp client message, then persist to server
        const cancelId = `cancelled-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: cancelId,
            role: "assistant",
            content: accumulated,
            created_at: new Date().toISOString(),
            status: "cancelled",
          },
        ]);
        setStreamContent("");

        // Persist cancelled message to DB
        try {
          const res = await fetch(`/api/conversations/${conversation.id}/messages/save-cancelled`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: accumulated,
              ...(optimisticVersionGroupId ? { versionGroupId: optimisticVersionGroupId } : {}),
              ...(optimisticVersionNumber ? { versionNumber: optimisticVersionNumber } : {}),
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.messageId) {
              setMessages((prev) =>
                prev.map((m) => (m.id === cancelId ? { ...m, id: data.messageId } : m)),
              );
            }
          }
        } catch {
          // Best-effort — client-side message remains
        }
      } else {
        const errorId = `error-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: errorId,
            role: "assistant",
            content: accumulated,
            created_at: new Date().toISOString(),
            status: "error",
            errorDetail: (err as Error).message ?? "An unexpected error occurred",
          },
        ]);
        setStreamContent("");
      }
    } finally {
      setIsStreaming(false);
      stopThinkingTimer();
      abortRef.current = null;
      refreshConversationFiles();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editingMessageId) {
        submitEdit();
      } else {
        maybeShowDisclaimer();
      }
    }
    if (e.key === "Escape" && editingMessageId) {
      cancelEdit();
    }
  }

  async function handleTitleSave(newTitle: string) {
    setShowTitleModal(false);
    if (newTitle === conversation.title) return;
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setConversation((prev) => ({ ...prev, title: newTitle }));
  }

  async function handleArchive() {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: !conversation.is_archived }),
    });
    setConversation((prev) => ({ ...prev, is_archived: !prev.is_archived }));
  }

  async function handleDismissCancelled(cancelledMsgId: string) {
    // Remove the cancelled assistant message and the user message before it from client state
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === cancelledMsgId);
      if (idx < 0) return prev;
      // Remove the cancelled message and the user message before it (if it exists)
      const userMsgIdx = idx > 0 && prev[idx - 1].role === "user" ? idx - 1 : -1;
      return prev.filter((_, i) => i !== idx && i !== userMsgIdx);
    });

    // Delete the full Q&A pair from the server (cancelled messages are now persisted)
    try {
      await fetch(`/api/conversations/${conversation.id}/messages/delete-last-exchange`, {
        method: "POST",
      });
    } catch {}
  }

  function handleDeleteLastExchange() {
    // Check if this is the only user message — deleting it means deleting the conversation
    const userMessageCount = visibleMessages.filter((m) => m.role === "user").length;
    if (userMessageCount <= 1) {
      setShowDeleteLastChatConfirm(true);
    } else {
      setShowDeleteExchangeConfirm(true);
    }
  }

  async function confirmDeleteLastExchange() {
    setShowDeleteExchangeConfirm(false);

    // Find the last user message in visibleMessages
    let lastUserIdx = -1;
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return;
    const lastUserMsg = visibleMessages[lastUserIdx];

    // Determine which message IDs to remove from client state
    let idsToRemove: Set<string>;
    if (lastUserMsg.version_group_id) {
      // Remove all messages (any role) sharing this version group
      idsToRemove = new Set(
        messages
          .filter((m) => m.version_group_id === lastUserMsg.version_group_id)
          .map((m) => m.id),
      );
    } else {
      // Remove this user message + all messages after it in the full messages array
      const fullIdx = messages.findIndex((m) => m.id === lastUserMsg.id);
      idsToRemove = new Set(messages.slice(fullIdx).map((m) => m.id));
    }

    // Optimistic update
    setMessages((prev) => prev.filter((m) => !idsToRemove.has(m.id)));

    try {
      const res = await fetch(
        `/api/conversations/${conversation.id}/messages/delete-last-exchange`,
        { method: "POST" },
      );
      if (!res.ok) {
        // Restore on failure by reloading
        const reload = await fetch(`/api/conversations/${conversation.id}/messages`);
        if (reload.ok) {
          const data = await reload.json();
          setMessages(hydrateMessageStatus(data.messages ?? []));
        }
      }
    } catch {
      // Restore on network error
      const reload = await fetch(`/api/conversations/${conversation.id}/messages`);
      if (reload.ok) {
        const data = await reload.json();
        setMessages(hydrateMessageStatus(data.messages ?? []));
      }
    }
  }

  async function confirmDeleteLastChat() {
    setShowDeleteLastChatConfirm(false);
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    navigate("/chats");
  }

  function handleDeleteOrphanMessage(msgId: string) {
    const userMessageCount = visibleMessages.filter((m) => m.role === "user").length;
    if (userMessageCount <= 1) {
      setShowDeleteLastChatConfirm(true);
    } else {
      setOrphanDeleteMessageId(msgId);
    }
  }

  async function confirmDeleteOrphanMessage() {
    const msgId = orphanDeleteMessageId;
    setOrphanDeleteMessageId(null);
    if (!msgId) return;

    // Optimistic removal
    const backup = messages;
    setMessages((prev) => prev.filter((m) => m.id !== msgId));

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages/${msgId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setMessages(backup);
      }
    } catch {
      setMessages(backup);
    }
  }

  function handleEditLastQuestion(msgId: string, content: string) {
    setEditingMessageId(msgId);
    setInput(content);
    // Scroll composer into view, focus, and pulse
    setTimeout(() => {
      textareaRef.current?.focus();
      const el = composerRef.current;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "end" });
        el.classList.remove("edit-pulse");
        // Force reflow so re-adding the class restarts the animation
        void el.offsetWidth;
        el.classList.add("edit-pulse");
      }
    }, 0);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setInput("");
  }

  async function submitEdit() {
    const content = input.trim();
    if (!content || !editingMessageId) return;

    const msgToEdit = editingMessageId;
    setEditingMessageId(null);

    // Send with editMessageId — the API handles versioning
    maybeShowDisclaimer(content, undefined, undefined, msgToEdit);
  }

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    setShowDeleteConfirm(false);
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    navigate("/chats");
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

  async function handleUnlinkFile(fileId: string) {
    await fetch(`/api/conversations/${conversation.id}/files/${fileId}`, { method: "DELETE" });
    setConversationFiles((prev) => prev.filter((f) => f.id !== fileId));
    setAttachedFileIds((prev) => prev.filter((id) => id !== fileId));
  }

  async function handleEnableSafeMode() {
    if (messages.length > 0) {
      setShowSafeModeModal("cannot-enable");
      return;
    }
    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ safe_mode: true }),
    });
    if (res.ok) {
      const { conversation: updated } = await res.json();
      setConversation(updated);
    }
  }

  async function handleDisableSafeMode() {
    setShowSafeModeModal(null);
    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ safe_mode: false }),
    });
    if (res.ok) {
      const { conversation: updated } = await res.json();
      setConversation(updated);
    }
  }

  const isMinor = user.role === "child" || user.role === "teen";
  const attachedFiles = conversationFiles.filter((f) => attachedFileIds.includes(f.id));
  const noModelsAvailable = availableModels.length === 0;

  // Compute version metadata and visible messages
  const versionInfo = useMemo(() => {
    // Build: group_id → { maxVersion, count }
    const groups = new Map<string, { maxVersion: number; count: number }>();
    for (const m of messages) {
      if (m.version_group_id) {
        const g = groups.get(m.version_group_id) ?? { maxVersion: 0, count: 0 };
        if (m.role === "user") g.count++; // count user messages as versions
        if (m.version_number && m.version_number > g.maxVersion) g.maxVersion = m.version_number;
        groups.set(m.version_group_id, g);
      }
    }
    return groups;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => {
      if (!m.version_group_id) return true;
      const selected =
        selectedVersions.get(m.version_group_id) ??
        versionInfo.get(m.version_group_id)?.maxVersion ??
        1;
      return m.version_number === selected;
    });
  }, [messages, selectedVersions, versionInfo]);

  // Flat list of every individual occurrence: { messageId, indexInMessage }
  // Only search visible messages (selected version) to avoid hidden version matches
  const searchOccurrences = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const occurrences: { messageId: string; indexInMessage: number }[] = [];
    for (const msg of visibleMessages) {
      if (!msg.content) continue;
      const content = msg.content.toLowerCase();
      let pos = 0;
      let idx = 0;
      while ((pos = content.indexOf(q, pos)) !== -1) {
        occurrences.push({ messageId: msg.id, indexInMessage: idx });
        pos += q.length;
        idx++;
      }
    }
    return occurrences;
  }, [searchQuery, visibleMessages]);

  const searchMatchSet = useMemo(
    () => new Set(searchOccurrences.map((o) => o.messageId)),
    [searchOccurrences],
  );
  const activeOccurrence =
    searchOccurrences.length > 0 ? searchOccurrences[activeMatchIndex] : null;
  const activeMatchId = activeOccurrence?.messageId ?? null;

  function goToNextMatch() {
    if (searchOccurrences.length === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % searchOccurrences.length);
  }

  function goToPrevMatch() {
    if (searchOccurrences.length === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + searchOccurrences.length) % searchOccurrences.length);
  }

  // Scroll to the active search match (the specific <mark> element, not just the message)
  useEffect(() => {
    if (searchOccurrences.length === 0) return;
    requestAnimationFrame(() => {
      const mark = messagesContainerRef.current?.querySelector("mark.search-active");
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [activeMatchIndex, searchOccurrences.length]);

  // Reset active match index when query changes
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  // Clamp active index if matches shrink
  useEffect(() => {
    if (activeMatchIndex >= searchOccurrences.length && searchOccurrences.length > 0) {
      setActiveMatchIndex(searchOccurrences.length - 1);
    }
  }, [searchOccurrences.length, activeMatchIndex]);

  // Check if the conversation's model is still available
  const conversationModelUnavailable =
    conversation.llm_model_id &&
    !availableModels.some((m) => m.id === conversation.llm_model_id) &&
    selectedModel !== null;

  function formatDuration(ns: number): string {
    const ms = ns / 1_000_000;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTokenSpeed(evalCount: number, evalDurationNs: number): string {
    if (evalDurationNs === 0) return "0";
    return ((evalCount / evalDurationNs) * 1_000_000_000).toFixed(1);
  }

  function toggleMetadata(msgId: string) {
    // On mobile, open bottom sheet instead of inline expand
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) {
      const msg = visibleMessages.find((m) => m.id === msgId);
      if (msg) setMetadataSheetMsg(msg);
      return;
    }
    setExpandedMetadata((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Sticky header with title + 3-dot menu */}
      <div className="sticky top-0 z-10 bg-background">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {conversation.title || "New Chat"}
            </h1>
            <button
              type="button"
              onClick={() => setShowTitleModal(true)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Edit title"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Search messages button */}
            <button
              type="button"
              onClick={() => (searchOpen ? closeSearch() : openSearch())}
              className={`rounded-md p-2 transition-colors ${
                searchOpen
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title="Search messages"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Safe Mode indicator/toggle */}
            {isMinor && conversation.safe_mode && (
              <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Shield className="h-3.5 w-3.5" />
                Safe Mode
              </div>
            )}
            {!isMinor && conversation.safe_mode === true && (
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Shield className="h-3.5 w-3.5" />
                  Safe Mode
                </div>
                <button
                  type="button"
                  onClick={() => setShowSafeModeModal("disable")}
                  className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Disable
                </button>
              </div>
            )}
            {!isMinor && conversation.safe_mode === null && messages.length === 0 && (
              <button
                type="button"
                onClick={handleEnableSafeMode}
                className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Enable Safe Mode
              </button>
            )}

            {/* Group selector */}
            <div ref={groupDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Assign to topic"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="max-w-[80px] truncate">
                  {conversation.group_id
                    ? (groups.find((g) => g.id === conversation.group_id)?.name ?? "Topic")
                    : "Topic"}
                </span>
              </button>
              {showGroupDropdown && (
                <div className="absolute right-0 top-full mt-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-lg z-20">
                  <button
                    type="button"
                    onClick={() => handleSetGroup(null)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent ${
                      !conversation.group_id ? "font-medium text-primary" : ""
                    }`}
                  >
                    No topic
                    {!conversation.group_id && <Check className="h-3 w-3 ml-auto" />}
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => handleSetGroup(g.id)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent ${
                        conversation.group_id === g.id ? "font-medium text-primary" : ""
                      }`}
                    >
                      <span className="truncate">{g.name}</span>
                      {conversation.group_id === g.id && (
                        <Check className="h-3 w-3 ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag assignment */}
            <div ref={tagPopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setShowTagPopover(!showTagPopover)}
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  convTags.length > 0
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title="Manage tags"
              >
                <Tag className="h-3.5 w-3.5" />
                {convTags.length > 0 && <span>{convTags.length}</span>}
              </button>
              {showTagPopover && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-card p-3 shadow-lg z-20">
                  <p className="text-xs font-medium mb-2">Tags</p>
                  {convTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {convTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px]"
                        >
                          {tag.name}
                          <button
                            type="button"
                            onClick={() => handleToggleTag(tag.id)}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {userTags.filter((t) => !convTags.some((ct) => ct.id === t.id)).length > 0 && (
                    <div className="space-y-0.5 mb-2 max-h-32 overflow-y-auto">
                      {userTags
                        .filter((t) => !convTags.some((ct) => ct.id === t.id))
                        .map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => handleToggleTag(tag.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                          >
                            <Plus className="h-3 w-3" />
                            {tag.name}
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateAndAssignTag();
                        }
                      }}
                      placeholder="New tag..."
                      className="flex-1 h-7 rounded border border-input bg-background px-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={handleCreateAndAssignTag}
                      disabled={!newTagName.trim()}
                      className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3-dot menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-card py-1 shadow-lg z-30">
                  {conversationFiles.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowFilesModal(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <FileText className="h-4 w-4" />
                        Attached files ({conversationFiles.length})
                      </button>
                      <div className="my-1 border-t border-border" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      handleArchive();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    {conversation.is_archived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4" />
                        Archive
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      handleDelete();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                  >
                    <X className="h-4 w-4" />
                    Delete Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* In-chat search bar */}
        {searchOpen && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.shiftKey ? goToPrevMatch() : goToNextMatch();
                  }
                }}
                placeholder="Search in chat..."
                className="h-8 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {searchQuery.trim()
                ? searchOccurrences.length > 0
                  ? `${activeMatchIndex + 1} of ${searchOccurrences.length}`
                  : "No results"
                : ""}
            </span>
            <button
              type="button"
              onClick={goToPrevMatch}
              disabled={searchOccurrences.length === 0}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
              title="Previous match (Shift+Enter)"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToNextMatch}
              disabled={searchOccurrences.length === 0}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
              title="Next match (Enter)"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeSearch}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Close search (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Archived banner */}
      {conversation.is_archived && (
        <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <Archive className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-sm text-amber-700 dark:text-amber-300">
            This chat is archived and read-only.
          </span>
          <button
            type="button"
            onClick={handleArchive}
            className="shrink-0 rounded-md border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            Unarchive
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Start a chat</h3>
              <p className="mt-1 text-sm text-muted-foreground">Type a message to begin chatting</p>
            </div>
          )}

          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              ref={(el) => {
                if (el) messageRefs.current.set(msg.id, el);
                else messageRefs.current.delete(msg.id);
              }}
              className={`flex gap-3 transition-colors duration-200 ${
                activeMatchId === msg.id
                  ? "rounded-lg ring-2 ring-primary/40 bg-primary/5 px-3 py-2 -mx-3"
                  : ""
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : msg.status === "error"
                      ? "bg-destructive/10 text-destructive"
                      : msg.status === "cancelled"
                        ? "bg-muted text-muted-foreground"
                        : "bg-secondary text-secondary-foreground"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : msg.status === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : msg.status === "cancelled" ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </p>
                    {msg.role === "user" &&
                      !isStreaming &&
                      !editingMessageId &&
                      !conversation.is_archived &&
                      (() => {
                        const msgIdx = visibleMessages.indexOf(msg);
                        if (msgIdx < 0) return null;
                        const nextMsg =
                          msgIdx + 1 < visibleMessages.length ? visibleMessages[msgIdx + 1] : null;
                        const hasLaterUser = visibleMessages
                          .slice(msgIdx + 1)
                          .some((m) => m.role === "user");

                        // Case 1 & 2: Last user message (with or without assistant response)
                        if (!hasLaterUser) {
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditLastQuestion(msg.id, msg.content)}
                                className="rounded-md p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                title="Edit and resubmit"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={handleDeleteLastExchange}
                                className="rounded-md p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
                                title="Delete last Q&amp;A"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          );
                        }

                        // Case 3: Mid-conversation orphan (user msg with no assistant response after it)
                        if (nextMsg?.role !== "assistant") {
                          return (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrphanMessage(msg.id)}
                              className="rounded-md p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
                              title="Delete orphaned question"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          );
                        }

                        return null;
                      })()}
                  </div>
                  {msg.role === "assistant" &&
                    msg.content &&
                    (copiedId === msg.id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 copy-pill-in">
                        <Check className="h-3 w-3" />
                        Copied
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    ))}
                </div>

                {/* Normal message content */}
                {msg.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5 [&_mark.search-active]:bg-primary/50">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={chatMarkdownComponents}
                      rehypePlugins={
                        searchMatchSet.has(msg.id)
                          ? [
                              [
                                rehypeHighlightText,
                                {
                                  query: searchQuery.trim(),
                                  activeIndex:
                                    activeOccurrence?.messageId === msg.id
                                      ? activeOccurrence.indexInMessage
                                      : -1,
                                },
                              ],
                            ]
                          : []
                      }
                    >
                      {msg.content}
                    </Markdown>
                  </div>
                )}

                {/* File chips for user messages */}
                {msg.role === "user" && msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {msg.files.map((f) =>
                      f.extractionFailed ? (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {f.original_filename}
                          <span className="text-[10px] opacity-80">— Could not read</span>
                        </span>
                      ) : (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          <Paperclip className="h-3 w-3" />
                          {f.original_filename}
                        </span>
                      ),
                    )}
                  </div>
                )}

                {/* Version navigation for edited messages */}
                {msg.role === "user" &&
                  msg.version_group_id &&
                  (() => {
                    const group = versionInfo.get(msg.version_group_id!);
                    if (!group || group.count <= 1) return null;
                    const current = msg.version_number ?? 1;
                    const max = group.maxVersion;
                    return (
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          type="button"
                          disabled={current <= 1}
                          onClick={() => {
                            setSelectedVersions((prev) => {
                              const next = new Map(prev);
                              next.set(msg.version_group_id!, current - 1);
                              return next;
                            });
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {current} / {max}
                        </span>
                        <button
                          type="button"
                          disabled={current >= max}
                          onClick={() => {
                            setSelectedVersions((prev) => {
                              const next = new Map(prev);
                              next.set(msg.version_group_id!, current + 1);
                              return next;
                            });
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })()}

                {/* Cancelled indicator */}
                {msg.status === "cancelled" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                      <Ban className="h-3 w-3" />
                      Response cancelled
                    </span>
                    {visibleMessages[visibleMessages.length - 1]?.id === msg.id && (
                      <button
                        type="button"
                        onClick={() => handleDismissCancelled(msg.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Dismiss
                      </button>
                    )}
                  </div>
                )}

                {/* Error panel */}
                {msg.status === "error" && (
                  <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Something went wrong
                    </div>
                    {msg.errorDetail && (
                      <p className="mt-1.5 text-destructive/80">{msg.errorDetail}</p>
                    )}
                  </div>
                )}

                {/* Response metadata (assistant messages only) */}
                {msg.role === "assistant" && !msg.status && (msg.metadata || msg.model) && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleMetadata(msg.id)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    >
                      {expandedMetadata.has(msg.id) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {msg.model?.name && <span>{msg.model.name}</span>}
                      {msg.metadata && msg.metadata.eval_count != null && (
                        <>
                          {msg.model?.name && <span className="opacity-40">·</span>}
                          <span>{msg.metadata.eval_count} tokens</span>
                          <span className="opacity-40">·</span>
                          <span>{formatDuration(msg.metadata.eval_duration_ns!)}</span>
                        </>
                      )}
                    </button>
                    {expandedMetadata.has(msg.id) &&
                      msg.metadata &&
                      msg.metadata.eval_count != null && (
                        <div className="hidden sm:block mt-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                          {msg.model?.name && (
                            <div className="flex justify-between">
                              <span>Model</span>
                              <span className="font-medium">{msg.model.name}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Prompt tokens</span>
                            <span className="font-medium">{msg.metadata.prompt_eval_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Response tokens</span>
                            <span className="font-medium">{msg.metadata.eval_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Duration</span>
                            <span className="font-medium">
                              {formatDuration(msg.metadata.eval_duration_ns!)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Speed</span>
                            <span className="font-medium">
                              {formatTokenSpeed(
                                msg.metadata.eval_count!,
                                msg.metadata.eval_duration_ns!,
                              )}{" "}
                              tokens/sec
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {isStreaming && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-1 pt-0.5">
                <p className="text-xs font-medium text-muted-foreground">Assistant</p>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {streamContent ? (
                    <Markdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
                      {streamContent}
                    </Markdown>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {streamStatus || "Thinking..."}
                      {thinkingSeconds >= 10 && (
                        <span className="text-xs opacity-70">({thinkingSeconds}s)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom composer */}
      {!conversation.is_archived && (
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

            {/* Selected file chips (uploads + attached) */}
            {(selectedFiles.length > 0 || attachedFiles.length > 0) && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedFiles.map((file, i) => (
                  <div
                    key={`upload-${i}`}
                    className="flex items-center gap-1.5 rounded-md border bg-secondary px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    {isUploading && uploadProgress.has(file.name) ? (
                      <span className="text-muted-foreground">
                        {uploadProgress.get(file.name)}%
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {attachedFiles.map((file) => (
                  <div
                    key={`attached-${file.id}`}
                    className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs"
                  >
                    <FileText className="h-3 w-3 text-primary" />
                    <span className="max-w-[150px] truncate">{file.original_filename}</span>
                    <button
                      type="button"
                      onClick={() => toggleAttachFile(file.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload progress bar */}
            {isUploading && (
              <div className="mb-2">
                <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${uploadProgress.size > 0 ? Array.from(uploadProgress.values()).reduce((a, b) => a + b, 0) / uploadProgress.size : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Uploading files...</p>
              </div>
            )}

            {/* No models available banner */}
            {noModelsAvailable && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>No models available. An administrator must configure model access.</span>
              </div>
            )}

            {/* Editing indicator */}
            {editingMessageId && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                <Pencil className="h-3.5 w-3.5" />
                <span className="flex-1">
                  Editing your message — press Enter to resubmit or Esc to cancel
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="shrink-0 rounded p-0.5 hover:bg-primary/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Composer container */}
            <div
              ref={composerRef}
              className={`rounded-2xl border ${editingMessageId ? "border-primary/50" : "border-input"} bg-background dark:bg-[#232840] ${noModelsAvailable ? "opacity-50 pointer-events-none" : ""}`}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming || noModelsAvailable}
                placeholder="Type a message..."
                rows={1}
                className="w-full min-h-[36px] md:min-h-[76px] resize-none overflow-hidden border-0 bg-transparent px-4 pt-3 pb-1 text-base placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between px-3 py-2">
                <div
                  className={`flex items-center gap-1 ${isStreaming ? "opacity-50 pointer-events-none" : ""}`}
                >
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
                    disabled={isUploading || isStreaming}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Attach file"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      voicePrefixRef.current = input.trim();
                      setVoiceOverlayOpen(true);
                      await voice.startRecording();
                    }}
                    disabled={isStreaming || isUploading || voiceOverlayOpen}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  {/* Model selector */}
                  <ModelSelector
                    models={availableModels}
                    selected={selectedModel}
                    onSelect={setSelectedModel}
                    disabled={isStreaming}
                  />
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    title="Stop generating"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => (editingMessageId ? submitEdit() : maybeShowDisclaimer())}
                    disabled={isUploading || (!input.trim() && selectedFiles.length === 0)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={editingMessageId ? "Resubmit edited message" : "Send message"}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Title edit modal */}
      <TitleEditModal
        open={showTitleModal}
        currentTitle={conversation.title || "New Chat"}
        conversationId={conversation.id}
        onSave={handleTitleSave}
        onCancel={() => setShowTitleModal(false)}
      />

      {/* Files modal */}
      <FilesModal
        open={showFilesModal}
        onClose={() => setShowFilesModal(false)}
        conversationId={conversation.id}
        files={conversationFiles}
        onRemoveFile={handleUnlinkFile}
        attachedFileIds={attachedFileIds}
        onToggleAttach={toggleAttachFile}
      />

      {/* Safe Mode modals */}
      {showSafeModeModal === "disable" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="font-semibold">Disable Safe Mode</h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              This will remove content safety protections for the rest of this chat. This
              cannot be undone — Safe Mode cannot be re-enabled once disabled.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSafeModeModal(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Keep Safe Mode
              </button>
              <button
                type="button"
                onClick={handleDisableSafeMode}
                className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Disable Safe Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {showSafeModeModal === "cannot-enable" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="font-semibold">Cannot Enable Safe Mode</h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Safe Mode can only be enabled on new chats before any messages are sent.
              Existing chats cannot be guaranteed to be safe.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSafeModeModal(null)}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI disclaimer modal */}
      <AiDisclaimerModal
        open={showDisclaimerModal}
        modelName={(pendingSendArgs?.modelOverride ?? selectedModel)?.name ?? "this AI model"}
        onAcknowledge={handleAcknowledge}
        onCancel={handleDisclaimerCancel}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Chat"
        message="Are you sure you want to delete this chat? All messages and linked files will be removed. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Delete last Q&A confirmation */}
      <ConfirmModal
        open={showDeleteExchangeConfirm}
        title="Delete Last Q&A"
        message="Are you sure you want to delete the last question and its response? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteLastExchange}
        onCancel={() => setShowDeleteExchangeConfirm(false)}
      />

      {/* Delete orphan message confirmation */}
      <ConfirmModal
        open={orphanDeleteMessageId !== null}
        title="Delete Message"
        message="This question has no response. Delete it?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteOrphanMessage}
        onCancel={() => setOrphanDeleteMessageId(null)}
      />

      {/* Delete last message = delete chat confirmation */}
      <ConfirmModal
        open={showDeleteLastChatConfirm}
        title="Delete Chat"
        message="This is the only message in this chat. Deleting it will delete the entire chat."
        confirmLabel="Delete Chat"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteLastChat}
        onCancel={() => setShowDeleteLastChatConfirm(false)}
      />

      {/* Voice recording overlay */}
      {voiceOverlayOpen && (
        <VoiceOverlay
          isRecording={voice.isRecording}
          isPaused={voice.isPaused}
          isTranscribing={voice.isTranscribing}
          error={voice.error}
          stream={voice.stream}
          transcript={input}
          onPause={voice.pauseRecording}
          onResume={voice.resumeRecording}
          onCancel={() => {
            voice.cancelRecording();
            setVoiceOverlayOpen(false);
            setInput(voicePrefixRef.current);
          }}
          onClear={() => {
            voice.clearRecording();
            setInput(voicePrefixRef.current);
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

      {/* Mobile metadata bottom sheet */}
      {metadataSheetMsg && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          onClick={() => setMetadataSheetMsg(null)}
          onKeyDown={(e) => e.key === "Escape" && setMetadataSheetMsg(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-xl border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-[slide-up_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
          >
            <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-border" />
            <h3 className="text-sm font-semibold mb-3">Response Info</h3>
            <div className="space-y-2.5 text-sm text-muted-foreground">
              {metadataSheetMsg.model?.name && (
                <div className="flex justify-between">
                  <span>Model</span>
                  <span className="font-medium text-foreground">{metadataSheetMsg.model.name}</span>
                </div>
              )}
              {metadataSheetMsg.metadata && (
                <>
                  <div className="flex justify-between">
                    <span>Prompt tokens</span>
                    <span className="font-medium text-foreground">
                      {metadataSheetMsg.metadata.prompt_eval_count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Response tokens</span>
                    <span className="font-medium text-foreground">
                      {metadataSheetMsg.metadata.eval_count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span className="font-medium text-foreground">
                      {formatDuration(metadataSheetMsg.metadata.eval_duration_ns!)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Speed</span>
                    <span className="font-medium text-foreground">
                      {formatTokenSpeed(
                        metadataSheetMsg.metadata.eval_count!,
                        metadataSheetMsg.metadata.eval_duration_ns!,
                      )}{" "}
                      tokens/sec
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMetadataSheetMsg(null)}
              className="mt-4 w-full rounded-lg bg-secondary py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
