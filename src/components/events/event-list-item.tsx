import { CalendarClock, Crown, Users } from "lucide-react";

import type { EventRecord } from "@/lib/events-api";
import { formatCountdown, formatShortDateTime } from "@/lib/event-reminders";
import { EventStatusChip } from "@/components/events/event-status-chip";
import { UserAvatar } from "@/components/shared/user-avatar";
import { displayName } from "@/lib/event-users";
import { cn } from "@/lib/utils";

const MAX_AVATARS = 3;

export function EventListItem({
  event,
  onClick,
}: {
  event: EventRecord;
  onClick: () => void;
}) {
  const countdown =
    event.status === "scheduled" ? formatCountdown(event.eventTime) : "";
  const extra = event.participants.length - MAX_AVATARS;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // `card` and `background` are the same colour in light mode, so rows
        // sit on `popover` — the one surface that is lighter than the page in
        // light mode and lighter than the page in dark mode too.
        "w-full cursor-pointer rounded-xl border border-border bg-popover p-3 text-left shadow-xs transition-all",
        "hover:border-primary/40 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold",
            event.status === "cancelled"
              ? "text-muted-foreground"
              : "text-foreground"
          )}
        >
          {event.title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {event.isCreator && (
            <Crown
              className="h-3 w-3 text-primary"
              aria-label="You created this event"
            >
              <title>You created this event</title>
            </Crown>
          )}
          <EventStatusChip event={event} />
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{formatShortDateTime(event.eventTime)}</span>
        {countdown && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="truncate text-primary">{countdown}</span>
          </>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {event.participants.length === 0 ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> No participants
          </span>
        ) : (
          <>
            {/* 24px circles with an 8px overlap clipped two-letter initials —
                full-size avatars keep the centred text readable. */}
            <div className="flex -space-x-2">
              {event.participants.slice(0, MAX_AVATARS).map((p) => (
                <UserAvatar
                  key={p.id || p.chatuserId}
                  src={p.profileUrl}
                  name={displayName(p)}
                  className="rounded-full ring-2 ring-popover"
                />
              ))}
            </div>
            <span className="ml-1 text-[11px] text-muted-foreground">
              {extra > 0
                ? `+${extra} more`
                : `${event.participants.length} participant${
                    event.participants.length === 1 ? "" : "s"
                  }`}
            </span>
          </>
        )}
      </div>
    </button>
  );
}
