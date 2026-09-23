import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import {
  fetchAllPollVoters,
  hasTruncatedVoters,
  inlineVoters,
  mergeVoters,
  sortedOptions,
  type Poll,
  type PollVoter,
} from "@/lib/polls";

interface PollVotersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  poll: Poll;
  /** Which option's tab to land on — `null` shows every vote. */
  initialOptionId?: string | null;
}

/** The tally on a chip — a pill of its own, so it reads apart from the label. */
function ChipCount({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
        active
          ? "bg-primary text-white"
          : "bg-foreground/[0.08] text-muted-foreground"
      )}
    >
      {value}
    </span>
  );
}

function votedAtLabel(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMM, h:mm a");
}

/**
 * Who voted for what.
 *
 * Each option inlines up to 20 voters, so a poll that fits opens instantly from
 * data already held and makes NO request. Past that the rest are paged, and a
 * failed page keeps whatever was collected rather than emptying the list.
 */
export function PollVotersDialog({
  open,
  onOpenChange,
  messageId,
  poll,
  initialOptionId = null,
}: PollVotersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 rounded-xl border-border/50 bg-popover p-0">
        <DialogHeader className="border-b border-border/30 px-5 py-4">
          <DialogTitle className="text-base font-semibold">Votes</DialogTitle>
          <p className="truncate text-left text-xs text-muted-foreground">
            {poll.question}
          </p>
        </DialogHeader>
        {/* Mounted only while open, so the active tab and the paging state are
            initialised once per opening instead of being reset by an effect. */}
        {open && (
          <VotersBody
            messageId={messageId}
            poll={poll}
            initialOptionId={initialOptionId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VotersBody({
  messageId,
  poll,
  initialOptionId,
}: {
  messageId: string;
  poll: Poll;
  initialOptionId: string | null;
}) {
  // Only options past the inline 20 need a request; a poll that fits opens
  // straight from the data already on the message.
  const truncated = hasTruncatedVoters(poll);

  const [activeOption, setActiveOption] = useState<string | null>(initialOptionId);
  const [fetched, setFetched] = useState<PollVoter[]>([]);
  const [loading, setLoading] = useState(truncated);
  const [partial, setPartial] = useState(false);

  const options = useMemo(() => sortedOptions(poll), [poll]);
  const optionText = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of options) map.set(option.optionId, option.text);
    return map;
  }, [options]);

  // Re-sweep when the tally actually moves while the modal is open.
  const revision = poll.revision;

  useEffect(() => {
    if (!truncated) return;

    let cancelled = false;
    // No `optionId` — one paged sweep returns every option's voters, each
    // tagged with the option it belongs to.
    fetchAllPollVoters(messageId)
      .then((result) => {
        if (cancelled) return;
        setFetched(result.voters);
        setPartial(result.partial);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [messageId, truncated, revision]);

  const voters = useMemo(() => {
    const merged = mergeVoters(inlineVoters(poll), fetched);
    return merged.sort(
      (a, b) => new Date(a.votedAt).getTime() - new Date(b.votedAt).getTime()
    );
  }, [poll, fetched]);

  const visible = useMemo(
    () => (activeOption ? voters.filter((v) => v.optionId === activeOption) : voters),
    [voters, activeOption]
  );

  return (
    <>
      {/* Option chips */}
      <div className="flex flex-wrap gap-1 px-4 py-2">
        <button
          onClick={() => setActiveOption(null)}
          className={cn(
            "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-medium transition-colors",
            activeOption === null
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted/60"
          )}
        >
          All
          <ChipCount value={poll.voterCount || 0} active={activeOption === null} />
        </button>
        {options.map((option) => (
          <button
            key={option.optionId}
            onClick={() => setActiveOption(option.optionId)}
            className={cn(
              "inline-flex max-w-[150px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-1.5 text-xs font-medium transition-colors",
              activeOption === option.optionId
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <span className="truncate">{option.text}</span>
            <ChipCount
              value={option.voteCount || 0}
              active={activeOption === option.optionId}
            />
          </button>
        ))}
      </div>

      {/* A failed page is not fatal — keep every row already collected. */}
      {partial && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Couldn't load everyone — showing who we have.
        </div>
      )}

      <ScrollArea className="max-h-[320px] px-4 pb-4">
        {loading && visible.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading votes…
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No votes yet.
          </p>
        ) : (
          <div className="space-y-0.5">
            {visible.map((voter) => (
              <div
                key={`${voter.optionId}-${voter.chatuserId}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <UserAvatar src={voter.profileImage} name={voter.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{voter.name}</p>
                  {activeOption === null && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {optionText.get(voter.optionId || "") || ""}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {votedAtLabel(voter.votedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

export default PollVotersDialog;
