import { format, isAfter } from "date-fns";

// A talk carries `isMuted` plus an optional `muteUntil`. Muting suppresses push
// notifications for the talk server-side; the client only shows the state and
// offers the toggle. `POST /chat/talk/mute` is admin-only — an employee build
// gets 400 "Access denied", so the UI is gated on the build's user type.

export interface MuteState {
  isMuted?: boolean;
  muteUntil?: string | null;
}

/** The build talks to the admin API surface (mute is admin-only). */
export const canMuteTalks =
  (import.meta.env.VITE_APP_USER || "employee") === "admin";

/**
 * Is the talk muted *right now*? A `muteUntil` in the past means the mute has
 * lapsed — the server may not have cleared the flag yet, so never trust
 * `isMuted` on its own.
 */
export function isTalkMuted(talk?: MuteState | null): boolean {
  if (!talk?.isMuted) return false;
  if (!talk.muteUntil) return true; // muted indefinitely
  const until = new Date(talk.muteUntil);
  if (Number.isNaN(until.getTime())) return true;
  return isAfter(until, new Date());
}

/** Tooltip / menu text: "Muted until 9:30 PM", "Muted until 12 Aug", "Muted". */
export function muteStatusLabel(talk?: MuteState | null): string {
  if (!isTalkMuted(talk)) return "";
  if (!talk?.muteUntil) return "Muted";
  const until = new Date(talk.muteUntil);
  if (Number.isNaN(until.getTime())) return "Muted";
  const sameDay = until.toDateString() === new Date().toDateString();
  return `Muted until ${format(until, sameDay ? "h:mm a" : "d MMM, h:mm a")}`;
}

/** Presets offered in the mute dialog. `hours: null` = until the user unmutes. */
export const MUTE_DURATIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "8 hours", hours: 8 },
  { label: "24 hours", hours: 24 },
  { label: "1 week", hours: 24 * 7 },
  { label: "Always", hours: null },
];

/** Absolute `muteUntil` for a preset — null for an indefinite mute. */
export function muteUntilFrom(hours: number | null): string | null {
  if (hours == null) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
