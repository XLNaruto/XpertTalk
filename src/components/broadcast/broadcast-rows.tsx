import { Eye, Megaphone, Send, Users, X } from "lucide-react";

import {
  broadcastPreview,
  outcomeHeadline,
  outcomeNote,
  type BroadcastListSummary,
  type HistoryRow,
  formatBroadcastTime,
  pluralPeople,
} from "@/lib/broadcast-api";
import type { TrackedSend } from "@/stores/broadcast-store";
import {
  BroadcastProgressBar,
  BroadcastStatusChip,
} from "@/components/broadcast/broadcast-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";

const ROW =
  "w-full cursor-pointer rounded-xl border border-border bg-popover p-3 text-left shadow-xs transition-all hover:border-primary/40 hover:shadow-md";

// ── A list on the lists screen ──────────────────────────────────────

export function BroadcastListRow({
  list,
  onOpen,
  onCompose,
}: {
  list: BroadcastListSummary;
  onOpen: () => void;
  onCompose: () => void;
}) {
  const last = list.lastBroadcast;
  const preview = last ? broadcastPreview(last) : "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(ROW, "flex items-center gap-3")}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Megaphone className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {list.name}
          </span>
          {last && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatBroadcastTime(last.created)}
            </span>
          )}
        </div>
        {last ? (
          <>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <BroadcastStatusChip status={last.status} />
              <span className="truncate">
                {last.status === "PENDING" ? "In progress" : outcomeHeadline(last)}
              </span>
            </p>
          </>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {list.memberCount === 0 ? "No one yet" : pluralPeople(list.memberCount)} · Nothing
            sent yet
          </p>
        )}
      </div>

      <Hint
        label={list.memberCount === 0 ? "Add people first" : `Broadcast to ${list.name}`}
        className="shrink-0"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label={`Broadcast to ${list.name}`}
          disabled={list.memberCount === 0}
          onClick={(e) => {
            e.stopPropagation();
            onCompose();
          }}
        >
          <Send className="h-4 w-4" />
        </Button>
      </Hint>
    </div>
  );
}

// ── One broadcast in history ────────────────────────────────────────

export function BroadcastHistoryRow({
  row,
  onOpen,
  onOpenList,
  showList = true,
}: {
  row: HistoryRow;
  onOpen: () => void;
  /** Omit on a list's own history — you're already there. */
  onOpenList?: () => void;
  showList?: boolean;
}) {
  const note = outcomeNote(row);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={ROW}
    >
      <div className="flex items-center gap-2">
        {showList && (
          <Hint label={row.listDeleted ? "This list was deleted" : undefined}>
            <span
              className={cn(
                "min-w-0 truncate text-xs font-semibold",
                row.listDeleted ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {row.listName}
            </span>
          </Hint>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {formatBroadcastTime(row.created)}
        </span>
        <BroadcastStatusChip status={row.status} />
      </div>

      <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
        {broadcastPreview(row) || <span className="italic text-muted-foreground">Empty</span>}
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {row.sentCount}/{row.recipientCount} delivered
        </span>
        {row.sentCount > 0 && (
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Read by {row.readCount}
          </span>
        )}
        {note && <span className="text-amber-600 dark:text-amber-400">{note}</span>}
        {showList && onOpenList && (
          <Hint label={row.listDeleted ? "This list was deleted" : "Open list"} className="ml-auto">
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto h-5 px-1.5 text-[11px] text-primary hover:bg-primary/10 hover:text-primary"
              disabled={row.listDeleted}
              onClick={(e) => {
                e.stopPropagation();
                onOpenList();
              }}
            >
              {row.listDeleted ? "List deleted" : "Open list"}
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
}

// ── A send in progress (PENDING) ────────────────────────────────────

export function TrackedSendCard({
  send,
  onOpen,
  onDismiss,
}: {
  send: TrackedSend;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const pending = send.status === "PENDING";
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {send.listName}
        </span>
        <BroadcastStatusChip status={send.status} />
        {!pending && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{outcomeHeadline(send)}</p>
      <BroadcastProgressBar counts={send} className="mt-2" />
      <div className="mt-1.5 flex justify-end">
        <Button variant="ghost" size="xs" className="text-primary" onClick={onOpen}>
          View report
        </Button>
      </div>
    </div>
  );
}
