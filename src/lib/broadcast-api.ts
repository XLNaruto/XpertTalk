/**
 * Broadcast lists API — transport layer for `/chat/broadcast/*`.
 *
 * Contract notes that shape this file (see BROADCAST_WEB_FRONTEND_IMPL.md):
 *  - every business outcome is HTTP 200; `body.status` carries the real one;
 *  - 404/409/422 inside the envelope are never a logout — only 401 is, and
 *    api-helper already handles that before we see the response;
 *  - a FAILED send answers envelope 422 *with* `data` — it must be kept;
 *  - `body.status` (200/422/…) and `data.status` (SENT/PARTIAL/…) are
 *    different fields and must never be conflated;
 *  - unlike the rest of chat, these responses carry real JSON `null`s.
 */
import { apiHeader, getData, postData } from "@/lib/api-helper";
import { format, isToday, isYesterday } from "date-fns";
import { parseServerDate } from "@/lib/event-reminders";

// ── Limits (mirrored from the server) ───────────────────────────────

export const LIST_NAME_MAX = 200;
export const MAX_MEMBERS = 256;
export const MAX_ATTACHMENTS = 10;
export const MESSAGE_TEXT_MAX = 5000;

// ── Models ──────────────────────────────────────────────────────────

export type BroadcastStatus = "SENT" | "PARTIAL" | "FAILED" | "PENDING";
export type DeliveryStatus = "SENT" | "SKIPPED" | "FAILED" | "PENDING";
export type BroadcastMessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
export type SkipReason =
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_DELETED"
  | "WRITE_FAILED"
  | "NOT_VISIBLE"
  | "ALREADY_MEMBER"
  | "NOT_MEMBER";

export interface Pagination {
  total: number;
  hasMore: boolean;
}

export interface Paged<T> {
  list: T[];
  pagination: Pagination;
}

/** The counters every broadcast summary carries. */
export interface BroadcastCounts {
  recipientCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface LastBroadcast extends BroadcastCounts {
  broadcastId: string;
  messageText: string;
  messageType: BroadcastMessageType | string;
  mediaCount: number;
  status: BroadcastStatus;
  created: string;
}

export interface BroadcastListSummary {
  broadcastlistId: string;
  name: string;
  memberCount: number;
  maxMembers: number;
  lastBroadcast: LastBroadcast | null;
  created: string;
}

export interface BroadcastMember {
  /** An integer here — unlike events, which send it as a string. */
  chatuserId: number;
  /** Display only; never needed on a write. */
  userType: string;
  name: string;
  profile: string | null;
  inList: boolean;
  isDeliverable: boolean;
  reason: SkipReason | string | null;
}

export interface SkippedMember {
  chatuserId: number;
  reason: SkipReason | string;
}

export interface BroadcastListDetail {
  broadcastlistId: string;
  name: string;
  memberCount: number;
  maxMembers: number;
  created: string;
  members: BroadcastMember[];
  pagination: Pagination;
}

export interface CreatedList extends BroadcastListDetail {
  skipped: SkippedMember[];
}

export interface Candidate {
  chatuserId: number;
  userType: string;
  name: string;
  profile: string | null;
  inList: boolean;
}

export interface CandidatePage extends Paged<Candidate> {
  /** `null` when picking for a list that doesn't exist yet. */
  listState: { remaining: number } | null;
}

export interface BroadcastMediaItem {
  mediaId: string;
  mediaPath: string;
  mediaName: string;
  mediaType: string;
  position: number;
}

export interface Delivery {
  recipientChatuserId: number;
  recipientType: string;
  name: string;
  profile: string | null;
  talkId: string | null;
  messageId: string | null;
  status: DeliveryStatus;
  reason: SkipReason | string | null;
  reasonMessage: string | null;
}

/** A report row adds read/deleted state to a delivery. */
export interface ReportRow extends Delivery {
  isRead: boolean;
  isDeleted: boolean;
}

export interface SendResult extends BroadcastCounts {
  broadcastId: string;
  broadcastlistId: string;
  listName: string;
  messageText: string;
  messageType: BroadcastMessageType | string;
  mediaItems: BroadcastMediaItem[];
  mediaCount: number;
  status: BroadcastStatus;
  created: string;
  deliveries: Delivery[];
}

export interface HistoryRow extends BroadcastCounts {
  broadcastId: string;
  /** `null` once the list has been deleted. */
  broadcastlistId: string | null;
  /** The name at send time — never re-derive it from the live list. */
  listName: string;
  listDeleted: boolean;
  messageText: string;
  messageType: BroadcastMessageType | string;
  mediaItems: BroadcastMediaItem[];
  mediaCount: number;
  readCount: number;
  status: BroadcastStatus;
  created: string;
}

export interface BroadcastReport extends Paged<ReportRow> {
  broadcast: HistoryRow;
}

/** Socket frame for `broadcastProgress` / `broadcastComplete` on `/contact`. */
export interface BroadcastProgressFrame extends BroadcastCounts {
  broadcastId: string;
  broadcastlistId: string;
  status: BroadcastStatus;
}

export interface SendInput {
  clientBroadcastId: string;
  broadcastlistId: string;
  messageText: string;
  mediaItems: { mediaId: string }[];
}

// ── Result envelope ─────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
  message: string;
}

export interface ApiFail<T = unknown> {
  ok: false;
  /**
   * `rejected` — the server answered 404/409/422 inside the envelope. Show
   * `message`; never retry on the user's behalf.
   * `transport` — HTTP 5xx or a network fault. The request may or may not
   * have landed, so a send must be retried with the SAME clientBroadcastId.
   */
  kind: "rejected" | "transport";
  status: number | null;
  message: string;
  /** Only a FAILED send fills this — its per-person reasons live here. */
  data?: T;
}

export type ApiResult<T> = ApiOk<T> | ApiFail<T>;

const TRANSPORT_MESSAGE = "Couldn't reach the server. Please try again.";

interface RawResponse {
  status?: number | string;
  data?: {
    status?: number | string;
    success?: boolean;
    message?: string;
    data?: unknown;
  };
}

function toResult<T>(response: RawResponse | undefined): ApiResult<T> {
  // api-helper returns undefined for network faults, HTTP 5xx, and the 401
  // it already turned into a logout.
  if (!response || String(response.status) !== "200") {
    return { ok: false, kind: "transport", status: null, message: TRANSPORT_MESSAGE };
  }

  const body = response.data;
  const status = Number(body?.status);

  if (status === 200) {
    return { ok: true, data: body?.data as T, message: String(body?.message || "") };
  }

  const data = body?.data;
  return {
    ok: false,
    kind: "rejected",
    status: Number.isFinite(status) ? status : null,
    message: String(body?.message || "Something went wrong."),
    // Keep `data` only when there is something in it (a FAILED send).
    ...(data && typeof data === "object" && Object.keys(data).length > 0
      ? { data: data as T }
      : {}),
  };
}

/** Coerce a paged payload so a missing array never crashes a render. */
function normalisePaged<T, P extends Paged<T>>(result: ApiResult<P>): ApiResult<P> {
  if (!result.ok) return result;
  const data = (result.data || {}) as P;
  return {
    ...result,
    data: {
      ...data,
      list: Array.isArray(data.list) ? data.list : [],
      pagination: data.pagination || { total: 0, hasMore: false },
    },
  };
}

const json = () => apiHeader(false, 0);

// ── Lists ───────────────────────────────────────────────────────────

/** Newest activity first — the server sorts, render in the order received. */
export async function fetchBroadcastLists(
  limit = 50,
  offset = 0
): Promise<ApiResult<Paged<BroadcastListSummary>>> {
  const res = await getData("chat/broadcast/list", { limit, offset }, json());
  return normalisePaged(toResult<Paged<BroadcastListSummary>>(res));
}

export async function createBroadcastList(
  name: string,
  chatuserIds: number[]
): Promise<ApiResult<CreatedList>> {
  const res = await postData(
    "chat/broadcast/list/create",
    { name, members: chatuserIds.map((chatuserId) => ({ chatuserId })) },
    json()
  );
  const result = toResult<CreatedList>(res);
  if (result.ok) {
    result.data = {
      ...result.data,
      members: result.data?.members || [],
      skipped: result.data?.skipped || [],
    };
  }
  return result;
}

export async function renameBroadcastList(
  broadcastlistId: string,
  name: string
): Promise<ApiResult<Record<string, never>>> {
  const res = await postData(
    "chat/broadcast/list/update",
    { broadcastlistId, name },
    json()
  );
  return toResult(res);
}

/** Soft and idempotent. The list's past broadcasts stay in history. */
export async function deleteBroadcastList(
  broadcastlistId: string
): Promise<ApiResult<Record<string, never>>> {
  const res = await postData("chat/broadcast/list/delete", { broadcastlistId }, json());
  return toResult(res);
}

export async function fetchBroadcastListDetail(
  broadcastlistId: string,
  term = "",
  limit = MAX_MEMBERS,
  offset = 0
): Promise<ApiResult<BroadcastListDetail>> {
  const res = await postData(
    "chat/broadcast/list/detail",
    { broadcastlistId, term, limit, offset },
    json()
  );
  const result = toResult<BroadcastListDetail>(res);
  if (result.ok) {
    result.data = {
      ...result.data,
      members: result.data?.members || [],
      pagination: result.data?.pagination || { total: 0, hasMore: false },
    };
  }
  return result;
}

export async function addBroadcastMembers(
  broadcastlistId: string,
  chatuserIds: number[]
): Promise<ApiResult<{ added: number; memberCount: number; skipped: SkippedMember[] }>> {
  const res = await postData(
    "chat/broadcast/list/member/add",
    { broadcastlistId, members: chatuserIds.map((chatuserId) => ({ chatuserId })) },
    json()
  );
  return toResult(res);
}

export async function removeBroadcastMembers(
  broadcastlistId: string,
  chatuserIds: number[]
): Promise<ApiResult<{ removed: number; memberCount: number; skipped: SkippedMember[] }>> {
  const res = await postData(
    "chat/broadcast/list/member/remove",
    { broadcastlistId, members: chatuserIds.map((chatuserId) => ({ chatuserId })) },
    json()
  );
  return toResult(res);
}

/**
 * Recipient picker. Leave out `broadcastlistId` on the create screen: `inList`
 * is then always false and `listState` is null.
 */
export async function fetchBroadcastCandidates(params: {
  broadcastlistId?: string;
  term?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<CandidatePage>> {
  const body: Record<string, unknown> = {
    term: params.term || "",
    limit: params.limit ?? 25,
    offset: params.offset ?? 0,
  };
  if (params.broadcastlistId) body.broadcastlistId = params.broadcastlistId;
  const res = await postData("chat/broadcast/list/member/list", body, json());
  const result = normalisePaged(toResult<CandidatePage>(res));
  if (result.ok) result.data.listState = result.data.listState ?? null;
  return result;
}

// ── Sending ─────────────────────────────────────────────────────────

/**
 * On SENT / PARTIAL / PENDING the envelope is 200. On FAILED it is 422 with the
 * same `data` — the caller reads it off `result.data` of the failure.
 */
export async function sendBroadcast(input: SendInput): Promise<ApiResult<SendResult>> {
  const res = await postData("chat/broadcast/send", input, json());
  const result = toResult<SendResult>(res);
  if (result.data) {
    result.data = {
      ...result.data,
      deliveries: result.data.deliveries || [],
      mediaItems: result.data.mediaItems || [],
    };
  }
  return result;
}

/**
 * Upload ONE file through the ordinary chat endpoint. One file per request so
 * an oversized file fails only itself. Returns the mediaId, or an error
 * message to show on that attachment.
 */
export async function uploadBroadcastFile(
  file: File,
  type: string
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.append("media", file);
  form.append("name", file.name);
  form.append("type", type);
  const res = await postData("chat/media/upload", form, apiHeader(true, 0));
  const result = toResult<{ mediaId?: string; mediaIds?: string[] }>(res);
  if (!result.ok) {
    return { ok: false, message: result.kind === "rejected" ? result.message : "Upload failed" };
  }
  const data = result.data || {};
  const mediaId =
    (Array.isArray(data.mediaIds) && data.mediaIds[0]) || data.mediaId || "";
  if (!mediaId) return { ok: false, message: "Upload failed" };
  return { ok: true, mediaId };
}

// ── History & report ────────────────────────────────────────────────

export async function fetchBroadcastHistory(params: {
  broadcastlistId?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<Paged<HistoryRow>>> {
  const query: Record<string, unknown> = {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };
  if (params.broadcastlistId) query.broadcastlistId = params.broadcastlistId;
  const res = await getData("chat/broadcast/history", query, json());
  return normalisePaged(toResult<Paged<HistoryRow>>(res));
}

/** The authoritative state of one broadcast — also the PENDING fallback. */
export async function fetchBroadcastReport(params: {
  broadcastId: string;
  status?: DeliveryStatus;
  limit?: number;
  offset?: number;
}): Promise<ApiResult<BroadcastReport>> {
  const query: Record<string, unknown> = {
    broadcastId: params.broadcastId,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };
  if (params.status) query.status = params.status;
  const res = await getData("chat/broadcast/detail", query, json());
  return normalisePaged(toResult<BroadcastReport>(res));
}

// ── Helpers ─────────────────────────────────────────────────────────

/** One per compose; reused on every retry of that compose. ≤ 64 chars. */
export function mintClientBroadcastId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `bcast_${Date.now()}_${random}`;
}

const REASON_COPY: Record<string, string> = {
  ACCOUNT_INACTIVE: "Account deactivated",
  ACCOUNT_DELETED: "Account deleted",
  WRITE_FAILED: "Couldn't deliver — try again",
  NOT_VISIBLE: "Can't be added",
  ALREADY_MEMBER: "Already on the list",
  NOT_MEMBER: "Not on the list",
};

/** Prefer the server's own copy; fall back to the table only when it's null. */
export function reasonText(reason?: string | null, reasonMessage?: string | null): string {
  if (reasonMessage) return reasonMessage;
  if (!reason) return "";
  return REASON_COPY[reason] || "Not delivered";
}

const MEDIA_SINGULAR: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  AUDIO: "Audio",
  DOCUMENT: "Document",
};
const MEDIA_PLURAL: Record<string, string> = {
  IMAGE: "photos",
  VIDEO: "videos",
  AUDIO: "audio files",
  DOCUMENT: "documents",
};

/** The text, or — for an uncaptioned send — a media label like "3 photos". */
export function broadcastPreview(b: {
  messageText?: string | null;
  messageType?: string | null;
  mediaCount?: number | null;
}): string {
  const text = (b.messageText || "").trim();
  if (text) return text;
  const type = String(b.messageType || "").toUpperCase();
  const count = b.mediaCount || 0;
  if (count > 1) return `${count} ${MEDIA_PLURAL[type] || "attachments"}`;
  if (count === 1) return MEDIA_SINGULAR[type] || "Attachment";
  return "";
}

/** How many recipients have an outcome (anything but PENDING). */
export function resolvedCount(c: BroadcastCounts): number {
  return (c.sentCount || 0) + (c.skippedCount || 0) + (c.failedCount || 0);
}

/** "Sent to 3 people" / "Sent to 11 of 12" / "Couldn't send to anyone". */
export function outcomeHeadline(r: BroadcastCounts & { status: BroadcastStatus }): string {
  const total = r.recipientCount || 0;
  switch (r.status) {
    case "SENT":
      return `Sent to ${total} ${total === 1 ? "person" : "people"}`;
    case "PARTIAL":
      return `Sent to ${r.sentCount} of ${total}`;
    case "FAILED":
      return "Couldn't send to anyone";
    default:
      return `Sending… ${resolvedCount(r)} of ${total}`;
  }
}

/** " · 1 skipped · 2 failed" — the note under a PARTIAL. */
export function outcomeNote(r: BroadcastCounts): string {
  const parts: string[] = [];
  if (r.skippedCount) parts.push(`${r.skippedCount} skipped`);
  if (r.failedCount) parts.push(`${r.failedCount} failed`);
  return parts.join(" · ");
}

// ── Formatting ──────────────────────────────────────────────────────

/**
 * Same clock as the chat bubbles ("03:07 PM"), prefixed with the day:
 * "Today, 03:07 PM" · "Yesterday, 03:07 PM" · "30 Sep, 03:07 PM" ·
 * "30 Sep 2025, 03:07 PM" (year only when it isn't this year).
 */
export function formatBroadcastTime(iso: string | null | undefined): string {
  const d = parseServerDate(iso);
  if (!d) return "";
  const time = format(d, "hh:mm a");
  if (isToday(d)) return `Today, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  const day = format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
  return `${day}, ${time}`;
}

export function pluralPeople(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}
