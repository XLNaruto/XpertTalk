import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useMessageCacheStore } from "@/stores/message-cache-store";
import {
  isPermanentPollCode,
  isSilentPollCode,
  myVotesOf,
  type Poll,
} from "@/lib/polls";
import logger from "@/lib/logger";

type Emit = (event: string, data?: any, ack?: (response: any) => void) => boolean;

/** No ack within this window → treat the send as lost and retry. */
const ACK_TIMEOUT_MS = 10_000;
/** `5s × 2ⁿ`, a handful of attempts. */
const RETRY_BASE_MS = 5_000;
const MAX_ATTEMPTS = 5;

interface PendingVote {
  /** The complete selection we are trying to land. */
  optionIds: string[];
  /** What to restore if this dies permanently — the selection before we started. */
  revert: string[];
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface UsePollsOptions {
  emit: Emit;
  talkId: string;
}

/**
 * Voting and closing, with the ack classifier the contract requires.
 *
 * The pending queue lives in memory ONLY. If the tab closes or reloads
 * mid-flight, the message-list re-fetch shows the true server state — the user
 * sees reality rather than a stale local guess, and no vote from a week-old tab
 * can land unexpectedly.
 */
export function usePolls({ emit, talkId }: UsePollsOptions) {
  const pendingRef = useRef<Map<string, PendingVote>>(new Map());
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const dispatch = useCallback((action: any) => {
    useMessageCacheStore.getState().dispatchMessage(action);
  }, []);

  const clearPending = useCallback((messageId: string) => {
    const entry = pendingRef.current.get(messageId);
    if (entry?.timer) clearTimeout(entry.timer);
    pendingRef.current.delete(messageId);
  }, []);

  const clearAllPending = useCallback(() => {
    for (const entry of pendingRef.current.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    pendingRef.current.clear();
  }, []);

  // A pending vote belongs to the talk it was cast in — switching chats (or
  // unmounting) drops it rather than letting it land somewhere else.
  useEffect(() => clearAllPending, [talkId, clearAllPending]);

  /** Put the selection back the way it was and stop trying. */
  const revertPending = useCallback(
    (messageId: string, message?: string) => {
      const entry = pendingRef.current.get(messageId);
      if (!entry) return;
      const revert = entry.revert;
      clearPending(messageId);
      dispatch({ type: "SET_POLL_SELECTION", payload: { messageId, optionIds: revert } });
      if (message) toast.error(message);
    },
    [clearPending, dispatch]
  );

  // Self-scheduling: a retry re-enters through the ref so the callback does not
  // have to reference itself before it is declared.
  const sendVoteRef = useRef<(messageId: string) => void>(() => {});

  const sendVote = useCallback(
    (messageId: string) => {
      const entry = pendingRef.current.get(messageId);
      if (!entry) return;

      // Identity of the attempt: a newer click replaces `optionIds`, and any ack
      // for the superseded selection is then ignored — the newer send's ack (or
      // its broadcast) is the authoritative one.
      const sentIds = entry.optionIds;
      let settled = false;

      const scheduleRetry = () => {
        if (settled) return;
        settled = true;
        const current = pendingRef.current.get(messageId);
        if (!current || current.optionIds !== sentIds) return;

        const attempt = current.attempt + 1;
        if (attempt >= MAX_ATTEMPTS) {
          revertPending(messageId, "Couldn't record your vote. Please try again.");
          return;
        }
        // Re-sending the same selection is a no-op server-side — it writes
        // nothing, bumps no revision and broadcasts nothing — so retries are free.
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
        pendingRef.current.set(messageId, {
          ...current,
          attempt,
          timer: setTimeout(() => sendVoteRef.current(messageId), delay),
        });
      };

      const timeout = setTimeout(scheduleRetry, ACK_TIMEOUT_MS);

      const sent = emitRef.current("votePoll", { messageId, optionIds: sentIds }, (ack: any) => {
        clearTimeout(timeout);
        if (settled) return;

        const current = pendingRef.current.get(messageId);
        // Superseded by a newer click — let that one's ack decide.
        if (!current || current.optionIds !== sentIds) {
          settled = true;
          return;
        }

        if (ack?.success) {
          settled = true;
          clearPending(messageId);
          const poll: Poll | undefined = ack?.data?.poll || ack?.poll;
          if (poll) {
            dispatch({
              type: "APPLY_POLL",
              payload: { messageId, poll, addressed: true },
            });
          }
          return;
        }

        // Exactly five codes are permanent. Everything else — an unrecognised
        // code, a `success:false` with no code, a non-object response — fails
        // OPEN and retries: an unknown failure costs a retry, dropping the vote
        // loses the user's input with no trace.
        if (isPermanentPollCode(ack?.code)) {
          settled = true;
          if (ack.code === "POLL_CLOSED") {
            dispatch({ type: "MARK_POLL_CLOSED", payload: { messageId } });
          }
          // The message is already a tombstone — revert, but say nothing.
          revertPending(messageId, isSilentPollCode(ack.code) ? undefined : ack?.message);
          return;
        }

        scheduleRetry();
      });

      if (!sent) {
        clearTimeout(timeout);
        scheduleRetry();
      }
    },
    [clearPending, dispatch, revertPending]
  );
  sendVoteRef.current = sendVote;

  /**
   * Record a click. `optionIds` is the COMPLETE selection the user now has —
   * never a delta, and `[]` is a retraction, not "nothing to send".
   */
  const vote = useCallback(
    (messageId: string, poll: Poll, optionIds: string[]) => {
      if (!messageId || !poll || poll.isClosed) return;

      const existing = pendingRef.current.get(messageId);
      if (existing?.timer) clearTimeout(existing.timer);

      pendingRef.current.set(messageId, {
        optionIds,
        // Keep the ORIGINAL pre-pending selection across rapid clicks, so a
        // permanent rejection unwinds to what the server actually holds.
        revert: existing ? existing.revert : myVotesOf(poll),
        attempt: 0,
        timer: null,
      });

      dispatch({ type: "SET_POLL_SELECTION", payload: { messageId, optionIds } });
      sendVote(messageId);
    },
    [dispatch, sendVote]
  );

  /**
   * Close a poll. Closing an already-closed poll SUCCEEDS — two admins clicking
   * at once is normal, and the second one must not see an error.
   */
  const closePoll = useCallback(
    (messageId: string): Promise<void> =>
      new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const timeout = setTimeout(() => {
          toast.error("Couldn't close the poll. Please try again.");
          finish();
        }, ACK_TIMEOUT_MS);

        const sent = emitRef.current("closePoll", { messageId }, (ack: any) => {
          clearTimeout(timeout);
          if (ack?.success) {
            const poll: Poll | undefined = ack?.data?.poll || ack?.poll;
            if (poll) {
              dispatch({
                type: "APPLY_POLL",
                payload: { messageId, poll, addressed: true },
              });
            } else {
              dispatch({ type: "MARK_POLL_CLOSED", payload: { messageId } });
            }
            finish();
            return;
          }

          if (isPermanentPollCode(ack?.code)) {
            if (ack.code === "POLL_CLOSED") {
              dispatch({ type: "MARK_POLL_CLOSED", payload: { messageId } });
            }
            if (!isSilentPollCode(ack.code) && ack?.message) toast.error(ack.message);
          } else {
            logger.warn("closePoll failed:", ack);
            toast.error("Couldn't close the poll. Please try again.");
          }
          finish();
        });

        if (!sent) {
          clearTimeout(timeout);
          toast.error("You're offline — the poll wasn't closed.");
          finish();
        }
      }),
    [dispatch]
  );

  /**
   * Socket reconnected: the reason a vote was backing off has gone, so reset
   * the curve and push every pending selection straight away.
   */
  const resetPollBackoff = useCallback(() => {
    for (const [messageId, entry] of Array.from(pendingRef.current)) {
      if (entry.timer) clearTimeout(entry.timer);
      pendingRef.current.set(messageId, { ...entry, timer: null, attempt: 0 });
      sendVote(messageId);
    }
  }, [sendVote]);

  return { vote, closePoll, resetPollBackoff };
}
