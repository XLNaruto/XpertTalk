import { useEffect, useState } from "react";
import { History, Loader2, Megaphone, Plus, RefreshCw, Users } from "lucide-react";

import { broadcastPreview, type BroadcastListSummary } from "@/lib/broadcast-api";
import { formatTimeAgo } from "@/lib/message-formatters";
import { useBroadcastStore } from "@/stores/broadcast-store";
import { BroadcastAvatar } from "@/components/broadcast/broadcast-shared";
import { BroadcastListDialog, type ListDialogMode } from "@/components/broadcast/broadcast-list-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The sidebar body for the "Broadcast" filter: your lists as chat-style rows.
 * Selecting one opens it as a chat in the main area.
 */
export function BroadcastSidebarList({ onOpenList }: { onOpenList: (id: string) => void }) {
  const lists = useBroadcastStore((s) => s.lists);
  const loading = useBroadcastStore((s) => s.listsLoading);
  const loaded = useBroadcastStore((s) => s.listsLoaded);
  const error = useBroadcastStore((s) => s.listsError);
  const hasMore = useBroadcastStore((s) => s.listsHasMore);
  const refresh = useBroadcastStore((s) => s.refreshLists);
  const loadMore = useBroadcastStore((s) => s.loadMoreLists);
  const upsertList = useBroadcastStore((s) => s.upsertList);
  const activeListId = useBroadcastStore((s) => s.activeListId);
  const openHistory = () => {
    useBroadcastStore.getState().open();
    useBroadcastStore.getState().setTab("history");
  };
  const [dialog, setDialog] = useState<ListDialogMode | null>(null);

  // Fresh every time the filter is picked — last-broadcast outcomes move.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDialog = (
    <BroadcastListDialog
      mode={dialog}
      onOpenChange={(open) => !open && setDialog(null)}
      onDone={(created) => {
        if (!created) return;
        upsertList({
          broadcastlistId: created.broadcastlistId,
          name: created.name,
          memberCount: created.memberCount,
          maxMembers: created.maxMembers,
          lastBroadcast: null,
          created: created.created,
        });
        onOpenList(created.broadcastlistId);
        refresh();
      }}
    />
  );

  if (!loaded && loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && lists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div
        className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center px-8"
        style={{ animation: "fadeUpIn 0.5s ease-out" }}
      >
        <div className="relative mb-6">
          <div
            className="absolute inset-0 rounded-full bg-primary/10"
            style={{ animation: "scalePulse 3s ease-in-out infinite" }}
          />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
            <Megaphone className="h-9 w-9 text-primary" strokeWidth={1.8} />
          </div>
        </div>
        <p className="text-[15px] font-bold text-foreground">No broadcast lists yet</p>
        <p className="mt-1.5 text-center text-xs leading-relaxed text-muted-foreground/60">
          Send one message to many people at once —
          <br />
          each gets it in their private chat with you.
        </p>
        <Button
          size="sm"
          className="mt-4 [.dark:not(.accent-black)_&]:text-white"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Plus className="h-4 w-4" />
          New broadcast list
        </Button>
        {createDialog}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2 pb-2 pt-1">
      <div className="flex items-center gap-1 px-1 pb-1">
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="h-4.5 w-4.5" />
          </span>
          <span className="text-[13px] font-semibold text-primary">New broadcast list</span>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
          title="Broadcast history"
          aria-label="Broadcast history"
          onClick={openHistory}
        >
          <History className="h-4 w-4" />
        </Button>
      </div>

      {lists.map((l) => (
        <BroadcastSidebarItem
          key={l.broadcastlistId}
          list={l}
          isActive={l.broadcastlistId === activeListId}
          onClick={() => onOpenList(l.broadcastlistId)}
        />
      ))}

      {hasMore && (
        <Button variant="ghost" size="sm" className="w-full" disabled={loading} onClick={loadMore}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Load more
        </Button>
      )}
      {createDialog}
    </div>
  );
}

function BroadcastSidebarItem({
  list,
  isActive,
  onClick,
}: {
  list: BroadcastListSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  const last = list.lastBroadcast;
  const preview = last ? broadcastPreview(last) : "";
  const missed = last ? (last.skippedCount || 0) + (last.failedCount || 0) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "chat-item relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150",
        isActive ? "chat-item-active" : "hover:bg-muted/60"
      )}
    >
      {isActive && <div className="chat-active-bar" />}
      <BroadcastAvatar size="lg" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-semibold",
              isActive ? "text-primary" : "text-foreground"
            )}
          >
            {list.name}
          </span>
          {last?.created && (
            <span className="whitespace-nowrap text-[10.5px] font-medium text-muted-foreground">
              {formatTimeAgo(last.created)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-muted-foreground">
            {last ? (
              <>
                <span className="shrink-0 font-semibold text-primary/70">You:</span>
                <span className="truncate">{preview}</span>
              </>
            ) : (
              <>
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {list.memberCount === 0
                    ? "No recipients yet"
                    : `${list.memberCount} recipient${list.memberCount === 1 ? "" : "s"}`}
                </span>
              </>
            )}
          </span>
          {last?.status === "PENDING" ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          ) : last?.status === "FAILED" ? (
            <span className="shrink-0 text-[10px] font-semibold text-destructive">Failed</span>
          ) : missed > 0 ? (
            <span
              className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              title={`${missed} didn't receive the last broadcast`}
            >
              {last!.sentCount}/{last!.recipientCount}
            </span>
          ) : last ? (
            <span className="shrink-0 text-[10px] text-muted-foreground/70">
              {list.memberCount}
              <Users className="ml-0.5 inline h-2.5 w-2.5 align-[-1px]" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
