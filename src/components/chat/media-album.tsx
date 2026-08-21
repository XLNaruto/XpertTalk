import React from "react";
import { Play, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { isConvertingMedia } from "@/lib/media-convert";
import { ConvertingMedia } from "@/components/chat/converting-media";
import { isViewable, type MediaItem } from "@/lib/media-items";

interface MediaAlbumProps {
  /** Ordered attachments of ONE message — an album is a single message. */
  items: MediaItem[];
  /** Fires for a viewable item (image/video) — open the lightbox on it. */
  onItemClick: (item: MediaItem) => void;
  /** Fires for a non-viewable item (document/audio) — download it. */
  onDocumentClick: (item: MediaItem) => void;
  /** Selection mode swallows tile clicks so the whole album selects instead. */
  isSelectionMode?: boolean;
}

/**
 * The tiled preview of a multi-attachment message. Up to four tiles are shown
 * with a "+N" overlay on the last; every tile renders per ITEM type, because an
 * album can mix an image and a PDF — the message's `messageType` only describes
 * the first attachment.
 */
function MediaAlbum({
  items,
  onItemClick,
  onDocumentClick,
  isSelectionMode,
}: MediaAlbumProps) {
  const visible = items.slice(0, 4);
  const extraCount = items.length - 4;
  const total = items.length;

  // A 3-item album leads with a full-width banner; everything else is squares.
  const spans = (idx: number) => total === 3 && idx === 0;
  const cellClass = (idx: number) =>
    total === 3 && idx === 0 ? "h-[150px] w-full" : "aspect-square w-full";

  return (
    // Fixed 300px so tiles stay thumbnail-sized — the bubble is sized to the
    // album, and a long caption wraps inside that width (see message-bubble).
    <div className="grid w-[300px] max-w-full grid-cols-2 gap-[2px]">
      {visible.map((item, idx) => {
        const showCountOverlay = idx === 3 && extraCount > 0;
        // HEIC/HEIF still being converted server-side — nothing paintable yet.
        const converting = isConvertingMedia(item.mediaPath);
        const viewable = isViewable(item);
        const clickable = !isSelectionMode && !converting;

        return (
          <div
            key={item.mediaId || `${item.mediaPath}-${idx}`}
            className={cn(
              // A fitted frame leaves space around itself — the wash gives that
              // space a surface on whichever bubble the tile lands in.
              "media-plate relative overflow-hidden",
              clickable && "cursor-pointer",
              cellClass(idx),
              spans(idx) && "col-span-2"
            )}
            onClick={
              clickable
                ? (e) => {
                    e.stopPropagation();
                    if (viewable) onItemClick(item);
                    else onDocumentClick(item);
                  }
                : undefined
            }
          >
            {converting ? (
              <ConvertingMedia className="h-full w-full" />
            ) : item.mediaType === "VIDEO" ? (
              <>
                <video
                  src={item.mediaPath}
                  muted
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
                <div className="absolute left-1/2 top-1/2 z-[2] flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm transition-transform hover:scale-110">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
                </div>
              </>
            ) : viewable ? (
              <img
                src={item.mediaPath}
                alt=""
                loading="lazy"
                // Fitted whole, like a lone attachment — `cover` cropped the
                // top and bottom off a portrait screenshot. The tile fill shows
                // through whatever the frame doesn't use.
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            ) : (
              // Document / audio tile inside a mixed album
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center">
                <FileText className="h-6 w-6 text-white/80" />
                <span className="line-clamp-2 text-[10px] font-medium text-white/80">
                  {item.mediaName || "Document"}
                </span>
              </div>
            )}

            {/* +N overlay on the 4th tile */}
            {showCountOverlay && (
              <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/50">
                <span className="text-2xl font-bold text-white">
                  +{extraCount}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(MediaAlbum);
