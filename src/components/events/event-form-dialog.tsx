import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useEventsStore } from "@/stores/events-store";
import type { EventRecord } from "@/lib/events-api";
import {
  describeReminders,
  deviceTimezoneName,
  deviceUtcOffset,
  mintClientEventId,
  parseServerDate,
} from "@/lib/event-reminders";
import { ParticipantPicker } from "@/components/events/participant-picker";
import type { SelectedUser } from "@/lib/event-users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker, type TimeValue } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

const TITLE_MAX = 120;
const REMINDER_CHOICES = [1, 2, 3] as const;

interface FieldErrors {
  title?: string;
  date?: string;
  time?: string;
  participants?: string;
  /** Anything not attributable to one field — shown above the buttons. */
  form?: string;
}

/**
 * Put a server rejection under the field it is about. The wording is the
 * server's, shown verbatim; only its placement is decided here.
 */
function fieldForServerMessage(message: string): FieldErrors {
  const text = message.toLowerCase();
  if (text.includes("title")) return { title: message };
  if (text.includes("participant")) return { participants: message };
  if (text.includes("time") || text.includes("passed")) return { date: message };
  return { form: message };
}

/** The picked day and time-of-day as one local instant. */
function combine(day: Date | null, time: TimeValue | null): Date | null {
  if (!day || !time) return null;
  const out = new Date(day);
  out.setHours(time.hours, time.minutes, 0, 0);
  return out;
}

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode (full replacement); absent → create. */
  event?: EventRecord | null;
}

/**
 * The form body is mounted only while the dialog is open, so every field —
 * including the `clientEventId` — is initialised once per form instance
 * instead of being reset by an effect.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: EventFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            Everyone invited gets reminder notifications before it starts.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EventForm
            key={event?.id || "new"}
            event={event || null}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  event,
  submitting,
  setSubmitting,
  onDone,
}: {
  event: EventRecord | null;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onDone: () => void;
}) {
  const create = useEventsStore((s) => s.create);
  const update = useEventsStore((s) => s.update);
  const events = useEventsStore((s) => s.events);

  const isEdit = !!event;

  const [title, setTitle] = useState(event?.title || "");
  // Day and time-of-day are picked separately, then combined on submit.
  const [day, setDay] = useState<Date | null>(() =>
    event ? parseServerDate(event.eventTime) : null
  );
  const [time, setTime] = useState<TimeValue | null>(() => {
    const at = event ? parseServerDate(event.eventTime) : null;
    return at ? { hours: at.getHours(), minutes: at.getMinutes() } : null;
  });
  const [remindersPerDay, setRemindersPerDay] = useState(
    event?.remindersPerDay || 1
  );
  const [participants, setParticipants] = useState<SelectedUser[]>(() =>
    (event?.participants || []).map((p) => ({
      chatuserId: String(p.chatuserId),
      userType: String(p.userType || p.externalType || ""),
      firstName: p.firstName,
      lastName: p.lastName,
      profileUrl: p.profileUrl,
    }))
  );
  /** Per-field messages, rendered under the field they belong to. */
  const [errors, setErrors] = useState<FieldErrors>({});
  const [retryable, setRetryable] = useState(false);
  const [conflict, setConflict] = useState(false);

  /** Clear one field's message as soon as the user edits that field. */
  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  /**
   * Minted once per form instance and reused on every attempt — the server
   * dedupes on it, so a retried create yields one event, never two.
   */
  const clientEventIdRef = useRef(
    event?.clientEventId || mintClientEventId()
  );
  /** The `updatedAt` this form was loaded with — sent as `ifUpdatedAt`. */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(event?.updatedAt || "");

  /**
   * Reminder times are server-owned. Before an event exists there are no slots
   * of its own, so borrow them from an event already loaded with the same
   * reminders-per-day; otherwise describe the schedule without times.
   */
  const slotsHint = useMemo(() => {
    if (event?.reminderSlots?.length) return event.reminderSlots;
    const match = events.find(
      (e) => e.remindersPerDay === remindersPerDay && e.reminderSlots?.length
    );
    return match?.reminderSlots;
  }, [event, events, remindersPerDay]);

  const trimmedTitle = title.trim();

  /**
   * Picking a day fills in a sensible time when none is chosen yet — the next
   * whole hour — so the time field never blocks a submit on its own.
   */
  const pickDay = (next: Date) => {
    setDay(next);
    clearError("date");
    if (!time) {
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      const candidate = { hours: soon.getHours(), minutes: 0 };
      // Skip the default when the next hour has rolled past midnight and would
      // land in the past on the chosen day — better to ask than to prefill junk.
      const at = combine(next, candidate);
      if (at && at.getTime() > Date.now()) setTime(candidate);
    }
  };

  const submit = async () => {
    setRetryable(false);

    // Mirror the server's rules so the common mistakes fail fast — every
    // field is required, and the server's own 422 is still handled below.
    const next: FieldErrors = {};
    if (!trimmedTitle) next.title = "Event title is required.";
    else if (trimmedTitle.length > TITLE_MAX)
      next.title = "Event title must be 120 characters or fewer.";
    if (!day) next.date = "Pick a date for this event.";
    if (!time) next.time = "Pick a time for this event.";
    if (participants.length === 0)
      next.participants = "Add at least one participant to this event.";

    const at = combine(day, time);
    if (at && at.getTime() <= Date.now())
      next.date =
        "This event's time has already passed. Change the time and try again.";

    if (Object.keys(next).length > 0 || !at) {
      setErrors(next);
      return;
    }
    setErrors({});

    // UTC is the wire format — never a formatted local string.
    const eventTime = at.toISOString();
    const payload = {
      clientEventId: clientEventIdRef.current,
      title: trimmedTitle,
      eventTime,
      timezone: deviceUtcOffset(),
      timezoneName: deviceTimezoneName(),
      remindersPerDay,
      participants: participants.map((p) => ({
        chatuserId: String(p.chatuserId),
        ...(p.userType ? { userType: p.userType } : {}),
      })),
    };

    setSubmitting(true);
    const result = isEdit
      ? // A full replacement: title, time and the complete participant list.
        await update({
          ...payload,
          id: event!.id,
          ...(baseUpdatedAt ? { ifUpdatedAt: baseUpdatedAt } : {}),
        })
      : await create(payload);
    setSubmitting(false);

    if (result.ok) {
      toast.success(isEdit ? "Event updated" : "Event created");
      onDone();
      return;
    }

    if (result.kind === "transport") {
      // Safe to retry with the same clientEventId — no duplicate is created.
      setRetryable(true);
      setErrors({ form: result.message });
      return;
    }

    if (result.status === 409) {
      // The store already re-fetched; pick up the fresh precondition so the
      // user can re-apply their edit on top of it.
      const fresh = useEventsStore
        .getState()
        .events.find((e) => e.id === event?.id);
      setBaseUpdatedAt(fresh?.updatedAt || "");
      setConflict(true);
      setErrors({ form: result.message });
      return;
    }

    // 400/422 — permanent. Show the server's wording verbatim, under the field
    // it is about when that is clear, and keep the form open.
    setErrors(fieldForServerMessage(result.message));
  };

  return (
    <>
      {conflict && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This event was changed elsewhere — reloaded. Review your changes and
            save again.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="event-title">Title</Label>
          <span className="text-[11px] text-muted-foreground">
            {trimmedTitle.length}/{TITLE_MAX}
          </span>
        </div>
        <Input
          id="event-title"
          value={title}
          maxLength={TITLE_MAX}
          placeholder="Team meeting"
          aria-invalid={!!errors.title}
          onChange={(e) => {
            setTitle(e.target.value);
            clearError("title");
          }}
        />
        <FieldError message={errors.title} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event-date">Date & time</Label>
        <div className="grid grid-cols-2 gap-2">
          <DatePicker
            id="event-date"
            value={day}
            onChange={pickDay}
            minDate={new Date()}
            invalid={!!errors.date}
          />
          <TimePicker
            value={time}
            invalid={!!errors.time}
            onChange={(next) => {
              setTime(next);
              clearError("time");
              clearError("date");
            }}
          />
        </div>
        <FieldError message={errors.date || errors.time} />
      </div>

      <div className="space-y-1.5">
        <Label>Reminders per day</Label>
        <div className="flex gap-2">
          {REMINDER_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRemindersPerDay(n)}
              className={cn(
                "h-9 flex-1 cursor-pointer rounded-lg border text-sm font-medium transition-colors",
                remindersPerDay === n
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-accent"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {describeReminders(slotsHint, remindersPerDay)}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Participants</Label>
        <ParticipantPicker
          value={participants}
          invalid={!!errors.participants}
          onChange={(next) => {
            setParticipants(next);
            clearError("participants");
          }}
        />
        <FieldError message={errors.participants} />
      </div>

      {errors.form && (
        <p className="text-xs font-medium text-destructive">{errors.form}</p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={submitting}
          // White label on dark accents; black accent's light-grey button keeps dark text.
          className="[.dark:not(.accent-black)_&]:text-white"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {retryable && !submitting && <RefreshCw className="h-4 w-4" />}
          {retryable && !submitting
            ? "Retry"
            : isEdit
              ? "Save changes"
              : "Create event"}
        </Button>
      </DialogFooter>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}
