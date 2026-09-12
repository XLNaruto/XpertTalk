import type { EventRecord } from "@/lib/events-api";
import { hasStarted } from "@/lib/event-reminders";
import { cn } from "@/lib/utils";

/**
 * `completed` is set by the server once the start time passes; a scheduled
 * event whose time has just gone by is shown as completed too so the list and
 * the server never disagree for the few minutes before the sweep runs.
 */
export function EventStatusChip({
  event,
  className,
}: {
  event: Pick<EventRecord, "status" | "eventTime">;
  className?: string;
}) {
  const started = hasStarted(event.eventTime);
  const state =
    event.status === "cancelled"
      ? "cancelled"
      : event.status === "completed" || started
        ? "completed"
        : "scheduled";

  if (state === "scheduled") return null;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
        state === "cancelled"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground",
        className
      )}
    >
      {state}
    </span>
  );
}
