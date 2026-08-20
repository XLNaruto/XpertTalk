import React, { useState } from "react";
import { Link2, Play } from "lucide-react";
import {
  previewHost,
  previewHref,
  type LinkPreview,
} from "@/lib/link-preview";
import { cn } from "@/lib/utils";

interface LinkPreviewCardProps {
  preview: LinkPreview;
  /**
   * The card is rendered as its OWN bubble, so the surrounding bubble already
   * supplies the inset — the card must not add its own margins on top.
   */
  bare?: boolean;
  /**
   * Row shape — thumbnail on the left, text on the right — for the card that
   * sits BELOW the link text inside a message bubble. The default stacked shape
   * is for the composer, where the card is the only thing in the box.
   */
  horizontal?: boolean;
}

/**
 * The unfurled card shown above a message's text.
 *
 * Every colour here is derived from `currentColor` (see `.msg-card` in
 * index.css), so the card is legible on whichever bubble it lands in — the sent
 * gradient with white text, the received surface with dark text, a custom accent
 * fill, or the composer. Hard-coded theme tokens would be unreadable on one of
 * those, which is exactly how the link colour broke in light mode.
 *
 * Three shapes, driven by what the server could resolve:
 * - a hero image when there's a real og:image,
 * - a compact row with the site icon when `imageIsFavicon` says the image is
 *   only standing in for a missing one,
 * - a plain link chip when `ok` is false.
 */
function LinkPreviewCard({
  preview,
  bare = false,
  horizontal = false,
}: LinkPreviewCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const host = previewHost(preview);
  const href = previewHref(preview);
  const title = preview.title?.trim();
  const description = preview.description?.trim();

  const hero =
    preview.ok && preview.image && !preview.imageIsFavicon && !imgFailed
      ? preview.image
      : null;
  const icon =
    (preview.imageIsFavicon ? preview.image : null) || preview.favicon || null;
  const isVideo = preview.mediaType === "VIDEO";

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer");
  };

  // Nothing resolved — a chip is honest about that without pretending to be a card.
  if (!preview.ok && !title) {
    return (
      <div
        onClick={open}
        className={cn(
          "msg-chip flex w-[270px] max-w-full cursor-pointer items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-[12px]",
          !bare && "mx-[5px] mt-[5px]"
        )}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate opacity-90">{host || href}</span>
      </div>
    );
  }

  if (horizontal) {
    return (
      <div
        onClick={open}
        // Fills the bubble the link text already sized, but capped — an
        // unclamped card lets a long description stretch the bubble to the
        // column's full 55%, which is far wider than the link above it.
        className={cn(
          "msg-card flex w-full min-w-[220px] max-w-[330px] cursor-pointer items-stretch overflow-hidden rounded-lg",
          !bare && "mx-[5px] mt-[5px]"
        )}
      >
        {hero && (
          <div className="relative w-[112px] shrink-0 overflow-hidden bg-black/10">
            <img
              src={hero}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
            {isVideo && (
              <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm">
                <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
              </div>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
          {title && (
            <p className="line-clamp-1 text-[12.5px] font-semibold leading-snug">
              {title}
            </p>
          )}
          {description && (
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug opacity-70">
              {description}
            </p>
          )}
          {host && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              {/* The site icon rides with the host line here — a hero image
                  already occupies the left rail. */}
              {icon && (
                <img
                  src={icon}
                  alt=""
                  loading="lazy"
                  className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <span className="truncate text-[11px] opacity-60">{host}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={open}
      // Fixed width keeps the bubble from stretching to the hero image's
      // intrinsic size, the way a text-only bubble sizes to its text.
      className={cn(
        "msg-card w-[270px] max-w-full cursor-pointer overflow-hidden rounded-xl",
        !bare && "mx-[5px] mt-[5px]"
      )}
    >
      {hero && (
        <div className="relative max-h-[180px] w-full overflow-hidden bg-black/10">
          <img
            src={hero}
            alt=""
            loading="lazy"
            className="max-h-[180px] w-full object-cover"
            onError={() => setImgFailed(true)}
          />
          {isVideo && (
            <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm">
              <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 px-3 py-2">
        {/* Site icon stands in when there's no hero image. */}
        {!hero && icon && (
          <img
            src={icon}
            alt=""
            loading="lazy"
            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          {host && (
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide opacity-60">
              {host}
            </p>
          )}
          {title && (
            <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
              {title}
            </p>
          )}
          {description && (
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug opacity-70">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(LinkPreviewCard);
