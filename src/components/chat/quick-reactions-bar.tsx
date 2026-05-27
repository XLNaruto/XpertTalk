import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const EmojiPicker = React.lazy(() => import("@emoji-mart/react"));
import emojiData from "@emoji-mart/data";

const QUICK_EMOJIS = ["👍", "✅", "😂", "😮", "😢", "🙏"];

interface QuickReactionsBarProps {
  isSender: boolean;
  onQuickReaction: (emoji: string) => void;
  onFullEmojiSelect: (emoji: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export const QuickReactionsBar: React.FC<QuickReactionsBarProps> = ({
  isSender,
  onQuickReaction,
  onFullEmojiSelect,
  onOpenChange,
}) => {
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Notify parent when bar or picker is open/closed
  useEffect(() => {
    onOpenChange?.(open || pickerOpen);
  }, [open, pickerOpen, onOpenChange]);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleFullSelect = useCallback(
    (emoji: any) => {
      onFullEmojiSelect(emoji.native);
      setPickerOpen(false);
      setOpen(false);
    },
    [onFullEmojiSelect]
  );

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      onQuickReaction(emoji);
      setOpen(false);
    },
    [onQuickReaction]
  );

  // Close on outside click — but ignore clicks within the same message bubble
  useEffect(() => {
    if (!open && !pickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Clicking inside the container (trigger + bar), the bar itself, or the picker — keep open
      if (containerRef.current?.contains(target)) return;
      if (barRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;

      // Clicking inside the same message bubble row — keep open
      const messageBubble = containerRef.current?.closest("[data-message-id]") ||
        containerRef.current?.closest(".group");
      if (messageBubble?.contains(target)) return;

      setOpen(false);
      setPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, pickerOpen]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Add reaction button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
            setPickerOpen(false);
          } else {
            setOpen(true);
          }
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-muted-foreground cursor-pointer"
      >
        <SmilePlus className="h-4 w-4" />
      </button>

      {/* Quick reactions bar */}
      {open && (
        <div
          ref={barRef}
          className={cn(
            "absolute z-10 flex items-center gap-0.5 rounded-full border border-border/50 bg-popover/90 px-1 py-0.5 shadow-xl backdrop-blur-lg animate-in fade-in-0 zoom-in-95 duration-150",
            isSender ? "right-6" : "left-6"
          )}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                handleQuickReaction(emoji);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen((v) => !v);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
            {pickerOpen && (
              <div
                ref={pickerRef}
                className={cn(
                  "absolute bottom-9 z-50 rounded-xl border border-border/50 bg-popover shadow-xl",
                  isSender ? "right-0" : "right-0"
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex h-[435px] w-[352px] items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  }
                >
                  <EmojiPicker
                    data={emojiData}
                    onEmojiSelect={handleFullSelect}
                    previewPosition="none"
                    theme={resolvedTheme === "dark" ? "dark" : "light"}
                    emojiButtonSize={30}
                    emojiSize={18}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
