/**
 * Polls — models, state rules and the one REST call.
 *
 * Contract notes that shape this file (see POLLS_WEB_FRONTEND_IMPL.md):
 *  - a poll IS a chat message; it lives on `message.poll`, keyed by messageId;
 *  - every payload is the COMPLETE tally — replace the poll object, never merge
 *    option-by-option;
 *  - `revision` is the only ordering guard: drop a broadcast whose revision is
 *    ≤ the one already held;
 *  - `myVotes` and `canClose` only arrive on payloads addressed to THIS user
 *    (message list, or our own ack) — a broadcast omits them, which is correct,
 *    so they are carried across every update instead of being read off it;
 *  - bars are drawn against `voterCount` (distinct people), never the sum of
 *    `voteCount` — on a multi-answer poll the sum exceeds the headcount;
 *  - options render in `position` order, always. A bar the user is reaching for
 *    must not move when someone else votes.
 */
import { apiHeader, getData } from "@/lib/api-helper";

// ── Models ──────────────────────────────────────────────────────────

export interface PollVoter {
  /** Arrives as a string even though it is numeric. */
  chatuserId: string;
  userType: string;
  name: string;
  /** Absolute URL, or "" when the user has no picture. */
  profileImage: string;
  votedAt: string;
  /** Only present when the voters call was made without an `optionId`. */
  optionId?: string;
}

export interface PollOption {
  /** Minted client-side at creation; the server stores it verbatim. */
  optionId: string;
  /** 0-based, contiguous, and never changes after creation. */
  position: number;
  text: string;
  voteCount: number;
  /** Up to 20, oldest first. */
  voters?: PollVoter[];
  /** True when there are more voters than the inline 20. */
  votersTruncated?: boolean;
}

export interface Poll {
  /** Opaque — never sent back. Everything addresses a poll by `messageId`. */
  pollId?: string;
  question: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  resultsVisibility?: string;
  options: PollOption[];
  /** DISTINCT voters — the denominator for every bar. */
  voterCount: number;
  /** Per-poll counter, bumped by the server on every real change. */
  revision: number;
  isClosed: boolean;
  closedAt?: string;
  /** Only meaningful on a payload addressed to this user. */
  canClose?: boolean;
  /** Ours to keep — absent on every broadcast. */
  myVotes?: string[];
}

// ── Reject codes ────────────────────────────────────────────────────

/**
 * The five permanent codes. Anything else — an unknown code, a `success:false`
 * with no code, a missing ack — must fail OPEN and retry: an unknown failure
 * costs a retry, dropping the vote loses the user's input with no trace.
 */
const PERMANENT_CODES = new Set([
  "POLL_CLOSED",
  "POLL_NOT_FOUND",
  "POLL_OPTION_NOT_FOUND",
  "POLL_INVALID_VOTE",
  "POLL_FORBIDDEN",
]);

/** Create-time rejections. A rejected create writes nothing server-side. */
const CREATE_CODES = new Set([
  "POLL_INVALID_QUESTION",
  "POLL_INVALID_OPTIONS",
  "POLL_DUPLICATE_OPTION",
]);

export function isPermanentPollCode(code: unknown): boolean {
  return typeof code === "string" && PERMANENT_CODES.has(code);
}

export function isCreatePollCode(code: unknown): boolean {
  return typeof code === "string" && CREATE_CODES.has(code);
}

/** The message is already a tombstone — revert, but say nothing. */
export function isSilentPollCode(code: unknown): boolean {
  return code === "POLL_NOT_FOUND";
}

// ── The six state rules ─────────────────────────────────────────────

/** Options in `position` order — never by vote count. */
export function sortedOptions(poll: Poll | null | undefined): PollOption[] {
  const options = poll?.options;
  if (!Array.isArray(options)) return [];
  return [...options].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Share of the poll's DISTINCT voters that picked this option, 0–100. */
export function optionPercent(option: PollOption, poll: Poll): number {
  const voters = poll.voterCount || 0;
  if (voters <= 0) return 0;
  return Math.max(0, Math.min(100, ((option.voteCount || 0) / voters) * 100));
}

/** The admin build oversees every talk, so results are never withheld from it. */
export function isAdminBuild(): boolean {
  return (import.meta.env.VITE_APP_USER || "employee") === "admin";
}

/**
 * Whether the tally may be shown — bars, counts, turnout, faces, voters list.
 *
 * Results stay hidden until the viewer has a stake in them. Three exceptions:
 *  - the ADMIN build, which oversees the talk rather than taking part in it;
 *  - the CREATOR, who owns the poll and must be able to read it without being
 *    forced to vote in it (`isCreator` is `isSender` on a poll message);
 *  - a CLOSED poll, which can no longer be voted on, so hiding the outcome
 *    would strand anyone who never voted.
 *
 * One definition for every surface — the bubble, its context menu and the
 * pinned sheet all gate on this, or they disagree with each other.
 */
export function pollShowsResults(
  poll: Poll | null | undefined,
  isCreator: boolean
): boolean {
  if (!poll) return false;
  return (
    isAdminBuild() || isCreator || myVotesOf(poll).length > 0 || !!poll.isClosed
  );
}

export function myVotesOf(poll: Poll | null | undefined): string[] {
  return Array.isArray(poll?.myVotes) ? poll.myVotes : [];
}

/**
 * Fold an incoming poll payload into the one already held.
 *
 * `addressed` means the payload was sent to THIS user (message list, or our own
 * ack) and therefore carries a trustworthy `myVotes` / `canClose`. A broadcast
 * is not addressed: reading `myVotes` off one blanks the user's own selection
 * every time anyone else votes, and its `canClose` is always false because a
 * broadcast has no single viewer.
 *
 * Returns the CURRENT object unchanged when the payload is stale, so callers
 * can compare by identity and skip the re-render.
 */
export function mergePoll(
  current: Poll | null | undefined,
  incoming: Poll | null | undefined,
  addressed: boolean
): Poll | null | undefined {
  if (!incoming) return current;

  // Nothing held yet — take the payload as-is. (A `newMessage` broadcast has no
  // `myVotes`; for a poll that new it is empty anyway.)
  if (!current) {
    return { ...incoming, myVotes: myVotesOf(incoming) };
  }

  const currentRev = Number(current.revision ?? -1);
  const incomingRev = Number(incoming.revision ?? -1);

  const myVotes =
    addressed && Array.isArray(incoming.myVotes)
      ? incoming.myVotes
      : myVotesOf(current);
  // Never let a broadcast take the Close control away — it reports `false` for
  // everyone, viewer or not.
  const canClose = addressed ? !!incoming.canClose : !!current.canClose;

  if (incomingRev <= currentRev) {
    // Stale tally — but an addressed payload still corrects who *I* am, which
    // is the one thing no broadcast can tell us.
    const sameVotes =
      myVotes === current.myVotes ||
      (myVotes.length === myVotesOf(current).length &&
        myVotes.every((id) => myVotesOf(current).includes(id)));
    if (sameVotes && canClose === !!current.canClose) return current;
    return { ...current, myVotes, canClose };
  }

  // Real change — replace wholesale, carrying our own two fields across.
  return { ...incoming, myVotes, canClose };
}

/**
 * Apply a complete selection locally so the UI answers the click instantly.
 *
 * Counts are adjusted to match, or the bars jump when the real payload lands.
 * All of it is discarded the moment the ack or the broadcast arrives, so it
 * only has to look right for ~100ms — forgetting to reconcile afterwards is the
 * real bug, not a slightly-off intermediate number.
 */
export function applySelectionLocally(poll: Poll, optionIds: string[]): Poll {
  const before = myVotesOf(poll);
  const after = optionIds;

  const options = (poll.options || []).map((option) => {
    const was = before.includes(option.optionId);
    const now = after.includes(option.optionId);
    if (was === now) return option;
    return {
      ...option,
      voteCount: Math.max(0, (option.voteCount || 0) + (now ? 1 : -1)),
    };
  });

  // `voterCount` counts PEOPLE, so it only moves when this user goes from
  // having no votes at all to having some, or back to none.
  let voterCount = poll.voterCount || 0;
  if (before.length === 0 && after.length > 0) voterCount += 1;
  else if (before.length > 0 && after.length === 0)
    voterCount = Math.max(0, voterCount - 1);

  return { ...poll, options, voterCount, myVotes: after };
}

/**
 * The complete selection after clicking `optionId` — never a delta.
 * `[]` is a retraction, a real operation, and must not be short-circuited.
 */
export function nextSelection(poll: Poll, optionId: string): string[] {
  const current = myVotesOf(poll);
  if (poll.allowMultiple) {
    return current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
  }
  // Single-answer: exactly one id, or none when clicking the current pick.
  return current.length === 1 && current[0] === optionId ? [] : [optionId];
}

// ── Compose-side validation ─────────────────────────────────────────

export const POLL_QUESTION_MAX = 255;
export const POLL_OPTION_MAX = 100;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 50;

export interface PollDraftOption {
  /** Stable across re-orders and removals — used as the React key AND the id. */
  optionId: string;
  text: string;
}

export interface PollCreatePayload {
  question: string;
  allowMultiple: boolean;
  resultsVisibility: "ALWAYS";
  isAnonymous: false;
  options: Array<{ optionId: string; position: number; text: string }>;
}

export interface PollDraftValidation {
  ok: boolean;
  questionError?: string;
  optionsError?: string;
  /** Indices (into the draft array) of options that duplicate an earlier one. */
  duplicateIndexes: number[];
  payload?: PollCreatePayload;
}

/**
 * The server enforces all of this again — this only buys a better error.
 * Blank option rows are DROPPED, not rejected: the compose UI keeps empty rows
 * around for the user to fill, and they are filtered out on submit.
 */
export function validatePollDraft(
  question: string,
  options: PollDraftOption[],
  allowMultiple: boolean
): PollDraftValidation {
  const trimmedQuestion = question.trim();
  const duplicateIndexes: number[] = [];

  let questionError: string | undefined;
  if (!trimmedQuestion) questionError = "Add a question.";
  else if (trimmedQuestion.length > POLL_QUESTION_MAX)
    questionError = `Keep the question under ${POLL_QUESTION_MAX} characters.`;

  const kept: Array<{ index: number; option: PollDraftOption; text: string }> = [];
  options.forEach((option, index) => {
    const text = option.text.trim();
    if (text) kept.push({ index, option, text });
  });

  let optionsError: string | undefined;

  const seen = new Set<string>();
  for (const entry of kept) {
    const key = entry.text.toLowerCase();
    if (seen.has(key)) duplicateIndexes.push(entry.index);
    else seen.add(key);
  }

  const tooLong = kept.find((entry) => entry.text.length > POLL_OPTION_MAX);

  if (kept.length < POLL_MIN_OPTIONS)
    optionsError = `Add at least ${POLL_MIN_OPTIONS} options.`;
  else if (kept.length > POLL_MAX_OPTIONS)
    optionsError = `A poll can have at most ${POLL_MAX_OPTIONS} options.`;
  else if (tooLong)
    optionsError = `Keep each option under ${POLL_OPTION_MAX} characters.`;
  else if (duplicateIndexes.length > 0)
    optionsError = "Two options can't be the same.";

  if (questionError || optionsError) {
    return { ok: false, questionError, optionsError, duplicateIndexes };
  }

  return {
    ok: true,
    duplicateIndexes,
    payload: {
      question: trimmedQuestion,
      allowMultiple,
      resultsVisibility: "ALWAYS",
      isAnonymous: false,
      options: kept.map((entry, position) => ({
        optionId: entry.option.optionId,
        position,
        text: entry.text,
      })),
    },
  };
}

/**
 * The idempotency key for a create. A re-emit (reconnect mid-send, an unguarded
 * double-click) becomes a LOOKUP and returns the existing poll — without it,
 * two bubbles split the tally across two polls and nothing reports it.
 */
export function mintClientMsgId(): string {
  return `web_poll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Option ids are ours to mint: 1–32 chars of `[A-Za-z0-9_-]`, unique per poll. */
export function mintOptionId(): string {
  return `o${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Voters — the only REST call ─────────────────────────────────────

const VOTERS_PAGE_SIZE = 50;
/** Stop runaway paging even if the server keeps handing back cursors. */
const VOTERS_MAX_PAGES = 20;

interface VotersPage {
  voters: PollVoter[];
  nextCursor?: string;
}

async function fetchVotersPage(
  messageId: string,
  optionId: string | undefined,
  cursor: string | undefined
): Promise<VotersPage | null> {
  const params: Record<string, any> = { messageId, limit: VOTERS_PAGE_SIZE };
  if (optionId) params.optionId = optionId;
  if (cursor) params.cursor = cursor;

  const response: any = await getData("chat/poll/voters", params, apiHeader(false, 0));

  // A 422 here means "you are not in this chat" and a 404 means the poll or the
  // option is gone. Neither is a session problem — `getData` already leaves
  // those alone, and so do we.
  if (String(response?.data?.status) !== "200") return null;

  const data = response.data.data || {};
  return {
    voters: Array.isArray(data.voters) ? data.voters : [],
    // The LAST page omits the key entirely, so any falsy value means "done".
    nextCursor: data.nextCursor || undefined,
  };
}

export interface VotersResult {
  voters: PollVoter[];
  /** True when a page failed — keep what was collected and say so. */
  partial: boolean;
}

/**
 * Every voter on the poll, across all options. Called only when some option is
 * truncated; a poll that fits inline opens the modal with no request at all.
 *
 * A failed page is not fatal: whatever was already collected is returned with
 * `partial: true` so the modal can keep its rows and show "Couldn't load
 * everyone" instead of emptying itself.
 */
export async function fetchAllPollVoters(
  messageId: string,
  optionId?: string
): Promise<VotersResult> {
  const collected: PollVoter[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < VOTERS_MAX_PAGES; page++) {
    let result: VotersPage | null = null;
    try {
      result = await fetchVotersPage(messageId, optionId, cursor);
    } catch {
      result = null;
    }
    if (!result) return { voters: collected, partial: true };

    collected.push(...result.voters);

    // Done, or the server handed back the cursor we just sent.
    if (!result.nextCursor || result.nextCursor === cursor) {
      return { voters: collected, partial: false };
    }
    cursor = result.nextCursor;
  }

  // Loop guard tripped — treat it as a partial load rather than looping on.
  return { voters: collected, partial: true };
}

/** Merge inline voters with fetched ones, de-duped per (option, user). */
export function mergeVoters(
  inline: PollVoter[],
  fetched: PollVoter[]
): PollVoter[] {
  const byKey = new Map<string, PollVoter>();
  for (const voter of [...inline, ...fetched]) {
    const key = `${voter.optionId || ""}|${voter.chatuserId}`;
    if (!byKey.has(key)) byKey.set(key, voter);
  }
  return Array.from(byKey.values());
}

/** Every inline voter the poll already carries, tagged with its option. */
export function inlineVoters(poll: Poll): PollVoter[] {
  const out: PollVoter[] = [];
  for (const option of sortedOptions(poll)) {
    for (const voter of option.voters || []) {
      out.push({ ...voter, optionId: voter.optionId || option.optionId });
    }
  }
  return out;
}

/** True when any option holds more voters than the inline 20. */
export function hasTruncatedVoters(poll: Poll): boolean {
  return (poll.options || []).some((option) => !!option.votersTruncated);
}
