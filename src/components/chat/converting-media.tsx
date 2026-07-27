import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Placeholder shown in a message while the backend converts an uploaded
 * HEIC/HEIF to PNG. It's swapped for the real image when the talk socket's
 * `mediaConverted` event delivers the new path.
 */
export function ConvertingMedia({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden bg-black/10 [.dark_&]:bg-white/5",
        className
      )}
    >
      <div className="animate-shimmer absolute inset-0" />
      <ImageIcon className="relative h-7 w-7 text-muted-foreground opacity-40" />
    </div>
  );
}
