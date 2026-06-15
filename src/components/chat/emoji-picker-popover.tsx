import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { useTheme } from "next-themes";

const EmojiPicker = React.lazy(() => import("@emoji-mart/react"));
import emojiData from "@emoji-mart/data";

interface EmojiPickerPopoverProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPickerPopover({ onEmojiSelect }: EmojiPickerPopoverProps) {
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleSelect = useCallback(
    (emoji: any) => {
      onEmojiSelect(emoji.native);
    },
    [onEmojiSelect]
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        <div
          ref={pickerRef}
          className="absolute bottom-10 left-0 z-50 rounded-xl border border-border/50 bg-popover shadow-xl"
          // Prevent clicks inside the picker (esp. the search box) from bubbling
          // to the input-row wrapper, whose onClick refocuses the textarea and
          // steals focus away from the emoji search field.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
              onEmojiSelect={handleSelect}
              previewPosition="none"
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              emojiButtonSize={30}
              emojiSize={18}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
