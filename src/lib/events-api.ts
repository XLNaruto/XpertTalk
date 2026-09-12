/**
 * Events API — transport layer for `/chat/event/*`.
 *
 * Contract notes that shape this file (see EVENTS_WEB_FRONTEND.md):
 *  - every response is HTTP 200; `body.status` carries the real outcome;
 *  - a 4xx *inside the envelope* is permanent — never auto-retry it;
 *  - an HTTP 5xx / network failure is retryable (a create retried with the same
 *    `clientEventId` yields one event, never two);
 *  - `null` never appears in a response — empty strings do.
 */
import { apiHeader, getData, postData } from "@/lib/api-helper";

// ── Models ──────────────────────────────────────────────────────────

export type EventStatus = "scheduled" | "cancelled" | "completed";
export type UserType = "ADMIN" | "EMPLOYEE";

export interface EventParticipant {
  /** UUID of the membership row — not the user. */
  id: string;
  /** The user identity. Arrives as a string even though it is numeric. */
  chatuserId: string;
  externalId: string;
  externalType: UserType | string;
  userType: UserType | string;
  firstName: string;
  lastName: string;
  /** Absolute URL, or "" when the user has no picture. */
  profileUrl: string;
  /** Always "invited" today — there is no RSVP. */
  status: string;
}

export interface EventRecord {
  id: string;
  clientEventId: string;
  creatorId: string;
  creatorChatuserId: string;
  creatorType: UserType | string;
  creatorName: string;
  creatorProfileUrl: string;
  title: string;
  /** ISO-8601 UTC instant. */
  eventTime: string;
  /** The creator's UTC offset, e.g. "+05:30" — NOT an IANA zone name. */
  timezone: string;
  timezoneName: string;
  remindersPerDay: number;
  /** Wall-clock "HH:mm" times in `timezone`. Server-owned — never hardcode. */
  reminderSlots: string[];
  status: EventStatus;
  /** Computed for the caller of the request that returned this event. */
  isCreator: boolean;
  createdAt: string;
  /** Load-bearing: send it back as `ifUpdatedAt` on the next update. */
  updatedAt: string;
  cancelledAt: string;
  completedAt: string;
  participants: EventParticipant[];
}

/** What a write sends for each participant. `userType` is accepted and ignored. */
export interface ParticipantInput {
  chatuserId: string;
  userType?: string;
}

export interface CreateEventInput {
  clientEventId: string;
  title: string;
  /** ISO-8601 UTC instant ending in `Z`. */
  eventTime: string;
  timezone: string;
  timezoneName: string;
  remindersPerDay: number;
  participants: ParticipantInput[];
}

export interface UpdateEventInput extends CreateEventInput {
  id: string;
  /** The `updatedAt` this copy was loaded with — optimistic concurrency. */
  ifUpdatedAt?: string;
}

/** A user from `/chat/talk/users` — note `chatuserId` is a **number** here. */
export interface PickableUser {
  chatuserId: number | string;
  firstName: string;
  lastName: string;
  profileUrl: string;
  externalId: number | string;
  externalType: UserType | string;
}

// ── Result envelope ─────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
  message: string;
}

export interface ApiFail {
  ok: false;
  /**
   * `rejected` — the server answered a 4xx inside the envelope. Permanent:
   * show `message` verbatim, never retry on the user's behalf.
   * `transport` — HTTP 5xx or a network fault. Retryable.
   */
  kind: "rejected" | "transport";
  /** The envelope status (400/404/409/422/…), or null for a transport fault. */
  status: number | null;
  message: string;
}

export type ApiResult<T> = ApiOk<T> | ApiFail;

const TRANSPORT_MESSAGE = "Couldn't reach the server. Please try again.";

/** What api-helper hands back: an axios response, or undefined on a fault. */
interface RawResponse {
  status?: number | string;
  data?: {
    status?: number | string;
    success?: boolean;
    message?: string;
    data?: unknown;
  };
}

/**
 * Normalise an api-helper response into an ApiResult.
 *
 * `getData`/`postData` return `undefined` for network faults and for the
 * 401/403 cases they already handled by redirecting to the unauthorized
 * screen — both land here as a transport failure.
 */
function toResult<T>(response: RawResponse | undefined): ApiResult<T> {
  if (!response || String(response.status) !== "200") {
    return { ok: false, kind: "transport", status: null, message: TRANSPORT_MESSAGE };
  }

  const body = response.data;
  const status = Number(body?.status);

  if (status === 200) {
    return { ok: true, data: body?.data as T, message: String(body?.message || "") };
  }

  return {
    ok: false,
    kind: "rejected",
    status: Number.isFinite(status) ? status : null,
    // The server writes these for the end user — surface them verbatim.
    message: String(body?.message || "Something went wrong."),
  };
}

// ── Endpoints ───────────────────────────────────────────────────────

/**
 * Every event the caller can see — created *and* participating, together,
 * sorted by `eventTime` ascending. No pagination exists; none is sent.
 */
export async function fetchEventList(): Promise<ApiResult<EventRecord[]>> {
  const res = await getData("chat/event/list", {}, apiHeader(false, 0));
  const result = toResult<EventRecord[]>(res);
  if (result.ok && !Array.isArray(result.data)) {
    return { ...result, data: [] };
  }
  return result;
}

/** The authoritative read for one event. Always call it when opening details. */
export async function fetchEventDetail(id: string): Promise<ApiResult<EventRecord>> {
  const res = await getData("chat/event/detail", { id }, apiHeader(false, 0));
  return toResult<EventRecord>(res);
}

export async function createEvent(
  input: CreateEventInput
): Promise<ApiResult<EventRecord>> {
  const res = await postData("chat/event/create", input, apiHeader(false, 0));
  return toResult<EventRecord>(res);
}

/** Full replacement, not a patch — title, time and the whole participant list. */
export async function updateEvent(
  input: UpdateEventInput
): Promise<ApiResult<EventRecord>> {
  const res = await postData("chat/event/update", input, apiHeader(false, 0));
  return toResult<EventRecord>(res);
}

/** Soft cancel. Calling it twice is fine — the second call returns the same event. */
export async function cancelEvent(
  id: string,
  clientEventId?: string
): Promise<ApiResult<EventRecord>> {
  const res = await postData(
    "chat/event/cancel",
    { id, ...(clientEventId ? { clientEventId } : {}) },
    apiHeader(false, 0)
  );
  return toResult<EventRecord>(res);
}

export async function addParticipants(
  id: string,
  participants: ParticipantInput[]
): Promise<ApiResult<EventRecord>> {
  const res = await postData(
    "chat/event/participant/add",
    { id, participants },
    apiHeader(false, 0)
  );
  return toResult<EventRecord>(res);
}

/** One participant per call. Removing a non-participant still answers 200. */
export async function removeParticipant(
  id: string,
  chatuserId: string,
  userType?: string
): Promise<ApiResult<EventRecord>> {
  const res = await postData(
    "chat/event/participant/remove",
    { id, chatuserId, ...(userType ? { userType } : {}) },
    apiHeader(false, 0)
  );
  return toResult<EventRecord>(res);
}

/** Users for the participant picker — every active user except the caller. */
export async function fetchPickableUsers(): Promise<ApiResult<PickableUser[]>> {
  const res = await getData("chat/talk/users", {}, apiHeader(false, 0));
  const result = toResult<PickableUser[]>(res);
  if (result.ok && !Array.isArray(result.data)) {
    return { ...result, data: [] };
  }
  return result;
}
