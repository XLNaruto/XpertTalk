import {
  CheckCheck,
  CircleAlert,
  CircleSlash,
  Clock,
  Megaphone,
  MessageCircle,
  Trash2,
} from "lucide-react";

import {
  reasonText,
  resolvedCount,
  type BroadcastCounts,
  type BroadcastStatus,
  type Delivery,
  type DeliveryStatus,
  type ReportRow,
} from "@/lib/broadcast-api";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Status chip ─────────────────────────────────────────────────────

const STATUS_STYLE: Record<BroadcastStatus, { label: string; className: string }> = {
  SENT: {
    label: "Sent",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  PARTIAL: {
    label: "Partial",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  FAILED: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  PENDING: { label: "Sending", className: "bg-primary/10 text-primary" },
};

export function BroadcastStatusChip({
  status,
  className,
}: {
  status: BroadcastStatus;
  className?: string;
}) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.SENT;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style.className,
        className
      )}
    >
      {style.label}
    </span>
  );
}

// ── Progress bar ────────────────────────────────────────────────────

/** Resolved (sent + skipped + failed) out of recipients, with a sent segment. */
export function BroadcastProgressBar({
  counts,
  className,
}: {
  counts: BroadcastCounts;
  className?: string;
}) {
  const total = Math.max(1, counts.recipientCount || 0);
  const sent = Math.min(100, ((counts.sentCount || 0) / total) * 100);
  const other = Math.min(
    100 - sent,
    (((counts.skippedCount || 0) + (counts.failedCount || 0)) / total) * 100
  );
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={counts.recipientCount}
      aria-valuenow={resolvedCount(counts)}
    >
      <div className="flex h-full">
        <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${sent}%` }} />
        <div
          className="h-full bg-amber-400 transition-[width] duration-500"
          style={{ width: `${other}%` }}
        />
      </div>
    </div>
  );
}

// ── Delivery row ────────────────────────────────────────────────────

const DELIVERY_ICON: Record<DeliveryStatus, typeof Clock> = {
  SENT: CheckCheck,
  SKIPPED: CircleSlash,
  FAILED: CircleAlert,
  PENDING: Clock,
};

/**
 * One recipient's outcome. `onOpenChat` renders an explicit "Open chat" button
 * — the row itself is never a click target.
 */
export function DeliveryRow({
  row,
  onOpenChat,
}: {
  row: Delivery | ReportRow;
  onOpenChat?: (row: Delivery | ReportRow) => void;
}) {
  const Icon = DELIVERY_ICON[row.status] || Clock;
  const report = "isRead" in row ? row : null;
  const reason = reasonText(row.reason, row.reasonMessage);

  let detail = "";
  let detailClass = "text-muted-foreground";
  if (row.status === "SENT") {
    if (report?.isDeleted) {
      detail = "Message deleted";
    } else if (report?.isRead) {
      detail = "Read";
      detailClass = "text-primary";
    } else {
      detail = "Delivered";
    }
  } else if (row.status === "PENDING") {
    detail = "Sending…";
  } else {
    detail = reason || (row.status === "FAILED" ? "Couldn't deliver" : "Skipped");
    detailClass = row.status === "FAILED" ? "text-destructive" : "text-amber-600 dark:text-amber-400";
  }

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
      <UserAvatar src={row.profile || undefined} name={row.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.name || "Unknown"}</p>
        <p className={cn("flex items-center gap-1 truncate text-xs", detailClass)}>
          {report?.isDeleted ? (
            <Trash2 className="h-3 w-3 shrink-0" />
          ) : (
            <Icon className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{detail}</span>
        </p>
      </div>
      {onOpenChat && row.status === "SENT" && row.talkId && (
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => onOpenChat(row)}
        >
          <MessageCircle />
          Open chat
        </Button>
      )}
    </div>
  );
}

// ── List avatar ─────────────────────────────────────────────────────

/** A broadcast list has no picture — it's always the megaphone. */
export function BroadcastAvatar({ size = "default" }: { size?: "default" | "lg" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] text-white shadow-sm",
        size === "lg" ? "h-11 w-11" : "h-9 w-9"
      )}
    >
      <Megaphone className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </div>
  );
}
