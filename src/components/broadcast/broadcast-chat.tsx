import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ArrowLeft,
  CheckCheck,
  CircleAlert,
  Clock,
  Eye,
  FileText,
  Loader2,
  Lock,
  Megaphone,
  MoreVertical,
  Paperclip,
  Pencil,
  RefreshCw,
  SendHorizonal,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";

import {
  broadcastPreview,
  deleteBroadcastList,
  fetchBroadcastHistory,
  fetchBroadcastListDetail,
  MAX_ATTACHMENTS,
  MESSAGE_TEXT_MAX,
  mintClientBroadcastId,
  outcomeHeadline,
  outcomeNote,
  pluralPeople,
  sendBroadcast,
  uploadBroadcastFile,
  type BroadcastMediaItem,
  type BroadcastMember,
  type HistoryRow,
} from "@/lib/broadcast-api";
import { parseServerDate } from "@/lib/event-reminders";
import { formatMessage } from "@/lib/message-formatters";
import { attachmentType, validateAttachment } from "@/hooks/use-file-upload";
import useIsMobile from "@/hooks/use-is-mobile";
import { useBroadcastStore, type TrackedSend } from "@/stores/broadcast-store";
import {
  BroadcastListDialog,
  type ListDialogMode,
} from "@/components/broadcast/broadcast-list-dialog";
import { BroadcastAvatar, BroadcastProgressBar } from "@/components/broadcast/broadcast-shared";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmojiPickerPopover } from "@/components/chat/emoji-picker-popover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HISTORY_PAGE = 30;

let attachmentSeq = 0;
const newAttachmentKey = () => `att_${++attachmentSeq}`;

interface Attachment {
  key: string;
  file: File;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  mediaId?: string;
  error?: string;
}

/**
 * A broadcast list, shown in the main area the way a chat is. Past broadcasts
 * are the "messages" (always ours, so always sent bubbles), each with its
 * delivery outcome underneath; the composer at the bottom sends to the list.
 */
export function BroadcastChat() {
  const listId = useBroadcastStore((s) => s.activeListId);
  if (!listId) return null;
  // Remount per list so history, composer and the clientBroadcastId reset.
  return <BroadcastChatView key={listId} broadcastlistId={listId} />;
}

function BroadcastChatView({ broadcastlistId }: { broadcastlistId: string }) {
  const isMobile = useIsMobile();
  const closeListChat = useBroadcastStore((s) => s.closeListChat);
  const removeList = useBroadcastStore((s) => s.removeList);
  const patchList = useBroadcastStore((s) => s.patchList);
  const refreshLists = useBroadcastStore((s) => s.refreshLists);
  const openReport = useBroadcastStore((s) => s.openReport);
  const historyVersion = useBroadcastStore((s) => s.historyVersion);
  const tracked = useBroadcastStore((s) => s.tracked);
  const summary = useBroadcastStore((s) =>
    s.lists.find((l) => l.broadcastlistId === broadcastlistId)
  );

  const [members, setMembers] = useState<BroadcastMember[]>([]);
  const [detailName, setDetailName] = useState("");
  const [detailCount, setDetailCount] = useState<number | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ListDialogMode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);

  const name = summary?.name || detailName || "Broadcast list";
  const memberCount = summary?.memberCount ?? detailCount ?? 0;
  const maxMembers = summary?.maxMembers ?? 256;

  const gone = useCallback(
    (message: string) => {
      toast.error(message);
      removeList(broadcastlistId);
    },
    [broadcastlistId, removeList]
  );

  // ── Members (header count, intro avatars, 404 detection) ──
  const loadMembers = useCallback(async () => {
    const result = await fetchBroadcastListDetail(broadcastlistId, "", 256, 0);
    if (result.ok) {
      setMembers(result.data.members);
      setDetailName(result.data.name);
      setDetailCount(result.data.memberCount);
      patchList(broadcastlistId, {
        name: result.data.name,
        memberCount: result.data.memberCount,
      });
    } else if (result.kind === "rejected" && result.status === 404) {
      gone(result.message);
    }
  }, [broadcastlistId, patchList, gone]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // ── History, newest page first; rendered oldest → newest ──
  const loadLatest = useCallback(async () => {
    const result = await fetchBroadcastHistory({
      broadcastlistId,
      limit: HISTORY_PAGE,
      offset: 0,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setRows((prev) => {
      // Keep any older pages already loaded below the fresh first page.
      const fresh = result.data.list;
      const seen = new Set(fresh.map((r) => r.broadcastId));
      return [...fresh, ...prev.slice(HISTORY_PAGE).filter((r) => !seen.has(r.broadcastId))];
    });
    setHasMore(result.data.pagination.hasMore);
  }, [broadcastlistId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest, historyVersion]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    restoreFrom.current = scrollRef.current?.scrollHeight ?? null;
    const result = await fetchBroadcastHistory({
      broadcastlistId,
      limit: HISTORY_PAGE,
      offset: rows.length,
    });
    setLoadingOlder(false);
    if (!result.ok) {
      restoreFrom.current = null;
      toast.error(result.message);
      return;
    }
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.broadcastId));
      return [...prev, ...result.data.list.filter((r) => !seen.has(r.broadcastId))];
    });
    setHasMore(result.data.pagination.hasMore);
  };

  // Scroll: pin to the bottom for new sends, hold position for older pages.
  const ordered = [...rows].reverse();
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60) loadOlder();
  };

  const scrollToBottom = () => {
    stickToBottom.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const openManage = () =>
    useBroadcastStore.setState({
      isOpen: true,
      stack: [{ kind: "list", broadcastlistId }],
    });

  const doDelete = async () => {
    const result = await deleteBroadcastList(broadcastlistId);
    if (!result.ok && !(result.kind === "rejected" && result.status === 404)) {
      toast.error(result.message);
      return;
    }
    toast.success(`"${name}" deleted`, { description: "Its past broadcasts stay in History." });
    removeList(broadcastlistId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border/50 bg-background px-4">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            className="shrink-0 rounded-lg hover:bg-primary/10 hover:text-primary"
            onClick={closeListChat}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <button
          type="button"
          onClick={openManage}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <BroadcastAvatar />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {memberCount === 0
                ? "No recipients yet"
                : members.length > 0
                  ? members
                      .slice(0, 4)
                      .map((m) => m.name.split(" ")[0])
                      .join(", ") + (memberCount > 4 ? ` +${memberCount - 4}` : "")
                  : pluralPeople(memberCount)}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <Hint label="Recipients">
            <Button
              aria-label="Recipients"
              variant="ghost"
              size="icon"
              className="rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={openManage}
            >
              <Users className="h-4 w-4" />
            </Button>
          </Hint>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="List options"
                variant="ghost"
                size="icon"
                className="rounded-lg hover:bg-primary/10 hover:text-primary"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                disabled={memberCount >= maxMembers}
                onClick={() => setDialog({ kind: "add", broadcastlistId, name })}
              >
                <UserPlus className="h-4 w-4" /> Add people
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "rename", broadcastlistId, name })}>
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openManage}>
                <Users className="h-4 w-4" /> Manage recipients
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} onScroll={onScroll} className="chat-bg min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-1 px-4 py-3">
          {hasMore ? (
            <div className="flex justify-center py-2">
              {loadingOlder ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Button variant="ghost" size="xs" onClick={loadOlder}>
                  Load earlier broadcasts
                </Button>
              )}
            </div>
          ) : (
            !loading && (
              <IntroCard
                memberCount={memberCount}
                onAdd={() => setDialog({ kind: "add", broadcastlistId, name })}
              />
            )
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={loadLatest}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : (
            ordered.map((row, i) => {
              const prev = ordered[i - 1];
              const showDay = !prev || dayKey(prev.created) !== dayKey(row.created);
              return (
                <Fragment key={row.broadcastId}>
                  {showDay && <DaySeparator iso={row.created} />}
                  <BroadcastBubble
                    row={row}
                    live={tracked[row.broadcastId]}
                    onReport={() => openReport(row.broadcastId)}
                  />
                </Fragment>
              );
            })
          )}
        </div>
      </div>

      {/* ── Composer ── */}
      <BroadcastChatComposer
        broadcastlistId={broadcastlistId}
        listName={name}
        memberCount={memberCount}
        onAddPeople={() => setDialog({ kind: "add", broadcastlistId, name })}
        onSent={scrollToBottom}
        onGone={gone}
      />

      <BroadcastListDialog
        mode={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        onDone={() => {
          loadMembers();
          refreshLists();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${name}"?`}
        description="The list goes away, but everything already sent stays in each person's chat and in your broadcast history."
        confirmText="Delete"
        onConfirm={doDelete}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

function IntroCard({
  memberCount,
  onAdd,
}: {
  memberCount: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <p
        className="flex max-w-md items-start gap-1.5 rounded-lg px-3 py-1.5 text-center text-[11px] leading-relaxed"
        style={{
          backgroundColor: "var(--color-muted)",
          color: "var(--color-muted-foreground)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        Messages you send here reach each recipient in their own private chat with you. Nobody
        sees who else got it.
      </p>
      {memberCount === 0 && (
        <Button size="sm" className="[.dark:not(.accent-black)_&]:text-white" onClick={onAdd}>
          <UserPlus className="h-4 w-4" />
          Add recipients
        </Button>
      )}
    </div>
  );
}

function dayKey(iso: string) {
  const d = parseServerDate(iso);
  return d ? format(d, "yyyy-MM-dd") : "";
}

function DaySeparator({ iso }: { iso: string }) {
  const d = parseServerDate(iso);
  if (!d) return null;
  const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "d MMMM yyyy");
  return (
    <div className="flex items-center justify-center py-3">
      <span
        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
        style={{
          backgroundColor: "var(--color-muted)",
          color: "var(--color-muted-foreground)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function timeOf(iso: string) {
  const d = parseServerDate(iso);
  return d ? format(d, "hh:mm a") : "";
}

/** One broadcast, drawn as our own sent message plus its delivery outcome. */
function BroadcastBubble({
  row,
  live,
  onReport,
}: {
  row: HistoryRow;
  /** Live counts while the send is still being tracked. */
  live?: TrackedSend;
  onReport: () => void;
}) {
  const counts = live ?? row;
  const status = live?.status ?? row.status;
  const text = row.messageText?.trim() || "";
  const media = row.mediaItems || [];
  // Same rule as a chat bubble: ✓ once delivered, ✓✓ only when every person
  // who received a copy has read it.
  const readByAll = row.sentCount > 0 && (row.readCount || 0) >= row.sentCount;

  return (
    <div className="flex flex-col items-end" style={{ animation: "fadeUpIn 0.25s ease-out" }}>
      <div
        className={cn(
          "max-w-[55%] overflow-hidden rounded-2xl rounded-tr-[4px] bubble-sent max-md:max-w-[80%]",
          status === "FAILED" && "opacity-80"
        )}
      >
        {media.length > 0 ? (
          <MediaBlock items={media} />
        ) : row.mediaCount > 0 ? (
          <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[12.5px] text-white/80">
            <Paperclip className="h-3.5 w-3.5" />
            {broadcastPreview({ ...row, messageText: "" })}
          </p>
        ) : null}
        <div className="flex items-end gap-2 px-3.5 py-2">
          {text && (
            <p
              className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatMessage(text) }}
            />
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-white/70">
            {timeOf(row.created)}
            {status === "PENDING" ? (
              <Clock className="h-3 w-3" />
            ) : status === "FAILED" ? (
              <CircleAlert className="h-3 w-3" />
            ) : readByAll ? (
              <CheckCheck className="h-3 w-3 text-white" />
            ) : (
              <Check className="h-3 w-3 opacity-50" />
            )}
          </span>
        </div>
      </div>

      {/* Outcome — the whole line opens the delivery report. */}
      <button
        type="button"
        onClick={onReport}
        className={cn(
          "mb-1.5 mt-1 flex max-w-[55%] cursor-pointer max-md:max-w-[80%] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors hover:bg-muted/70",
          status === "FAILED"
            ? "text-destructive"
            : status === "PARTIAL"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
        )}
      >
        {status === "PENDING" ? (
          <span className="flex w-40 flex-col gap-1">
            <span>{outcomeHeadline({ ...counts, status })}</span>
            <BroadcastProgressBar counts={counts} />
          </span>
        ) : (
          <>
            {status === "FAILED" ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Megaphone className="h-3 w-3" />
            )}
            <span>{outcomeHeadline({ ...counts, status })}</span>
            {status === "PARTIAL" && outcomeNote(counts) && (
              <span className="opacity-80">· {outcomeNote(counts)}</span>
            )}
            {row.sentCount > 0 && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                · <Eye className="h-3 w-3" /> {row.readCount}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}

function MediaBlock({ items }: { items: BroadcastMediaItem[] }) {
  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const visual = sorted.filter((m) => m.mediaType === "IMAGE" || m.mediaType === "VIDEO");
  const docs = sorted.filter((m) => m.mediaType !== "IMAGE" && m.mediaType !== "VIDEO");
  const shown = visual.slice(0, 4);
  const extra = visual.length - shown.length;

  return (
    <div className="flex flex-col gap-1 p-1">
      {shown.length > 0 && (
        <div className={cn("grid gap-1", shown.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {shown.map((m, i) => (
            <a
              key={m.mediaId}
              href={m.mediaPath}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "relative block overflow-hidden rounded-xl bg-black/10",
                shown.length === 1 ? "max-h-72" : "aspect-square",
                shown.length === 3 && i === 0 && "col-span-2 aspect-[2/1]"
              )}
            >
              {m.mediaType === "VIDEO" ? (
                <>
                  <video src={m.mediaPath} preload="metadata" muted className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Video className="h-6 w-6 text-white" />
                  </span>
                </>
              ) : (
                <img
                  src={m.mediaPath}
                  alt={m.mediaName}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
              {extra > 0 && i === shown.length - 1 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">
                  +{extra}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
      {docs.map((m) => (
        <a
          key={m.mediaId}
          href={m.mediaPath}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-xl bg-white/10 px-2.5 py-2 transition-colors hover:bg-white/15"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
            <FileText className="h-5 w-5 text-white" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-white">
            {m.mediaName || "Document"}
          </span>
        </a>
      ))}
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────

function BroadcastChatComposer({
  broadcastlistId,
  listName,
  memberCount,
  onAddPeople,
  onSent,
  onGone,
}: {
  broadcastlistId: string;
  listName: string;
  memberCount: number;
  onAddPeople: () => void;
  onSent: () => void;
  onGone: (message: string) => void;
}) {
  const trackPending = useBroadcastStore((s) => s.trackPending);
  const afterSend = useBroadcastStore((s) => s.afterSend);
  const openReport = useBroadcastStore((s) => s.openReport);

  // One per message — reused on every retry of it, replaced once it's settled.
  const [clientBroadcastId, setClientBroadcastId] = useState(mintClientBroadcastId);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  /** The request may or may not have landed — only a same-id retry is safe. */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => {
      attachmentsRef.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    },
    []
  );

  // Auto-grow the textarea like the chat input does.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
  }, [text]);

  const uploading = attachments.some((a) => a.status === "uploading");
  const ready = attachments.filter((a) => a.status === "done" && a.mediaId);
  const failedUploads = attachments.filter((a) => a.status === "error");
  const trimmed = text.trim();
  const noMembers = memberCount === 0;
  const hasContent = trimmed.length > 0 || ready.length > 0;
  const canSend = !sending && !uploading && !noMembers && hasContent;
  const locked = sending || unconfirmed;

  const clear = () => {
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    setText("");
    setClientBroadcastId(mintClientBroadcastId());
  };

  // Insert at the caret (replacing any selection), like typing would.
  const insertEmoji = (emoji: string) => {
    if (locked) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MESSAGE_TEXT_MAX);
    setText(next);
    setError(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(caret, caret);
    });
  };

  // ── Attachments ──

  const upload = async (a: Attachment) => {
    setAttachments((prev) =>
      prev.map((x) => (x.key === a.key ? { ...x, status: "uploading", error: undefined } : x))
    );
    const result = await uploadBroadcastFile(a.file, a.kind);
    setAttachments((prev) =>
      prev.map((x) =>
        x.key !== a.key
          ? x
          : result.ok
            ? { ...x, status: "done", mediaId: result.mediaId }
            : { ...x, status: "error", error: result.message }
      )
    );
  };

  const addFiles = (files: File[]) => {
    if (locked || noMembers || files.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    if (files.length > room) {
      toast.error(`Only ${room} more file${room === 1 ? "" : "s"} can be attached.`);
    }
    const next: Attachment[] = [];
    for (const file of files.slice(0, room)) {
      const problem = validateAttachment(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      const kind = attachmentType(file);
      next.push({
        key: newAttachmentKey(),
        file,
        kind,
        previewUrl: kind === "IMAGE" ? URL.createObjectURL(file) : undefined,
        status: "uploading",
      });
    }
    if (next.length === 0) return;
    setAttachments((prev) => [...prev, ...next]);
    next.forEach(upload);
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((a) => a.key !== key);
    });
  };

  // ── Send ──

  const send = async () => {
    if (!canSend) return;
    if (text.length > MESSAGE_TEXT_MAX) {
      setError(`Keep the message under ${MESSAGE_TEXT_MAX} characters.`);
      return;
    }
    setError(null);
    setSending(true);
    const result = await sendBroadcast({
      clientBroadcastId,
      broadcastlistId,
      messageText: trimmed,
      mediaItems: ready.map((a) => ({ mediaId: a.mediaId! })),
    });
    setSending(false);

    if (result.ok) {
      setUnconfirmed(false);
      const data = result.data;
      clear();
      onSent();
      if (data.status === "PENDING") {
        trackPending(data);
      } else if (data.status === "PARTIAL") {
        // A success with a note — eleven people already have it.
        toast.warning(outcomeHeadline(data), {
          description: outcomeNote(data),
          action: { label: "Details", onClick: () => openReport(data.broadcastId) },
        });
      }
      afterSend();
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    if (result.kind === "transport") {
      setUnconfirmed(true);
      return;
    }
    setUnconfirmed(false);

    if (result.status === 404) {
      onGone(result.message);
      return;
    }

    // FAILED — recorded server-side, so the next attempt needs a new id. The
    // message stays in the composer.
    if (result.data?.broadcastId) {
      const failedId = result.data.broadcastId;
      setClientBroadcastId(mintClientBroadcastId());
      afterSend();
      onSent();
      toast.error("Couldn't send to anyone", {
        description: "Your message is still in the box.",
        action: { label: "Why?", onClick: () => openReport(failedId) },
      });
      return;
    }

    setError(result.message);
  };

  if (noMembers) {
    return (
      <div className="flex items-center justify-center gap-3 border-t border-border/50 px-4 py-4 text-sm text-muted-foreground">
        <span>Add people to this list to start broadcasting.</span>
        <Button size="sm" className="[.dark:not(.accent-black)_&]:text-white" onClick={onAddPeople}>
          <UserPlus className="h-4 w-4" />
          Add people
        </Button>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 border-t border-border/50 bg-background"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files || []));
      }}
    >
      {unconfirmed && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Couldn't confirm whether this was sent. Retrying is safe — nobody gets it twice.
          </span>
          <Button size="xs" variant="outline" onClick={send} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Retry
          </Button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {attachments.map((a) => (
            <AttachmentTile
              key={a.key}
              a={a}
              locked={locked}
              onRemove={() => removeAttachment(a.key)}
              onRetry={() => upload(a)}
            />
          ))}
        </div>
      )}
      {failedUploads.length > 0 && (
        <p className="px-4 pt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          {failedUploads.length} attachment{failedUploads.length === 1 ? "" : "s"} failed to upload
          and won't be sent.
        </p>
      )}

      <div className="px-4 py-3">
        <div
          className="flex cursor-text items-end gap-2 rounded-xl bg-muted/50 px-3 py-2 ring-1 ring-primary/30 transition-all"
          onClick={() => textareaRef.current?.focus()}
        >
          <EmojiPickerPopover onEmojiSelect={insertEmoji} />

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            readOnly={locked}
            maxLength={MESSAGE_TEXT_MAX}
            placeholder={
              attachments.length > 0
                ? "Add a caption..."
                : `Broadcast to ${pluralPeople(memberCount)}...`
            }
            className="max-h-[150px] min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files || []);
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />

          <Hint label="Attach files">
            <button
              type="button"
              aria-label="Attach files"
              disabled={locked || attachments.length >= MAX_ATTACHMENTS}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </Hint>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />

          <Hint label={unconfirmed ? "Retry" : uploading ? "Uploading…" : `Send to ${listName}`}>
            <button
              type="button"
              aria-label="Send broadcast"
              onClick={(e) => {
                e.stopPropagation();
                send();
              }}
              disabled={!canSend}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                canSend
                  ? "cursor-pointer bg-gradient-to-br from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] text-white shadow-sm hover:shadow-md"
                  : "text-muted-foreground/40"
              )}
            >
              {sending || uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : unconfirmed ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <SendHorizonal className="h-4.5 w-4.5" />
              )}
            </button>
          </Hint>
        </div>

        {(error || text.length > MESSAGE_TEXT_MAX * 0.9) && (
          <div className="mt-1.5 flex justify-end px-1 text-[10.5px]">
            {error ? (
              <span className="truncate font-medium text-destructive">{error}</span>
            ) : (
              <span className="text-muted-foreground/70">
                {text.length}/{MESSAGE_TEXT_MAX}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentTile({
  a,
  locked,
  onRemove,
  onRetry,
}: {
  a: Attachment;
  locked: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted",
        a.status === "error" ? "border-destructive/60" : "border-border"
      )}
      title={a.error ? `${a.file.name} — ${a.error}` : a.file.name}
    >
      {a.previewUrl ? (
        <img src={a.previewUrl} alt={a.file.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
          {a.kind === "VIDEO" ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          <span className="w-full truncate text-center text-[9px]">{a.file.name}</span>
        </div>
      )}
      {a.status === "uploading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
      {a.status === "error" && (
        <button
          type="button"
          onClick={onRetry}
          disabled={locked}
          aria-label={`Retry uploading ${a.file.name}`}
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-0.5 bg-destructive/15 text-[9px] font-semibold text-destructive"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${a.file.name}`}
          className="absolute right-0.5 top-0.5 cursor-pointer rounded-full bg-background/80 p-0.5 text-foreground shadow-sm"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
