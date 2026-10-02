import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Paperclip, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  broadcastPreview,
  fetchBroadcastReport,
  type DeliveryStatus,
  type HistoryRow,
  type ReportRow,
  formatBroadcastTime,
} from "@/lib/broadcast-api";
import { useOpenPrivateChat } from "@/hooks/use-open-private-chat";
import { useBroadcastStore } from "@/stores/broadcast-store";
import {
  BroadcastProgressBar,
  BroadcastStatusChip,
  DeliveryRow,
} from "@/components/broadcast/broadcast-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";

type Filter = "ALL" | DeliveryStatus;
const PAGE = 50;
/** While the send is still going, keep the counts moving. */
const PENDING_REFRESH_MS = 3_000;

/**
 * Read-only report for one broadcast. Re-fetched every time it opens — read
 * counts keep changing after the send.
 */
export function BroadcastReportView({ broadcastId }: { broadcastId: string }) {
  const pop = useBroadcastStore((s) => s.pop);
  const push = useBroadcastStore((s) => s.push);
  const close = useBroadcastStore((s) => s.close);
  const openChat = useOpenPrivateChat();
  // A tracked send's live counts — fresher than our last fetch.
  const tracked = useBroadcastStore((s) => s.tracked[broadcastId]);

  const [summary, setSummary] = useState<HistoryRow | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const req = ++requestRef.current;
      setLoading(true);
      const result = await fetchBroadcastReport({
        broadcastId,
        status: filter === "ALL" ? undefined : filter,
        limit: PAGE,
        offset,
      });
      if (req !== requestRef.current) return;
      setLoading(false);
      if (!result.ok) {
        if (result.kind === "rejected" && result.status === 404) {
          toast.error(result.message);
          pop();
          return;
        }
        setError(result.message);
        return;
      }
      setError(null);
      setSummary(result.data.broadcast);
      setRows((prev) => (offset === 0 ? result.data.list : [...prev, ...result.data.list]));
      setTotal(result.data.pagination.total);
      setHasMore(result.data.pagination.hasMore);
    },
    [broadcastId, filter, pop]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // Still sending — refresh the first page until it settles.
  const pending = (tracked?.status ?? summary?.status) === "PENDING";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => load(0), PENDING_REFRESH_MS);
    return () => clearInterval(t);
  }, [pending, load]);

  const counts = tracked && tracked.status === "PENDING" ? tracked : summary;
  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "ALL", label: "All", count: counts?.recipientCount },
    { key: "SENT", label: "Delivered", count: counts?.sentCount },
    { key: "SKIPPED", label: "Skipped", count: counts?.skippedCount },
    { key: "FAILED", label: "Failed", count: counts?.failedCount },
  ];
  if (pending) filters.push({ key: "PENDING", label: "Pending" });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border bg-popover px-2 py-2.5 pr-12">
        <Button variant="ghost" size="icon-sm" onClick={pop} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight text-foreground">
            Delivery report
          </p>
          {summary && (
            <p className="truncate text-[11px] text-muted-foreground">
              {summary.listName} · {formatBroadcastTime(summary.created)}
            </p>
          )}
        </div>
        <Hint label="Refresh">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh report"
            onClick={() => load(0)}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </Hint>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!summary && loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !summary && error ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load(0)}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : summary ? (
          <>
            {/* The message itself */}
            <div className="space-y-3 border-b border-border p-4">
              <div className="rounded-xl border border-border bg-popover p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs font-semibold",
                      summary.listDeleted && "text-muted-foreground line-through"
                    )}
                  >
                    {summary.listName}
                  </span>
                  <BroadcastStatusChip status={counts?.status ?? summary.status} />
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                  {summary.messageText || broadcastPreview(summary)}
                </p>
                {summary.mediaCount > 0 && summary.messageText && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3 w-3" />
                    {broadcastPreview({ ...summary, messageText: "" })}
                  </p>
                )}
                {(summary.mediaItems || []).some((m) => m.mediaType === "IMAGE") && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto">
                    {(summary.mediaItems || [])
                      .filter((m) => m.mediaType === "IMAGE")
                      .slice(0, 5)
                      .map((m) => (
                        <img
                          key={m.mediaId}
                          src={m.mediaPath}
                          alt={m.mediaName}
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                      ))}
                  </div>
                )}
              </div>

              {counts && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Stat label="Delivered" value={counts.sentCount} total={counts.recipientCount} />
                    <Stat label="Read" value={summary.readCount} tone="primary" />
                    <Stat label="Skipped" value={counts.skippedCount} tone="amber" />
                    <Stat label="Failed" value={counts.failedCount} tone="destructive" />
                  </div>
                  <BroadcastProgressBar counts={counts} />
                </>
              )}
              {summary.listDeleted ? (
                <p className="text-[11px] text-muted-foreground">This list has since been deleted.</p>
              ) : (
                summary.broadcastlistId && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-primary"
                    onClick={() =>
                      push({ kind: "list", broadcastlistId: summary.broadcastlistId! })
                    }
                  >
                    Open list
                  </Button>
                )
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-1.5 overflow-x-auto px-4 pt-3">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {f.label}
                  {typeof f.count === "number" && (
                    <span className="ml-1 opacity-70">{f.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className={cn("px-2 py-2", loading && "opacity-60")}>
              {rows.length === 0 && !loading ? (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  No one in this group.
                </p>
              ) : (
                rows.map((row) => (
                  <DeliveryRow
                    key={row.recipientChatuserId}
                    row={row}
                    onOpenChat={(r) => {
                      if (!r.talkId) return;
                      close();
                      openChat({
                        talkId: r.talkId,
                        chatuserId: r.recipientChatuserId,
                        userType: r.recipientType,
                        name: r.name,
                        profile: r.profile,
                      });
                    }}
                  />
                ))
              )}
              {hasMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full"
                  disabled={loading}
                  onClick={() => load(rows.length)}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load more ({total - rows.length} left)
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total?: number;
  tone?: "primary" | "amber" | "destructive";
}) {
  return (
    <div className="rounded-lg border border-border bg-popover px-2 py-2 text-center">
      <p
        className={cn(
          "text-base font-bold tabular-nums text-foreground",
          tone === "primary" && "text-primary",
          tone === "amber" && value > 0 && "text-amber-600 dark:text-amber-400",
          tone === "destructive" && value > 0 && "text-destructive"
        )}
      >
        {value ?? 0}
        {typeof total === "number" && (
          <span className="text-xs font-medium text-muted-foreground">/{total}</span>
        )}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
