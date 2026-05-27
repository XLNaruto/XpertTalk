import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ScrollToBottomProps {
  isVisible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export function ScrollToBottom({
  isVisible,
  unreadCount = 0,
  onClick,
}: ScrollToBottomProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute bottom-4 right-4 z-10">
      <button
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-primary/10 transition-all hover:scale-105 active:scale-95"
        onClick={onClick}
      >
        <ArrowDown className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="glow-badge absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {unreadCount}
          </Badge>
        )}
      </button>
    </div>
  );
}
