import React, { useState } from "react";
import {
  Reply,
  SquareCheck,
  Copy,
  Pencil,
  Download,
  Trash2,
  Check,
  CheckCheck,
  Play,
  FileText,
  Forward,
  ImageOff,
  SmilePlus,
  Pin,
  PinOff,
  Ban,
  MailOpen,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { formatMessage, formatPreview } from "@/lib/message-formatters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { getEncodedCookie } from "@/lib/encryption";
import { copyImageToClipboard, prewarmImage } from "@/lib/copy-image";
import { isConvertingMedia } from "@/lib/media-convert";
import { ConvertingMedia } from "@/components/chat/converting-media";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickReactionsBar } from "@/components/chat/quick-reactions-bar";
import { MessageReactions } from "@/components/chat/message-reactions";
import { ReactionDetailsDialog } from "@/components/modals/reaction-details-dialog";
import MediaAlbum from "@/components/chat/media-album";
import LinkPreviewCard from "@/components/chat/link-preview-card";
import { useLinkPreviews } from "@/hooks/use-link-preview";
import {
  getMediaCount,
  getMediaItems,
  getMessageText,
  itemKind,
  previewLabel,
  type MediaItem,
} from "@/lib/media-items";
import { downloadMedia, downloadMediaItems } from "@/lib/download-media";
import logger from "@/lib/logger";

// ── Sender name color palette (vibrant, gamified) ──

// const NAME_COLORS = [
//   { light: "#6366f1", dark: "#a5b4fc" },
//   { light: "#10b981", dark: "#6ee7b7" },
//   { light: "#f59e0b", dark: "#fcd34d" },
//   { light: "#ef4444", dark: "#fca5a5" },
//   { light: "#8b5cf6", dark: "#c4b5fd" },
//   { light: "#ec4899", dark: "#f9a8d4" },
//   { light: "#06b6d4", dark: "#67e8f9" },
//   { light: "#f97316", dark: "#fdba74" },
// ];

// function getSenderColor(id: string) {
//   let hash = 0;
//   for (let i = 0; i < id.length; i++)
//     hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
//   return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
// }

// Detect emoji-only messages (no other text)
function isEmojiOnly(text: string): boolean {
  // Strip all emoji, ZWJ sequences, variation selectors, skin tone modifiers, and whitespace
  const stripped = text.trim().replace(
    /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}\s]/gu,
    ""
  );
  // Must have no remaining text and at least one emoji character
  return stripped.length === 0 && /\p{Extended_Pictographic}/u.test(text);
}

// ── Props ──

interface MessageBubbleProps {
  message: any;
  isSender: boolean;
  showSenderInfo: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onReply: (message: any) => void;
  onEdit: (message: any) => void;
  onDelete: (messageId: string) => void;
  onSelect: (message: any) => void;
  onEnterSelectionMode: (message: any) => void;
  onForward: (message: any) => void;
  onMediaClick: (
    mediaPath: string,
    mediaType: "image" | "video",
    messageId?: string,
    mediaId?: string
  ) => void;
  onScrollToMessage?: (messageId: string) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  onTogglePin: (messageId: string) => void;
  onMarkUnread: (message: any) => void;
}

// ── Time overlay for standalone media ──

function TimeOverlay({
  time,
  isSender,
  isReadByAll,
}: {
  time: string;
  isSender: boolean;
  isReadByAll?: boolean;
}) {
  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg px-2 py-[3px]" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
      <span className="text-[10px] font-medium text-white/90">
        {format(new Date(time), "h:mm a")}
      </span>
      {isSender &&
        (isReadByAll ? (
          <CheckCheck className="h-3.5 w-3.5 text-[var(--chat-check-read)]" />
        ) : (
          <Check className="h-3.5 w-3.5 text-white/50" />
        ))}
    </div>
  );
}

// ── Inline bubble timestamp (static, bottom-right inside bubble) ──

function BubbleTimestamp({
  time,
  isSender,
  isReadByAll,
  isEdited,
  noBubble,
  className,
}: {
  time: string;
  isSender: boolean;
  isReadByAll?: boolean;
  isEdited?: boolean;
  noBubble?: boolean;
  /** Overrides the default float placement (used by the caption block). */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap text-[10px] font-medium leading-none",
        className ?? "float-right ml-2 my-1",
        noBubble
          ? "text-muted-foreground/70"
          : isSender ? "text-white/70" : "text-muted-foreground/70"
      )}
    >
      {isEdited && (
        <span className="mr-0.5 italic opacity-60">Edited</span>
      )}
      {format(new Date(time), "h:mm a")}
      {isSender &&
        (isReadByAll ? (
          <CheckCheck className={cn("h-3 w-3", noBubble ? "text-[var(--chat-check-read)]" : "text-white")} />
        ) : (
          <Check className="h-3 w-3 opacity-50" />
        ))}
    </span>
  );
}

// ── Portrait media sizing ──

/** Natural pixel size of a loaded image/video, or null before it loads. */
type MediaSize = { w: number; h: number } | null;

const isLandscapeSize = (size: MediaSize) => !!size && size.w > size.h;

// Portrait / square media sits in ONE fixed 4:5 box, whatever its own ratio: the
// frame is fitted whole (`object-contain`) and whatever is left over shows the
// bubble colour behind it. A box matched to each media's exact ratio made every
// bubble a different width, and cropping to fill it cut the frame's edges off.
const PORTRAIT_BOX = "aspect-[4/5] w-[240px]";

// ── Broken image fallback ──

function FallbackImage({ isSender }: { isSender: boolean }) {
  return (
    <div
      className={cn(
        "flex h-[120px] w-[200px] flex-col items-center justify-center gap-2 rounded-xl",
        isSender ? "bg-white/10" : "bg-muted"
      )}
    >
      <ImageOff
        className={cn(
          "h-8 w-8",
          isSender ? "text-white/30" : "text-muted-foreground/30"
        )}
      />
      <span
        className={cn(
          "text-xs",
          isSender ? "text-white/30" : "text-muted-foreground/30"
        )}
      >
        Image unavailable
      </span>
    </div>
  );
}

// ── Selection checkbox ──

const SelectionCheckbox: React.FC<{
  isSelected: boolean;
  onClick: () => void;
}> = ({ isSelected, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
      isSelected
        ? "border-primary bg-primary text-white glow-ring"
        : "border-muted-foreground/30 bg-transparent"
    )}
  >
    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
  </button>
);

// ── Reply preview ──

function ReplyPreview({
  message,
  replyMsg,
  replyText,
  isSender,
  replyToMessageId,
  onScrollToMessage,
}: {
  message: any;
  replyMsg: any;
  replyText?: string;
  isSender: boolean;
  replyToMessageId?: string;
  onScrollToMessage?: (messageId: string) => void;
}) {

  logger.debug("replyMsg++++++++",replyMsg,message)

  if (!replyMsg) return null;

  const isMediaReply =
    replyMsg.messageType === "IMAGE" || replyMsg.messageType === "VIDEO";
  // Caption first, then a media description. A quoted image can now carry text,
  // and `messageType` says nothing about whether it does.
  const replyLabel = replyText || previewLabel(replyMsg);
  const formattedReplyText = formatPreview(replyLabel);
  const replyMediaCount = getMediaCount(replyMsg);

  return (
    <div
      className={cn(
        "mx-[5px] mt-[5px] flex cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-xl border-l-[3px] px-3 py-[6px] transition-colors",
        isSender
          ? "border-white/50 bg-white/20 hover:bg-white/30"
          : "border-primary/50 bg-primary/5 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/15"
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (replyToMessageId && onScrollToMessage) {
          onScrollToMessage(replyToMessageId);
        }
      }}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "text-[11px] font-semibold",
            isSender ? "text-white/90" : "text-primary"
          )}
        >
          {replyMsg.senderName}
        </p>
        <p
          className={cn(
            "max-w-[240px] truncate text-[11.5px]",
            isSender ? "text-white/70" : "text-muted-foreground"
          )}
        >
          <span dangerouslySetInnerHTML={{ __html: formattedReplyText }} />
        </p>
      </div>
      {isMediaReply && replyMsg.mediaPath && (
        <div className="relative h-[34px] w-[34px] shrink-0 overflow-hidden rounded-lg">
          {isConvertingMedia(replyMsg.mediaPath) ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : replyMsg.messageType === "IMAGE" ? (
            <img
              src={replyMsg.mediaPath}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <video
              src={replyMsg.mediaPath}
              muted
              preload="metadata"
              className="h-full w-full object-cover"
            />
          )}
          {/* The preview carries only the first attachment — badge the rest. */}
          {replyMediaCount > 1 && (
            <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[9px] font-bold leading-[13px] text-white">
              +{replyMediaCount - 1}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSender,
  showSenderInfo,
  isSelected,
  isSelectionMode,
  onReply,
  onEdit,
  onDelete,
  onSelect,
  onEnterSelectionMode,
  onForward,
  onMediaClick,
  onScrollToMessage,
  onToggleReaction,
  onTogglePin,
  onMarkUnread,
}) => {
  const [imgError, setImgError] = useState(false);
  // Orientation of the standalone image, measured on load. Landscape images
  // render as a full-width rectangle at natural aspect; portrait/square images
  // render inside a fixed square box with a color fill.
  const [imgSize, setImgSize] = useState<MediaSize>(null);
  const [vidSize, setVidSize] = useState<MediaSize>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reactionDetailOpen, setReactionDetailOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const chatuserId = getEncodedCookie("chatuserId") || "";

  // Every message renders from its ordered attachment list — a single
  // attachment is just a one-item album, so there is no separate code path.
  const mediaItems = getMediaItems(message);
  const hasMedia = mediaItems.length > 0;
  const isAlbum = mediaItems.length > 1;
  const firstItem = mediaItems[0];

  // The message's text. On a media message this is the CAPTION — never gate it
  // on `messageType`, which only describes how to render the bubble.
  const bodyText = getMessageText(message);
  const hasText = !!bodyText;

  // Unfurl every link in the text (capped in the hook) — a media CAPTION
  // unfurls exactly like a text message, so the gate is only "is there text",
  // never "is this a text bubble". Skipped for tombstones.
  const linkPreviews = useLinkPreviews(bodyText, hasText && !message.isDeleted);
  const hasLinkPreviews = linkPreviews.length > 0;

  // Edge-to-edge image bubble: only for a lone, uncaptioned, non-reply image.
  const isStandaloneImage =
    !isAlbum &&
    !hasText &&
    firstItem?.mediaType === "IMAGE" &&
    !message.replyToMessageId &&
    !imgError;

  const handleDownload = () => {
    if (isAlbum) {
      // Forwarding clones the whole album, so download every attachment.
      downloadMediaItems(mediaItems);
      return;
    }
    downloadMedia(firstItem?.mediaPath, firstItem?.mediaName || "document");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(bodyText);
    toast.success("Copied to clipboard");
  };

  const handleCopyImage = async () => {
    const url = firstItem?.mediaPath;
    if (!url) return;
    try {
      await copyImageToClipboard(url);
      toast.success("Image copied to clipboard");
    } catch {
      toast.error("Couldn't copy image");
    }
  };

  // Hide Edit/Delete once the message is older than 24 hours.
  // Admins are exempt from the 24-hour window; the restriction is employee-only.
  const isAdmin = (import.meta.env.VITE_APP_USER || "employee") === "admin";
  const isWithin24Hours =
    isAdmin ||
    Date.now() - new Date(message.created).getTime() < 24 * 60 * 60 * 1000;

  // ── Context menu items ──

  const contextMenuContent = (
    <ContextMenuContent className="min-w-[160px] rounded-xl border-border/50 bg-popover p-1.5 shadow-xl">
      <ContextMenuItem
        onClick={() => onReply(message)}
        className="gap-2 rounded-lg px-2.5 py-2 text-sm"
      >
        <Reply className="h-4 w-4" /> Reply
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => onForward(message)}
        className="gap-2 rounded-lg px-2.5 py-2 text-sm"
      >
        <Forward className="h-4 w-4" /> Forward
      </ContextMenuItem>
      {!isSelectionMode && (
        <ContextMenuItem
          onClick={() => onEnterSelectionMode(message)}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <SquareCheck className="h-4 w-4" /> Select
        </ContextMenuItem>
      )}
      {/* Copy text — driven by whether there IS text, not by messageType, so a
          captioned image offers it too. */}
      {hasText && (
        <ContextMenuItem
          onClick={handleCopy}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Copy className="h-4 w-4" /> Copy text
        </ContextMenuItem>
      )}
      {/* Edit — the caption lives in the same `messageText` a text message uses,
          so editing works on a media message too, including adding a caption
          where there wasn't one. */}
      {isSender && !message.forwardFromMessageId && isWithin24Hours && (
        <ContextMenuItem
          onClick={() => onEdit(message)}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Pencil className="h-4 w-4" />{" "}
          {hasMedia ? (hasText ? "Edit caption" : "Add caption") : "Edit"}
        </ContextMenuItem>
      )}
      {!isAlbum && firstItem?.mediaType === "IMAGE" && (
        <ContextMenuItem
          onClick={handleCopyImage}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Copy className="h-4 w-4" /> Copy image
        </ContextMenuItem>
      )}
      {hasMedia && (
        <ContextMenuItem
          onClick={handleDownload}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Download className="h-4 w-4" />{" "}
          {isAlbum ? `Download all (${mediaItems.length})` : "Download"}
        </ContextMenuItem>
      )}
      {message.reactions?.length > 0 && (
        <ContextMenuItem
          onClick={() => setReactionDetailOpen(true)}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <SmilePlus className="h-4 w-4" /> View Reactions
        </ContextMenuItem>
      )}
      {!isSender && (
        <ContextMenuItem
          onClick={() => onMarkUnread(message)}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <MailOpen className="h-4 w-4" /> Mark as unread
        </ContextMenuItem>
      )}
      <ContextMenuItem
        onClick={() => onTogglePin(message.messageId)}
        className="gap-2 rounded-lg px-2.5 py-2 text-sm"
      >
        {message.isPinned
          ? <><PinOff className="h-4 w-4" /> Unpin</>
          : <><Pin className="h-4 w-4" /> Pin</>}
      </ContextMenuItem>
      {isSender && isWithin24Hours && (
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => setDeleteConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );

  // ── Image renderer ──

  function renderImage(path: string) {
    if (imgError) {
      return <FallbackImage isSender={isSender} />;
    }
    // Still a .heic/.heif original — the backend is converting it to PNG and
    // will push the new path over `mediaConverted`. Nothing paintable yet.
    if (isConvertingMedia(path)) {
      return <ConvertingMedia />;
    }
    const isLandscape = isLandscapeSize(imgSize);
    return (
      <div
        className={cn(
          "media-plate relative cursor-pointer overflow-hidden",
          isLandscape
            ? // Landscape: full-width rectangle at natural aspect ratio
              "max-w-[360px]"
            : // Portrait / square: fitted whole into the fixed box
              PORTRAIT_BOX
        )}
        onClick={() =>
          onMediaClick(path, "image", message.messageId, firstItem?.mediaId)
        }
        // Fetch + PNG-encode in the background on hover, so a later "Copy image"
        // is a pure clipboard write (~ms) instead of a 3-4s download+encode.
        onMouseEnter={() => prewarmImage(path)}
      >
        <img
          src={path}
          alt="Uploaded"
          className={cn(
            isLandscape ? "h-auto w-full" : "h-full w-full object-contain"
          )}
          loading="lazy"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
            }
          }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  function renderVideo(path: string) {
    const isLandscape = isLandscapeSize(vidSize);
    return (
      <div
        className={cn(
          "media-plate group/vid relative cursor-pointer overflow-hidden rounded-xl",
          isLandscape
            ? // Landscape: full-width rectangle at natural aspect ratio
              "max-w-[360px]"
            : // Portrait / square: fitted whole into the fixed box
              PORTRAIT_BOX
        )}
        onClick={() =>
          onMediaClick(path, "video", message.messageId, firstItem?.mediaId)
        }
      >
        <video
          src={path}
          muted
          preload="metadata"
          className={cn(
            isLandscape ? "h-auto w-full" : "h-full w-full object-contain"
          )}
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (vid.videoWidth && vid.videoHeight) {
              setVidSize({ w: vid.videoWidth, h: vid.videoHeight });
            }
          }}
        />
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm transition-transform group-hover/vid:scale-110">
          <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
        </div>
      </div>
    );
  }

  function renderDocument(name?: string) {
    return (
      <div
        onClick={(e) => {
          if (isSelectionMode) return;
          e.stopPropagation();
          handleDownload();
        }}
        className={cn(
          "flex max-w-70 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5",
          isSender
            ? "bg-white/15"
            : "bg-primary/5 dark:bg-primary/10"
        )}
      >
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isSender ? "bg-white/20" : "bg-primary/15"
        )}>
          <FileText className={cn("h-5 w-5", isSender ? "text-white" : "text-primary")} />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {name || "Document"}
        </span>
      </div>
    );
  }

  // ── Media props (first attachment — the album is rendered from mediaItems) ──

  const mediaPath = firstItem?.mediaPath;
  const mediaName = firstItem?.mediaName;

  /** Open one album item in the lightbox, or download it when it isn't viewable. */
  const openAlbumItem = (item: MediaItem) =>
    onMediaClick(item.mediaPath, itemKind(item), message.messageId, item.mediaId);
  const downloadAlbumItem = (item: MediaItem) =>
    downloadMedia(item.mediaPath, item.mediaName);

  /** The caption block — also carries the timestamp when text is present. */
  function renderTextBlock(text: string) {
    // Room the timestamp needs, reserved by an inline spacer at the end of the
    // text. When the last line has space the stamp sits in it; when it doesn't,
    // the spacer wraps and the stamp lands on the line it opened up. Widened
    // for the tick icon (sender) and the "Edited" label.
    const stampWidth = (isSender ? 62 : 44) + (isEdited ? 40 : 0);

    return (
      <div className="pb-1">
        <div className="relative px-3.5 pt-[9px]">
          <div
            className="text-[14px] leading-[1.55] wrap-break-word"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              wordBreak: "break-word",
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: formatMessage(text) }} />
            {!hasLinkPreviews && (
              <span
                aria-hidden
                className="inline-block align-baseline"
                style={{ width: stampWidth, height: 1 }}
              />
            )}
          </div>
          {/* With cards below, the timestamp moves under them — otherwise it
              would sit between the link and its own preview. */}
          {!hasLinkPreviews && (
            <BubbleTimestamp
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
              isEdited={isEdited}
              className="absolute bottom-[2px] right-3.5"
            />
          )}
        </div>

        {hasLinkPreviews && (
          <>
            {/* One card per link, stacked in the order the links appear. */}
            <div className="flex flex-col gap-[6px] px-3.5 pt-[6px]">
              {linkPreviews.map(({ url, preview }) => (
                <LinkPreviewCard
                  key={url}
                  preview={preview}
                  bare
                  horizontal
                  // Under media the bubble is already sized by the tiles, so
                  // the card fills that width instead of stopping short at its
                  // own cap and leaving a gap beside it.
                  className={cn(hasMedia && "min-w-0 max-w-none")}
                />
              ))}
            </div>
            <div className="px-3.5">
              <BubbleTimestamp
                time={message.created}
                isSender={isSender}
                isReadByAll={message.isReadByAll}
                isEdited={isEdited}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  /**
   * The media half of a bubble. An album renders as a tiled grid; a lone
   * attachment renders per ITS type. The timestamp only sits on the media when
   * there is no caption to carry it.
   */
  function renderMediaSection() {
    if (!hasMedia) return null;

    if (isAlbum) {
      return (
        <div className="relative m-[5px] overflow-hidden rounded-xl">
          <MediaAlbum
            items={mediaItems}
            onItemClick={openAlbumItem}
            onDocumentClick={downloadAlbumItem}
            isSelectionMode={isSelectionMode}
          />
          {!hasText && (
            <TimeOverlay
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
            />
          )}
        </div>
      );
    }

    const type = firstItem?.mediaType;

    if (type === "DOCUMENT" || type === "AUDIO") {
      return (
        <div className="px-3.5 pt-[9px] pb-1">
          {renderDocument(mediaName)}
          {!hasText && (
            <BubbleTimestamp
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
              isEdited={isEdited}
            />
          )}
        </div>
      );
    }

    if (type === "VIDEO") {
      return (
        <div className="relative m-[5px]">
          {renderVideo(mediaPath)}
          {!hasText && (
            <TimeOverlay
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
            />
          )}
        </div>
      );
    }

    return (
      <>
        <div className="relative m-[5px] overflow-hidden rounded-xl">
          {renderImage(mediaPath)}
          {!hasText && !imgError && (
            <TimeOverlay
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
            />
          )}
        </div>
        {/* A broken image shows a fallback tile — the overlay would be unreadable
            on it, so the timestamp moves below instead of disappearing. */}
        {!hasText && imgError && (
          <div className="px-3.5 pb-1">
            <BubbleTimestamp
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
              isEdited={isEdited}
            />
          </div>
        )}
      </>
    );
  }

  // ── Bubble content ──

  function renderBubbleContent() {
    // Deleted message → tombstone placeholder (WhatsApp-style)
    if (message.isDeleted) {
      return (
        <div
          className={cn(
            "overflow-hidden rounded-2xl",
            isSender
              ? "rounded-tr-[4px] bubble-sent"
              : "rounded-tl-[4px] bubble-recv"
          )}
        >
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <Ban
              className={cn(
                "h-4 w-4 shrink-0",
                isSender ? "text-white/60" : "text-muted-foreground/60"
              )}
            />
            <span
              className={cn(
                "text-[13.5px] italic",
                isSender ? "text-white/70" : "text-muted-foreground/70"
              )}
            >
              {isSender
                ? "You deleted this message"
                : "This message was deleted"}
            </span>
            <BubbleTimestamp
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
            />
          </div>
        </div>
      );
    }

    const forwardedLabel = message.forwardFromMessageId && (
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1 text-[10.5px] italic",
          isSender ? "text-white/55" : "text-muted-foreground/50"
        )}
      >
        <Forward className="h-3 w-3" />
        Forwarded
      </div>
    );

    const replyPreview = message.replyToMessageId && (
      <ReplyPreview
      message={message}
        replyMsg={message.replyMessage}
        replyText={message.replyToMessageText}
        isSender={isSender}
        replyToMessageId={message.replyToMessageId}
        onScrollToMessage={onScrollToMessage}
      />
    );

    // Standalone image (no reply, image not broken)
    if (isStandaloneImage && !message.forwardFromMessageId && mediaPath) {
      return (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl [.dark_&]:shadow-none!",
            isSender ? "rounded-tr-[4px]" : "rounded-tl-[4px]",
            isSelected && "ring-2 ring-primary/40",
            isSelectionMode && "cursor-pointer"
          )}
          style={isSender ? { boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary) 20%, transparent)' } : { boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
          onClick={isSelectionMode ? () => onSelect(message) : undefined}
        >
          {renderImage(mediaPath)}
          <TimeOverlay
            time={message.created}
            isSender={isSender}
            isReadByAll={message.isReadByAll}
          />
        </div>
      );
    }

    // Forwarded standalone image
    if (isStandaloneImage && message.forwardFromMessageId && mediaPath) {
      return (
        <div
          className={cn(
            "overflow-hidden rounded-2xl",
            isSender
              ? "rounded-tr-[4px] bubble-sent"
              : "rounded-tl-[4px] bubble-recv",
            isSelected && "ring-2 ring-primary/40",
            isSelectionMode && "cursor-pointer"
          )}
          onClick={isSelectionMode ? () => onSelect(message) : undefined}
        >
          <div className="px-3.5 pb-0 pt-[9px]">{forwardedLabel}</div>
          <div className="relative m-[5px] overflow-hidden rounded-xl">
            {renderImage(mediaPath)}
            <TimeOverlay
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
            />
          </div>
        </div>
      );
    }

    // Emoji-only message — no bubble background, large emoji
    const emojiOnly =
      !hasMedia &&
      hasText &&
      !message.forwardFromMessageId &&
      !message.replyToMessageId &&
      isEmojiOnly(bodyText);

    if (emojiOnly) {
      return (
        <div
          className={cn(isSelected && "ring-2 ring-primary/40 rounded-2xl", isSelectionMode && "cursor-pointer")}
          onClick={isSelectionMode ? () => onSelect(message) : undefined}
        >
          <span className="text-[2.5rem] leading-none">{bodyText}</span>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} noBubble />
          </div>
        </div>
      );
    }

    // Glass bubble for everything else. Media and text are independent halves:
    // a media message can carry a caption, so both are rendered when present.
    // A captioned media bubble is as wide as its media, never as wide as its
    // caption — a long caption wraps inside the media width instead of leaving
    // the tiles floating in an over-wide bubble. `min-w` keeps the caption
    // readable under narrow media (portrait tile, broken-image fallback).
    const captionedMedia = hasMedia && hasText;

    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl",
          isSender
            ? "rounded-tr-[4px] bubble-sent"
            : "rounded-tl-[4px] bubble-recv",
          captionedMedia && "min-w-[250px]", // the portrait box + its 5px margins
          // With cards below, the bubble is sized by the CARD column, not by
          // the link text: 330px card + 2×14px padding. Without this the long
          // URLs push the bubble out to the column's full 55% and the capped
          // cards leave dead space to their right.
          hasLinkPreviews && !hasMedia && "max-w-[358px]",
          isSelected && "ring-2 ring-primary/40",
          isSelectionMode && "cursor-pointer"
        )}
        onClick={isSelectionMode ? () => onSelect(message) : undefined}
      >
        {replyPreview}

        {message.forwardFromMessageId && (
          <div className="px-3.5 pb-0 pt-[9px]">{forwardedLabel}</div>
        )}

        {renderMediaSection()}

        {/* `w-0 min-w-full` keeps the caption from widening the bubble: it
            contributes no intrinsic width, then fills whatever the media set. */}
        {hasText &&
          (captionedMedia ? (
            <div className="w-0 min-w-full">{renderTextBlock(bodyText)}</div>
          ) : (
            renderTextBlock(bodyText)
          ))}

        {/* Nothing to show but a timestamp (shouldn't happen — defensive). */}
        {!hasText && !hasMedia && (
          <div className="px-3.5 pt-[9px] pb-1">
            <BubbleTimestamp
              time={message.created}
              isSender={isSender}
              isReadByAll={message.isReadByAll}
              isEdited={isEdited}
            />
          </div>
        )}
      </div>
    );
  }

  const isEdited = message.isEdited === true || (message.updated && message.updated !== message.created);

  // ── Main render ──

  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        isSender && "flex-row-reverse"
      )}
    >
      {/* Avatar or spacer (received only) */}
      {!isSender &&
        (showSenderInfo ? (
          <div className="mt-0.5 shrink-0">
            <UserAvatar
              src={message.senderProfile}
              name={message.senderName}
              size="default"
            />
          </div>
        ) : (
          <div className="w-8 shrink-0" />
        ))}

      {/* Selection checkbox */}
      {isSelectionMode && !message.isDeleted && (
        <div className="mt-2 shrink-0">
          <SelectionCheckbox
            isSelected={isSelected}
            onClick={() => onSelect(message)}
          />
        </div>
      )}

      {/* Bubble column — only this part triggers the context menu */}
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={isSelectionMode || message.isDeleted}>
          <div className="group relative min-w-0 max-w-[55%]">
            {/* Bubble + sender name — w-fit so only bubble content sets width */}
            <div className={cn(
              "w-fit min-w-0",
              isSender && "ml-auto"
            )}>
              {/* Sender name */}
              {showSenderInfo && !isSender && (
                <p className="mb-0.75 pl-1 text-[11.5px] font-bold tracking-wide text-primary">
                  {message.senderName}
                </p>
              )}

              {/* Bubble wrapper */}
              <div className="relative">
                {renderBubbleContent()}

                {/* Add reaction button at bottom corner — show on hover OR when bar is open */}
                {!message.reactions?.length && !isSelectionMode && !message.isDeleted && (
                  <div className={cn(
                    "absolute -bottom-2.5 z-[2] opacity-0 transition-opacity group-hover:opacity-100",
                    reactionBarOpen && "opacity-100",
                    isSender ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
                  )}>
                    <QuickReactionsBar
                      isSender={isSender}
                      onQuickReaction={(emoji) => onToggleReaction(message.messageId, emoji)}
                      onFullEmojiSelect={(emoji) => onToggleReaction(message.messageId, emoji)}
                      onOpenChange={setReactionBarOpen}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Reactions row — outside w-fit so it doesn't expand the bubble */}
            {message.reactions?.length > 0 && !message.isDeleted && (
              <div className={cn(
                "flex flex-wrap items-center gap-1 mt-0.5",
                isSender ? "justify-end mr-1" : "ml-1"
              )}>
                <MessageReactions
                  reactions={message.reactions}
                  isSender={isSender}
                  currentUserId={chatuserId}
                  onReactionClick={(emoji) => onToggleReaction(message.messageId, emoji)}
                  onShowDetails={() => setReactionDetailOpen(true)}
                />
                {!isSelectionMode && (
                  <QuickReactionsBar
                    isSender={isSender}
                    onQuickReaction={(emoji) => onToggleReaction(message.messageId, emoji)}
                    onFullEmojiSelect={(emoji) => onToggleReaction(message.messageId, emoji)}
                  />
                )}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>

      {/* Reaction details dialog */}
      <ReactionDetailsDialog
        open={reactionDetailOpen}
        onOpenChange={setReactionDetailOpen}
        reactions={message.reactions || []}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (message.messageId) onDelete(message.messageId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── React.memo ──

function areEqual(
  prev: MessageBubbleProps,
  next: MessageBubbleProps
): boolean {
  return (
    prev.message.messageId === next.message.messageId &&
    prev.message.messageText === next.message.messageText &&
    prev.message.updated === next.message.updated &&
    prev.message.isReadByAll === next.message.isReadByAll &&
    prev.message.mediaPath === next.message.mediaPath &&
    prev.message.mediaName === next.message.mediaName &&
    // Album items are patched in place by `mediaConverted`, so compare the
    // array identity too or a converted attachment never repaints.
    prev.message.mediaItems === next.message.mediaItems &&
    prev.message.unread === next.message.unread &&
    prev.isSender === next.isSender &&
    prev.isSelected === next.isSelected &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.showSenderInfo === next.showSenderInfo &&
    prev.message.reactions === next.message.reactions &&
    prev.message.isPinned === next.message.isPinned &&
    prev.message.isDeleted === next.message.isDeleted
  );
}

export default React.memo(MessageBubble, areEqual);
