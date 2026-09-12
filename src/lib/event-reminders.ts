/**
 * Reminder maths and date formatting for Events.
 *
 * The server owns reminders entirely — nothing here schedules or fires
 * anything. `reminderSchedule` is a port of the backend rule so the UI can
 * *describe* what the server will do ("next reminder", a preview count).
 *
 * Reminder times always come from `event.reminderSlots`; they are configurable
 * server-side, so no literal slot time is hardcoded anywhere in this app.
 */
import type { EventRecord } from "@/lib/events-api";

export type ReminderType = "daily" | "hourly" | "final";

export interface ReminderRow {
  type: ReminderType;
  at: Date;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Every future reminder for an event, ascending.
 *
 * Daily block: only when the event is 2+ calendar days away — one reminder at
 * each slot on every day up to, but excluding, the event day.
 * Event-day block: T-5h … T-1h plus T-15min.
 * Only instants strictly in the future are produced; there is no catch-up.
 */
export function reminderSchedule(
  event: Pick<EventRecord, "status" | "eventTime" | "timezone" | "reminderSlots">,
  now: Date = new Date()
): ReminderRow[] {
  if (event.status !== "scheduled") return [];
  const eventMs = new Date(event.eventTime).getTime();
  const nowMs = now.getTime();
  if (!(eventMs > nowMs)) return [];

  const offset = parseUtcOffsetMinutes(event.timezone);
  const dayStart = (ms: number) =>
    Math.floor((ms + offset * MIN) / DAY) * DAY - offset * MIN;

  const slots = (event.reminderSlots || []).map((s) => {
    const [h, min] = String(s).split(":").map(Number);
    return h * 60 + (min || 0);
  });

  const rows: ReminderRow[] = [];
  const days = Math.round((dayStart(eventMs) - dayStart(nowMs)) / DAY);
  if (days >= 2) {
    for (let d = 0; d < days; d++) {
      // Stops before the event day — the event day gets no daily reminders.
      for (const minutes of slots) {
        const at = dayStart(nowMs) + d * DAY + minutes * MIN;
        if (at > nowMs) rows.push({ type: "daily", at: new Date(at) });
      }
    }
  }
  for (const h of [5, 4, 3, 2, 1]) {
    const at = eventMs - h * HOUR;
    if (at > nowMs) rows.push({ type: "hourly", at: new Date(at) });
  }
  const finalAt = eventMs - 15 * MIN;
  if (finalAt > nowMs) rows.push({ type: "final", at: new Date(finalAt) });

  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The soonest future reminder, or null when none remain. */
export function nextReminder(
  event: Pick<EventRecord, "status" | "eventTime" | "timezone" | "reminderSlots">,
  now: Date = new Date()
): ReminderRow | null {
  return reminderSchedule(event, now)[0] || null;
}

/** `"+05:30"` → 330. Anything unparseable means UTC. */
export function parseUtcOffsetMinutes(timezone: string | undefined): number {
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec((timezone || "").trim());
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

/** This browser's current UTC offset in the `"+05:30"` shape the API wants. */
export function deviceUtcOffset(d: Date = new Date()): string {
  const total = -d.getTimezoneOffset(); // minutes, east positive
  const sign = total < 0 ? "-" : "+";
  const abs = Math.abs(total);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(
    abs % 60
  ).padStart(2, "0")}`;
}

/** A short zone label such as "IST" — display-only, "" when unavailable. */
export function deviceTimezoneName(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

// ── Dates ───────────────────────────────────────────────────────────

/**
 * Parse a server date. `null` never appears — empty strings do, and
 * `new Date("")` is an Invalid Date, so guard before using the result.
 */
export function parseServerDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Times are always shown as 12-hour with AM/PM, matching the time picker.
 * `hour12` is forced because locales such as en-GB otherwise render 23:25,
 * which reads inconsistently next to a picker that offers AM/PM.
 */
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const shortDateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Some locales render the day period lowercase ("6:00 pm") — uppercase it. */
function upperMeridiem(text: string): string {
  return text.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/** Full local date+time, e.g. "Sat, 20 Sep 2026, 6:00 PM". */
export function formatEventDateTime(iso: string): string {
  const d = parseServerDate(iso);
  return d ? upperMeridiem(dateTimeFmt.format(d)) : "—";
}

/** Compact local date+time for list rows. */
export function formatShortDateTime(iso: string): string {
  const d = parseServerDate(iso);
  return d ? upperMeridiem(shortDateTimeFmt.format(d)) : "—";
}

export function formatTime(d: Date): string {
  return upperMeridiem(timeFmt.format(d));
}

/** Local date + time for a reminder instant, e.g. "18 Sep, 9:00 AM". */
export function formatReminderAt(d: Date): string {
  return upperMeridiem(shortDateTimeFmt.format(d));
}

/**
 * A wall-clock slot ("09:00") rendered as "9:00 AM". Slots are expressed in
 * the *event's* timezone, so they are formatted as plain wall-clock labels and
 * never converted into the viewer's zone.
 */
export function formatSlot(slot: string): string {
  const [rawH, rawM] = String(slot).split(":");
  const h = Number(rawH);
  const m = Number(rawM || 0);
  if (!Number.isFinite(h)) return slot;
  const base = new Date(2000, 0, 1, h, Number.isFinite(m) ? m : 0);
  return upperMeridiem(timeFmt.format(base));
}

/** "9:00 AM and 6:00 PM" / "9:00 AM, 2:00 PM and 6:00 PM". */
export function joinSlots(slots: string[]): string {
  const labels = (slots || []).map(formatSlot);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The sentence describing an event's reminders. Built from `reminderSlots`
 * when they are known, so changing the slots server-side changes this text
 * with no frontend deploy.
 */
export function describeReminders(
  slots: string[] | undefined,
  remindersPerDay: number
): string {
  const tail =
    "Plus hourly reminders from 5 hours before, and a final one 15 minutes before it starts.";
  if (slots && slots.length) {
    return `At ${joinSlots(slots)} on each day before the event. ${tail}`;
  }
  const n = remindersPerDay === 1 ? "1 reminder" : `${remindersPerDay} reminders`;
  return `${n} a day on each day before the event. ${tail}`;
}

/** Human label for the kind of reminder a row is. */
export function reminderTypeLabel(type: ReminderType): string {
  if (type === "daily") return "Daily reminder";
  if (type === "hourly") return "Hourly reminder";
  return "Final reminder";
}

/** "Starts in 3 hours" style label. Returns "" once the event has started. */
export function formatCountdown(iso: string, now: Date = new Date()): string {
  const d = parseServerDate(iso);
  if (!d) return "";
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return "";
  if (diff < HOUR) {
    const mins = Math.max(1, Math.round(diff / MIN));
    return `Starts in ${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    const mins = Math.round((diff % HOUR) / MIN);
    return mins
      ? `Starts in ${hours}h ${mins}m`
      : `Starts in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(diff / DAY);
  return `Starts in ${days} day${days === 1 ? "" : "s"}`;
}

// ── Form helpers ────────────────────────────────────────────────────

/**
 * Mint once when a create form opens and reuse it on every attempt from that
 * form — the server dedupes on it, so a retried create yields one event.
 * Regenerating it inside a retry would create a duplicate.
 */
export function mintClientEventId(): string {
  return `evt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/** `<input type="datetime-local">` value for a UTC instant, in local time. */
export function toLocalInputValue(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** A datetime-local value → the ISO UTC instant the API expects. */
export function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Ids come back as strings, including numeric ones — compare normalised. */
export function sameUser(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

/** Whether an event's start time has already passed. */
export function hasStarted(iso: string, now: Date = new Date()): boolean {
  const d = parseServerDate(iso);
  return !!d && d.getTime() <= now.getTime();
}
