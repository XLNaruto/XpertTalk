import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bell,
  CalendarClock,
  Loader2,
  Pencil,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { useEventsStore } from "@/stores/events-store";
import type {
  ApiResult,
  EventParticipant,
  EventRecord,
} from "@/lib/events-api";
import {
  describeReminders,
  formatCountdown,
  formatEventDateTime,
  formatReminderAt,
  parseServerDate,
  reminderSchedule,
  reminderTypeLabel,
} from "@/lib/event-reminders";
import { ParticipantPicker } from "@/components/events/participant-picker";
import { displayName, type SelectedUser } from "@/lib/event-users";
import { EventStatusChip } from "@/components/events/event-status-chip";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/tooltip";

interface EventDetailsProps {
  event: EventRecord | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onEdit: (event: EventRecord) => void;
}

export function EventDetails({
  event,
  loading,
  error,
  onBack,
  onEdit,
}: EventDetailsProps) {
  const cancel = useEventsStore((s) => s.cancel);
  const removePerson = useEventsStore((s) => s.removePerson);

  const [confirmCancel, setConfirmCancel] = useState(false);
  /** The participant awaiting a remove confirmation — removal is not undoable. */
  const [pendingRemove, setPendingRemove] = useState<EventParticipant | null>(
    null
  );
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A label only — it cannot notify anyone, so a coarse tick is enough.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const schedule = useMemo(
    () => (event ? reminderSchedule(event, now) : []),
    [event, now]
  );

  if (loading && !event) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {error || "This event is no longer available."}
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to events
        </Button>
      </div>
    );
  }

  // The server re-authorizes every write — hiding these is a convenience, and
  // a 422 is still handled below.
  const canManage = event.isCreator && event.status === "scheduled";
  const countdown =
    event.status === "scheduled" ? formatCountdown(event.eventTime, now) : "";
  const cancelledAt = parseServerDate(event.cancelledAt);

  const handleWrite = async (
    run: () => Promise<ApiResult<EventRecord>>,
    successMessage: string
  ) => {
    setBusy(true);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      toast.success(successMessage);
      return true;
    }
    // 422 arrives here even when the control was hidden (e.g. the event was
    // cancelled from another device a moment ago).
    toast.error(result.message);
    return false;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-popover px-4 py-3 pr-12">
        <Hint label="Back to events">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to events"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Hint>
        <span className="text-sm font-semibold">Event details</span>
        {loading && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-5 p-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold leading-tight text-foreground">
                {event.title}
              </h2>
              <EventStatusChip event={event} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
              <span>{formatEventDateTime(event.eventTime)}</span>
            </div>
            {countdown && (
              <p className="text-xs font-medium text-primary">{countdown}</p>
            )}
            {cancelledAt && (
              <p className="text-xs text-muted-foreground">
                Cancelled on {formatEventDateTime(event.cancelledAt)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Created by
            </p>
            <div className="flex items-center gap-2.5">
              <UserAvatar
                src={event.creatorProfileUrl}
                name={event.creatorName || "Unknown"}
                size="sm"
              />
              <span className="text-sm text-foreground">
                {event.creatorName || "Unknown"}
                {event.isCreator && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (you)
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                Participants ({event.participants.length})
              </p>
              {canManage && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setAddOpen(true)}
                  disabled={busy}
                >
                  <UserPlus className="h-3 w-3" />
                  Add
                </Button>
              )}
            </div>
            {event.participants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No participants on this event.
              </p>
            ) : (
              <div className="space-y-1">
                {event.participants.map((p) => (
                  <div
                    key={p.id || p.chatuserId}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-xs"
                  >
                    <UserAvatar
                      src={p.profileUrl}
                      name={displayName(p)}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {displayName(p)}
                    </span>
                    {canManage && (
                      <Hint label={`Remove ${displayName(p)}`}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${displayName(p)}`}
                          disabled={busy}
                          onClick={() => setPendingRemove(p)}
                        >
                          <UserMinus className="h-3 w-3" />
                        </Button>
                      </Hint>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Reminders
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {describeReminders(event.reminderSlots, event.remindersPerDay)}
            </p>
            {schedule.length > 0 ? (
              <div className="rounded-lg border border-border bg-popover p-2.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Bell className="h-3.5 w-3.5 text-primary" />
                  Next reminder — {formatReminderAt(schedule[0].at)}
                  <span className="text-muted-foreground">
                    ({reminderTypeLabel(schedule[0].type)})
                  </span>
                </div>
                {schedule.length > 1 && (
                  <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                    {schedule.length - 1} more reminder
                    {schedule.length - 1 === 1 ? "" : "s"} after that.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No further reminders for this event.
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      {canManage && (
        <div className="flex gap-2 border-t border-border bg-popover p-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onEdit(event)}
            disabled={busy}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => setConfirmCancel(true)}
            disabled={busy}
          >
            <Ban className="h-4 w-4" />
            Cancel event
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Remove participant"
        description={
          pendingRemove
            ? `Remove ${displayName(pendingRemove)} from this event? Their pending reminders stop immediately.`
            : ""
        }
        confirmText="Remove"
        onConfirm={() => {
          const person = pendingRemove;
          setPendingRemove(null);
          if (!person) return;
          handleWrite(
            () =>
              removePerson(
                event.id,
                String(person.chatuserId),
                String(person.userType || person.externalType || "")
              ),
            `${displayName(person)} removed`
          );
        }}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel event"
        description="Reminders stop and everyone invited is notified. The event stays in the list as cancelled."
        confirmText="Cancel event"
        onConfirm={() =>
          handleWrite(
            () => cancel(event.id, event.clientEventId),
            "Event cancelled"
          )
        }
      />

      {addOpen && (
        <AddParticipantsDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          event={event}
        />
      )}
    </div>
  );
}

function AddParticipantsDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
}) {
  const addPeople = useEventsStore((s) => s.addPeople);
  const [picked, setPicked] = useState<SelectedUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedIds = event.participants.map((p) => String(p.chatuserId));

  const submit = async () => {
    if (picked.length === 0) {
      setError("Pick at least one person to add.");
      return;
    }
    setSubmitting(true);
    const result = await addPeople(
      event.id,
      picked.map((p) => ({
        chatuserId: String(p.chatuserId),
        ...(p.userType ? { userType: p.userType } : {}),
      }))
    );
    setSubmitting(false);
    if (result.ok) {
      toast.success("Participants added");
      onOpenChange(false);
      return;
    }
    setError(result.message);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add participants</DialogTitle>
        </DialogHeader>
        <ParticipantPicker
          value={picked}
          onChange={setPicked}
          lockedIds={lockedIds}
        />
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="dark:text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
