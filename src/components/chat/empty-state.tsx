import { MessageSquare, Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 chat-bg">
      {/* Animated icon */}
      <div className="relative animate-float">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <MessageSquare className="h-9 w-9 text-primary" strokeWidth={1.5} />
        </div>
        <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      </div>

      {/* Text */}
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">
          Select a conversation
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Pick a chat from the sidebar to start messaging
        </p>
      </div>
    </div>
  );
}
