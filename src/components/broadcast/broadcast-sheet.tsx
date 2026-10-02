import { useState } from "react";
import { History, Loader2, Megaphone, Plus, RefreshCw } from "lucide-react";

import { useBroadcastStore, type BroadcastTab } from "@/stores/broadcast-store";
import type { BroadcastListSummary } from "@/lib/broadcast-api";
import {
  BroadcastListDialog,
  type ListDialogMode,
} from "@/components/broadcast/broadcast-list-dialog";
import { BroadcastListDetailView } from "@/components/broadcast/broadcast-list-detail";
import { BroadcastReportView } from "@/components/broadcast/broadcast-report";
import {
  BroadcastHistoryRow,
  BroadcastListRow,
  TrackedSendCard,
} from "@/components/broadcast/broadcast-rows";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";

/**
 * The broadcast surface. A tabbed home (lists / history) with list detail and
 * delivery reports pushed on top. Sending happens in the list's chat view.
 */
export function BroadcastSheet() {
  const isOpen = useBroadcastStore((s) => s.isOpen);
  const close = useBroadcastStore((s) => s.close);
  const stack = useBroadcastStore((s) => s.stack);
  const top = stack[stack.length - 1];

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Broadcast lists</SheetTitle>
          <SheetDescription className="sr-only">
            Send one message privately to many people.
          </SheetDescription>

          {top?.kind === "list" ? (
            <BroadcastListDetailView key={top.broadcastlistId} broadcastlistId={top.broadcastlistId} />
          ) : top?.kind === "report" ? (
            <BroadcastReportView key={top.broadcastId} broadcastId={top.broadcastId} />
          ) : (
            <BroadcastHome />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function BroadcastHome() {
  const tab = useBroadcastStore((s) => s.tab);
  const setTab = useBroadcastStore((s) => s.setTab);
  const push = useBroadcastStore((s) => s.push);
  const openReport = useBroadcastStore((s) => s.openReport);
  const openListChat = useBroadcastStore((s) => s.openListChat);
  const upsertList = useBroadcastStore((s) => s.upsertList);
  const refreshLists = useBroadcastStore((s) => s.refreshLists);
  const refreshHistory = useBroadcastStore((s) => s.refreshHistory);
  const listsLoading = useBroadcastStore((s) => s.listsLoading);
  const historyLoading = useBroadcastStore((s) => s.historyLoading);
  const tracked = useBroadcastStore((s) => s.tracked);
  const dismissTracked = useBroadcastStore((s) => s.dismissTracked);

  const [dialog, setDialog] = useState<ListDialogMode | null>(null);
  const trackedSends = Object.values(tracked);
  const loading = tab === "lists" ? listsLoading : historyLoading;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-popover px-4 py-3 pr-12">
        <Megaphone className="h-4 w-4 text-primary" />
        <span className="text-[15px] font-bold tracking-tight text-foreground">Broadcasts</span>
        <div className="ml-auto flex items-center gap-1">
          <Hint label="Refresh">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh"
              onClick={() => (tab === "lists" ? refreshLists() : refreshHistory())}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </Hint>
          <Button
            size="sm"
            className="[.dark:not(.accent-black)_&]:text-white"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus className="h-4 w-4" />
            New list
          </Button>
        </div>
      </div>

      {trackedSends.length > 0 && (
        <div className="space-y-2 border-b border-border p-3">
          {trackedSends.map((t) => (
            <TrackedSendCard
              key={t.broadcastId}
              send={t}
              onOpen={() => openReport(t.broadcastId)}
              onDismiss={() => dismissTracked(t.broadcastId)}
            />
          ))}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as BroadcastTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="lists" className="flex-1">
              <Megaphone className="h-3.5 w-3.5" />
              Lists
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lists" className="min-h-0 flex-1 overflow-y-auto">
          <ListsTab
            onCreate={() => setDialog({ kind: "create" })}
            onOpen={(l) => push({ kind: "list", broadcastlistId: l.broadcastlistId })}
            onCompose={(l) => openListChat(l.broadcastlistId)}
          />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <HistoryTab
            onOpen={(id) => push({ kind: "report", broadcastId: id })}
            onOpenList={(id) => push({ kind: "list", broadcastlistId: id })}
          />
        </TabsContent>
      </Tabs>

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
          push({ kind: "list", broadcastlistId: created.broadcastlistId });
          refreshLists();
        }}
      />
    </div>
  );
}

function ListsTab({
  onCreate,
  onOpen,
  onCompose,
}: {
  onCreate: () => void;
  onOpen: (l: BroadcastListSummary) => void;
  onCompose: (l: BroadcastListSummary) => void;
}) {
  const lists = useBroadcastStore((s) => s.lists);
  const loading = useBroadcastStore((s) => s.listsLoading);
  const loaded = useBroadcastStore((s) => s.listsLoaded);
  const error = useBroadcastStore((s) => s.listsError);
  const hasMore = useBroadcastStore((s) => s.listsHasMore);
  const refresh = useBroadcastStore((s) => s.refreshLists);
  const loadMore = useBroadcastStore((s) => s.loadMoreLists);

  if (!loaded && loading) return <Spinner />;
  if (error && lists.length === 0) return <ErrorState message={error} onRetry={refresh} />;
  if (lists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Megaphone className="h-7 w-7 text-primary" strokeWidth={1.6} />
        </div>
        <p className="text-sm font-medium text-foreground">No broadcast lists yet</p>
        <p className="max-w-[260px] text-xs text-muted-foreground">
          Save a group of people once, then send them all the same message — each one gets it in
          their own private chat with you.
        </p>
        <Button size="sm" className="mt-2 [.dark:not(.accent-black)_&]:text-white" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Create a list
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-3">
      {lists.map((l) => (
        <BroadcastListRow
          key={l.broadcastlistId}
          list={l}
          onOpen={() => onOpen(l)}
          onCompose={() => onCompose(l)}
        />
      ))}
      {hasMore && <LoadMore loading={loading} onClick={loadMore} />}
    </div>
  );
}

function HistoryTab({
  onOpen,
  onOpenList,
}: {
  onOpen: (broadcastId: string) => void;
  onOpenList: (broadcastlistId: string) => void;
}) {
  const history = useBroadcastStore((s) => s.history);
  const loading = useBroadcastStore((s) => s.historyLoading);
  const loaded = useBroadcastStore((s) => s.historyLoaded);
  const error = useBroadcastStore((s) => s.historyError);
  const hasMore = useBroadcastStore((s) => s.historyHasMore);
  const refresh = useBroadcastStore((s) => s.refreshHistory);
  const loadMore = useBroadcastStore((s) => s.loadMoreHistory);

  if (!loaded) return <Spinner />;
  if (error && history.length === 0) return <ErrorState message={error} onRetry={refresh} />;
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <History className="h-8 w-8 text-primary" strokeWidth={1.6} />
        <p className="text-sm font-medium text-foreground">Nothing sent yet</p>
        <p className="text-xs text-muted-foreground">Everything you broadcast shows up here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-3">
      {history.map((row) => (
        <BroadcastHistoryRow
          key={row.broadcastId}
          row={row}
          onOpen={() => onOpen(row.broadcastId)}
          onOpenList={row.broadcastlistId ? () => onOpenList(row.broadcastlistId!) : undefined}
        />
      ))}
      {hasMore && <LoadMore loading={loading} onClick={loadMore} />}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

function LoadMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="w-full" disabled={loading} onClick={onClick}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      Load more
    </Button>
  );
}
