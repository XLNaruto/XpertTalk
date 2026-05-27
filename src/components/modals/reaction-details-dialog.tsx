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
        <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "all"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            All {reactions.length}
          </button>
          {tabs.map(({ emoji, count }) => (
            <button
              key={emoji}
              onClick={() => setActiveTab(emoji)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                activeTab === emoji
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              <span className="text-sm">{emoji}</span>
              <span>{count}</span>
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
