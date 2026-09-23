import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

interface Reaction {
  chatuserId: string;
  userName: string;
  userProfile?: string;
  reaction: string;
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

interface ReactionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reactions: Reaction[];
}

export function ReactionDetailsDialog({
  open,
  onOpenChange,
  reactions,
}: ReactionDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const tabs = useMemo(() => {
    const emojiMap = new Map<string, number>();
    for (const r of reactions) {
      emojiMap.set(r.reaction, (emojiMap.get(r.reaction) || 0) + 1);
    }
    return Array.from(emojiMap.entries()).map(([emoji, count]) => ({
      emoji,
      count,
    }));
  }, [reactions]);

  const filteredReactions = useMemo(() => {
    if (activeTab === "all") return reactions;
    return reactions.filter((r) => r.reaction === activeTab);
  }, [reactions, activeTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl border-border/50 bg-popover p-0">
        <DialogHeader className="border-b border-border/30 px-5 py-4">
          <DialogTitle className="text-base font-semibold">Reactions</DialogTitle>
        </DialogHeader>

        {/* Emoji tabs */}
        <div className="flex flex-wrap gap-1 px-4 py-2">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-medium transition-colors",
              activeTab === "all"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            All
            <ChipCount value={reactions.length} active={activeTab === "all"} />
          </button>
          {tabs.map(({ emoji, count }) => (
            <button
              key={emoji}
              onClick={() => setActiveTab(emoji)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-1.5 text-xs font-medium transition-colors",
                activeTab === emoji
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              <span className="text-sm">{emoji}</span>
              <ChipCount value={count} active={activeTab === emoji} />
            </button>
          ))}
        </div>

        {/* User list */}
        <ScrollArea className="max-h-[320px] px-4 pb-4">
          <div className="space-y-0.5">
            {filteredReactions.map((r, idx) => (
              <div
                key={`${r.chatuserId}-${r.reaction}-${idx}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <UserAvatar src={r.userProfile} name={r.userName} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.userName}
                </span>
                <span className="shrink-0 text-base">{r.reaction}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
