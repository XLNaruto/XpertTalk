import React from "react";
import { BarChart3, Check, Lock, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  myVotesOf,
  nextSelection,
  optionPercent,
  pollShowsResults,
  sortedOptions,
  type Poll,
  type PollOption,
} from "@/lib/polls";

interface PollBubbleProps {
  messageId: string;
  poll: Poll;
  isSender: boolean;
  isSelectionMode: boolean;
  onVote: (messageId: string, poll: Poll, optionIds: string[]) => void;
  /** Asks the parent to confirm-and-close; it owns the dialog and the spinner. */
  onRequestClosePoll: () => void;
  /** True while the parent's close is in flight. */
  closing: boolean;
  /** Opens the voters list — `null` for every option, or one option's id. */
  onOpenVoters: (optionId: string | null) => void;
  /** The bubble's own timestamp row, rendered under the footer. */
  timestamp?: React.ReactNode;
}

/** At most three faces inline; the rest live behind "View votes". */
const INLINE_AVATARS = 3;

/** A 17px face for the inline voter stack — the shared avatar starts at 24px. */
function MiniAvatar({
  src,
  name,
  isSender,
}: {
  src?: string;
  name?: string;
  isSender: boolean;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex h-[17px] w-[17px] items-center justify-center overflow-hidden rounded-full text-[8px] font-bold ring-[1.5px]",
        isSender
          ? "bg-white/30 text-white ring-white/25"
          : "bg-primary/15 text-primary ring-background"
      )}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

export function PollBubble({
  messageId,
  poll,
  isSender,
  isSelectionMode,
  onVote,
  onRequestClosePoll,
  closing,
  onOpenVoters,
  timestamp,
}: PollBubbleProps) {
  const options = sortedOptions(poll);
  const myVotes = myVotesOf(poll);
  const isClosed = !!poll.isClosed;
  // Selection mode hands every click to the checkbox, so voting is off then.
  const canVote = !isClosed && !isSelectionMode;
  const voterCount = poll.voterCount || 0;

  // `isSender` on a poll message IS the poll's creator.
  const isCreator = isSender;
  const showResults = pollShowsResults(poll, isCreator);

  const canViewVotes = showResults && !poll.isAnonymous && voterCount > 0;
  /**
   * `canClose` only rides on an ADDRESSED payload, and a freshly created poll
   * reaches the list on the `newMessage` broadcast — which has none. Without
   * the creator fallback the Close control is missing until the poll is
   * re-read (a vote ack, a reconnect, a reload). The server is still the
   * authority, and closing an already-closed poll succeeds anyway.
   */
  const canClose = (!!poll.canClose || isCreator) && !isClosed;

  // The winning option(s), highlighted once the poll is final so it reads as a
  // result sheet. Ties are all highlighted.
  const topCount = options.reduce((max, o) => Math.max(max, o.voteCount || 0), 0);

  const handleOptionClick = (option: PollOption) => {
    if (!canVote) return;
    onVote(messageId, poll, nextSelection(poll, option.optionId));
  };

  // The sent bubble is a saturated gradient with white text; the received one is
  // a light surface. Every colour below has to work on both.
  const muted = isSender ? "text-white/60" : "text-muted-foreground";

  return (
    <div className="w-[min(320px,80vw)] px-3 pb-2 pt-3">
      {/* ── Header: glyph, question, meta ── */}
      <div className="flex items-start gap-2.5 px-0.5">
        <span
          className={cn(
            "mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]",
            isSender ? "bg-white/20 text-white" : "bg-primary/12 text-primary"
          )}
        >
          <BarChart3 className="h-[15px] w-[15px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-[1.3] wrap-break-word">
            {poll.question}
          </p>
          {/* One meta line, instead of a hint above the options and a total
              below them. */}
          <p className={cn("mt-[3px] text-[11px] leading-none", muted)}>
            {isClosed
              ? "Final results"
              : poll.allowMultiple
                ? "Select one or more"
                : "Select one"}
            <span className="px-1">·</span>
            {/* The total is a result too — it would leak the turnout. */}
            {showResults
              ? `${voterCount} ${voterCount === 1 ? "vote" : "votes"}`
              : "Vote to see results"}
          </p>
        </div>

        {isClosed && (
          <span
            className={cn(
              "mt-[3px] inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wider",
              isSender ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}
          >
            <Lock className="h-2.5 w-2.5" /> Closed
          </span>
        )}
      </div>

      {/* ── Options. Each row IS its own bar: the fill grows behind the label,
             so the result reads with no separate line of chrome. Order is
             always `position`, so a row never moves under the cursor. ── */}
      <div className="mt-3 space-y-1.5">
        {options.map((option) => {
          const selected = myVotes.includes(option.optionId);
          // Against `voterCount` (people), never the sum of the option counts.
          const percent = optionPercent(option, poll);
          const voters = option.voters || [];
          const count = option.voteCount || 0;
          const extraVoters = Math.max(0, count - INLINE_AVATARS);
          const isWinner = isClosed && count > 0 && count === topCount;
          const lead = selected || isWinner;

          return (
            <div
              key={option.optionId}
              className={cn(
                "group/opt relative overflow-hidden rounded-xl transition-colors",
                isSender ? "bg-white/[0.14]" : "bg-foreground/[0.055]",
                canVote &&
                  (isSender ? "hover:bg-white/20" : "hover:bg-foreground/[0.09]")
              )}
            >
              {/* The bar itself — a filled track behind the row's content. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 transition-[width] duration-500 ease-out",
                  isSender
                    ? lead
                      ? "bg-white/35"
                      : "bg-white/20"
                    : lead
                      ? "bg-primary/25"
                      : "bg-primary/12"
                )}
                style={{ width: `${showResults ? percent : 0}%` }}
              />

              {/* The vote target covers the WHOLE row — the tally column and the
                  padding included — rather than just the label. The content
                  above it is click-through, except the avatar stack. */}
              <button
                type="button"
                disabled={!canVote}
                onClick={() => handleOptionClick(option)}
                title={option.text}
                aria-label={option.text}
                className={cn(
                  "absolute inset-0 z-0",
                  canVote ? "cursor-pointer" : "cursor-default"
                )}
              />

              <div className="pointer-events-none relative z-10 flex items-center gap-2 py-2.5 pl-2.5 pr-3">
                {/* Radio-like for a single-answer poll, checkbox-like for multi */}
                <span
                  className={cn(
                    "flex h-[17px] w-[17px] shrink-0 items-center justify-center border-[1.5px] transition-colors",
                    poll.allowMultiple ? "rounded-[5px]" : "rounded-full",
                    selected
                      ? isSender
                        ? "border-white bg-white"
                        : "border-primary bg-primary"
                      : isSender
                        ? "border-white/55"
                        : "border-muted-foreground/45",
                    // A closed poll is a result sheet, not a form — the empty
                    // boxes must stop looking like something to click.
                    !canVote && !selected && "opacity-40",
                    canVote &&
                      !selected &&
                      (isSender
                        ? "group-hover/opt:border-white"
                        : "group-hover/opt:border-primary")
                  )}
                >
                  {selected && (
                    <Check
                      className={cn(
                        "h-[11px] w-[11px] stroke-[3.5]",
                        // On a received bubble the box is filled with the brand
                        // colour, so the tick is white; on a sent bubble the box
                        // is white, so the tick takes the bubble's colour.
                        isSender ? "text-primary" : "text-white"
                      )}
                    />
                  )}
                </span>

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13.5px] leading-snug",
                    lead ? "font-semibold" : "font-medium"
                  )}
                >
                  {option.text}
                </span>

                {showResults && voters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenVoters(option.optionId)}
                    aria-label={`See who voted for ${option.text}`}
                    className="pointer-events-auto flex shrink-0 cursor-pointer items-center -space-x-1.5 transition-opacity hover:opacity-80"
                  >
                    {voters.slice(0, INLINE_AVATARS).map((voter) => (
                      <MiniAvatar
                        key={voter.chatuserId}
                        src={voter.profileImage}
                        name={voter.name}
                        isSender={isSender}
                      />
                    ))}
                    {extraVoters > 0 && (
                      <span
                        className={cn(
                          "flex h-[17px] items-center rounded-full px-1 text-[8px] font-bold ring-[1.5px]",
                          isSender
                            ? "bg-white/30 text-white ring-white/25"
                            : "bg-primary/15 text-primary ring-background"
                        )}
                      >
                        +{extraVoters}
                      </span>
                    )}
                  </button>
                )}

                {/* The tally, with its share underneath: the number people act
                    on, and the proportion the bar is drawn from. */}
                {showResults && (
                  <span className="flex shrink-0 flex-col items-end leading-none">
                    <span className="text-[13px] font-bold tabular-nums">{count}</span>
                    <span className={cn("mt-[2px] text-[9px] tabular-nums", muted)}>
                      {Math.round(percent)}%
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Actions ── */}
      {(canViewVotes || canClose) && (
        <div className="mt-2 flex items-center gap-1.5">
          {canViewVotes && (
            <button
              type="button"
              onClick={() => onOpenVoters(null)}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold transition-colors",
                isSender
                  ? "bg-white/[0.14] text-white hover:bg-white/25"
                  : "bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              <Users className="h-3.5 w-3.5" /> View votes
            </button>
          )}
          {/* Gated on `canClose`, which only an addressed payload carries. */}
          {canClose && (
            <button
              type="button"
              disabled={closing}
              onClick={onRequestClosePoll}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold transition-colors disabled:opacity-60",
                isSender
                  ? "bg-white/[0.14] text-white hover:bg-white/25"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {closing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              Close poll
            </button>
          )}
        </div>
      )}

      {timestamp}

    </div>
  );
}

export default PollBubble;
