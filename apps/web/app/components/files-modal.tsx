import { Download, Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ConversationFile {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_status: string;
  created_at: string;
}

interface FilesModalProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  files: ConversationFile[];
  onRemoveFile: (fileId: string) => void;
  attachedFileIds: string[];
  onToggleAttach: (fileId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesModal({
  open,
  onClose,
  files,
  onRemoveFile,
  attachedFileIds,
  onToggleAttach,
}: FilesModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const attachedSet = new Set(attachedFileIds);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Attached Files ({files.length})</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {files.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No files attached to this chat
            </p>
          ) : (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-muted-foreground">
                Click a file to include it with your next message
              </p>
              {files.map((file) => {
                const isAttached = attachedSet.has(file.id);
                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      isAttached
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleAttach(file.id)}
                      className="flex flex-1 items-start gap-3 min-w-0 text-left"
                    >
                      <Paperclip
                        className={`h-4 w-4 shrink-0 mt-0.5 ${isAttached ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.original_filename}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.size_bytes)}
                          </span>
                          {file.extraction_status === "pending" && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing
                            </span>
                          )}
                          {file.extraction_status === "done" && (
                            <span className="text-xs text-emerald-500">Ready</span>
                          )}
                          {file.extraction_status === "failed" && (
                            <span className="text-xs text-destructive">Failed</span>
                          )}
                        </div>
                      </div>
                      {isAttached && (
                        <span className="shrink-0 text-xs font-medium text-primary">Attached</span>
                      )}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`/api/files/${file.id}/download`}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFile(file.id);
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        title="Remove from conversation"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
