import { Upload } from "lucide-react";

interface DragOverlayProps {
  isVisible: boolean;
}

export function DragOverlay({ isVisible }: DragOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-12 py-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Upload className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">Drop files here</p>
        <p className="text-xs text-muted-foreground">
          Images, videos & documents supported
        </p>
      </div>
    </div>
  );
}
