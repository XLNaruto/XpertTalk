import React, { useState } from "react";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MUTE_DURATIONS, muteUntilFrom } from "@/lib/mute";
import { cn } from "@/lib/utils";

interface MuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Talk being muted — shown in the description so the target is unambiguous. */
  name?: string;
  /** Receives the absolute `muteUntil` for the picked preset (null = always). */
  onConfirm: (muteUntil: string | null) => void;
}

/**
 * Duration picker shared by the chat list's context menu and the chat header,
 * so both entry points mute for the same set of durations. The preset is only
 * turned into an absolute `muteUntil` on confirm — picking a radio then sitting
 * on the dialog shouldn't backdate the mute window.
 */
export const MuteDialog: React.FC<MuteDialogProps> = ({
  open,
  onOpenChange,
  name,
  onConfirm,
}) => {
  const [selected, setSelected] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setSelected(0);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-sm" showCloseButton>
        <DialogHeader className="gap-1.5 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-primary" />
            Mute notifications
          </DialogTitle>
          <DialogDescription>
            {name
              ? `Silence notifications from ${name} for…`
              : "Silence notifications for…"}
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="Mute duration"
          className="flex flex-col gap-2"
        >
          {MUTE_DURATIONS.map((d, i) => {
            const isSelected = i === selected;
            return (
              <button
                key={d.label}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(i)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm transition-all",
                  isSelected
                    ? "bg-primary/10 ring-2 ring-primary/50"
                    : "ring-1 ring-border/40 hover:bg-muted/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    isSelected
                      ? "border-primary"
                      : "border-muted-foreground/40"
                  )}
                >
                  {isSelected && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>
                <span className={cn("font-medium", isSelected && "text-primary")}>
                  {d.label}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="mt-1 gap-2">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl font-semibold"
            onClick={() => {
              onConfirm(muteUntilFrom(MUTE_DURATIONS[selected].hours));
              onOpenChange(false);
            }}
          >
            Mute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MuteDialog;
