import React, { useMemo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Reaction {
  chatuserId: string;
  userName: string;
  reaction: string;
}

interface MessageReactionsProps {
  reactions: Reaction[];
  isSender: boolean;
  currentUserId: string;
  onReactionClick: (emoji: string) => void;
  onShowDetails: () => void;
}

const MAX_VISIBLE_EMOJIS = 5;

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  currentUserId,
  onReactionClick,
  onShowDetails,
}) => {
  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; hasCurrentUser: boolean }>();
    for (const r of reactions) {
      const existing = map.get(r.reaction);
      if (existing) {
        existing.count++;
        if (r.chatuserId === currentUserId) existing.hasCurrentUser = true;
      } else {
        map.set(r.reaction, {
          emoji: r.reaction,
          count: 1,
          hasCurrentUser: r.chatuserId === currentUserId,
        });
      }
    }
    return Array.from(map.values());
  }, [reactions, currentUserId]);

  if (grouped.length === 0) return null;

  const visible = grouped.slice(0, MAX_VISIBLE_EMOJIS);
  const hasOverflow = grouped.length > MAX_VISIBLE_EMOJIS;

  return (
    <div
      className="flex flex-wrap gap-1"
    >
      {visible.map(({ emoji, count, hasCurrentUser }) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation();
            onReactionClick(emoji);
          }}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-all hover:scale-105",
            "bg-card/80 backdrop-blur-sm border shadow-sm cursor-pointer",
            hasCurrentUser
              ? "border-primary/50 bg-primary/10"
              : "border-border/40"
          )}
        >
          <span className="text-sm leading-none">{emoji}</span>
          {count > 1 && (
            <span className="text-[10px] font-medium text-muted-foreground leading-none">
              {count}
            </span>
          )}
        </button>
      ))}
      {hasOverflow && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowDetails();
          }}
          className="inline-flex items-center gap-0.5 rounded-full border border-border/40 bg-card/80 px-1.5 py-0.5 text-xs shadow-sm backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground leading-none">
            {grouped.length - MAX_VISIBLE_EMOJIS}
          </span>
        </button>
      )}
    </div>
  );
};
