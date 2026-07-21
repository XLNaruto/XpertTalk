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
import { QuickReactionsBar } from "@/components/chat/quick-reactions-bar";
import { MessageReactions } from "@/components/chat/message-reactions";
import { ReactionDetailsDialog } from "@/components/modals/reaction-details-dialog";
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
  onMediaClick: (mediaPath: string, mediaType: "image" | "video") => void;
  onScrollToMessage?: (messageId: string) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  onTogglePin: (messageId: string) => void;
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
}: {
  time: string;
  isSender: boolean;
  isReadByAll?: boolean;
  isEdited?: boolean;
  noBubble?: boolean;
}) {
  return (
    <span
      className={cn(
        "float-right ml-2 my-1 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium leading-none",
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
  const formattedReplyText = formatPreview(
    replyText || replyMsg.messageText || ""
  );

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
          {replyMsg.messageType === "TEXT" ? (
            <span dangerouslySetInnerHTML={{ __html: formattedReplyText }} />
          ) : replyMsg.messageType === "IMAGE"
              ? "Photo"
              : replyMsg.messageType === "VIDEO"
                ? "Video"
                : replyMsg.mediaName || "Document"}
        </p>
      </div>
      {isMediaReply && replyMsg.mediaPath && (
        <div className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-lg">
          {replyMsg.messageType === "IMAGE" ? (
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
}) => {
  const [imgError, setImgError] = useState(false);
  // Orientation of the standalone image, measured on load. Landscape images
  // render as a full-width rectangle at natural aspect; portrait/square images
  // render inside a fixed square box with a color fill.
  const [imgOrientation, setImgOrientation] = useState<"portrait" | "landscape" | null>(null);
  const [vidOrientation, setVidOrientation] = useState<"portrait" | "landscape" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reactionDetailOpen, setReactionDetailOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const chatuserId = getEncodedCookie("chatuserId") || "";

  const hasMedia =
    message.messageType !== "TEXT" ||
    (message?.forwardMessage &&
      message?.forwardMessage?.messageType !== "TEXT");

  const effectiveType = message.forwardFromMessageId
    ? message?.forwardMessage?.messageType || "TEXT"
    : message.messageType;

  const isStandaloneImage =
    effectiveType === "IMAGE" && !message.replyToMessageId && !imgError;

  const handleDownload = async () => {
    const url = message.forwardFromMessageId
      ? message?.forwardMessage?.mediaPath
      : message.mediaPath;
    const fileName = message.forwardFromMessageId
      ? message?.forwardMessage?.mediaName
      : message.mediaName || "document";
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleCopy = () => {
    const text = message.forwardFromMessageId
      ? message.forwardedMessageText
      : message.messageText;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleCopyImage = async () => {
    const url = message.forwardFromMessageId
      ? message?.forwardMessage?.mediaPath
      : message.mediaPath;
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
      {message.messageType === "TEXT" && (
        <>
          <ContextMenuItem
            onClick={handleCopy}
            className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          >
            <Copy className="h-4 w-4" /> Copy
          </ContextMenuItem>
          {isSender && !message.forwardFromMessageId && isWithin24Hours && (
            <ContextMenuItem
              onClick={() => onEdit(message)}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Pencil className="h-4 w-4" /> Edit
            </ContextMenuItem>
          )}
        </>
      )}
      {effectiveType === "IMAGE" && (
        <ContextMenuItem
          onClick={handleCopyImage}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Copy className="h-4 w-4" /> Copy
        </ContextMenuItem>
      )}
      {hasMedia && (
        <ContextMenuItem
          onClick={handleDownload}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <Download className="h-4 w-4" /> Download
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
    const isLandscape = imgOrientation === "landscape";
    return (
      <div
        className={cn(
          "relative cursor-pointer overflow-hidden",
          isLandscape
            ? // Landscape: full-width rectangle at natural aspect ratio
              "max-w-[360px]"
            : // Portrait / square: fixed square box with color fill
              "flex h-[200px] w-[200px] items-center justify-center bg-black/15 [.dark_&]:bg-white/5"
        )}
        onClick={() => onMediaClick(path, "image")}
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
              setImgOrientation(
                img.naturalWidth > img.naturalHeight ? "landscape" : "portrait"
              );
            }
          }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  function renderVideo(path: string) {
    const isLandscape = vidOrientation === "landscape";
    return (
      <div
        className={cn(
          "group/vid relative cursor-pointer overflow-hidden rounded-xl",
          isLandscape
            ? // Landscape: full-width rectangle at natural aspect ratio
              "max-w-[360px]"
            : // Portrait / square: fixed square box with color fill
              "flex h-[200px] w-[200px] items-center justify-center bg-black/15 [.dark_&]:bg-white/5"
        )}
        onClick={() => onMediaClick(path, "video")}
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
              setVidOrientation(
                vid.videoWidth > vid.videoHeight ? "landscape" : "portrait"
              );
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
        className={cn(
          "flex max-w-70 items-center gap-3 rounded-xl px-3 py-2.5",
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

  // ── Media props ──

  const mediaPath = message.forwardFromMessageId
    ? message?.forwardMessage?.mediaPath
    : message.mediaPath;
  const mediaName = message.forwardFromMessageId
    ? message?.forwardMessage?.mediaName
    : message.mediaName;

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
            isSelected && "ring-2 ring-primary/40"
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
            isSelected && "ring-2 ring-primary/40"
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
      message.messageType === "TEXT" &&
      !message.forwardFromMessageId &&
      !message.replyToMessageId &&
      isEmojiOnly(message.messageText);

    if (emojiOnly) {
      return (
        <div
          className={cn(isSelected && "ring-2 ring-primary/40 rounded-2xl")}
          onClick={isSelectionMode ? () => onSelect(message) : undefined}
        >
          <span className="text-[2.5rem] leading-none">{message.messageText}</span>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} noBubble />
          </div>
        </div>
      );
    }

    // Glass bubble for everything else
    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl",
          isSender
            ? "rounded-tr-[4px] bubble-sent"
            : "rounded-tl-[4px] bubble-recv",
          isSelected && "ring-2 ring-primary/40"
        )}
        onClick={isSelectionMode ? () => onSelect(message) : undefined}
      >
        {replyPreview}

        {message.forwardFromMessageId ? (
          <>
            <div className="px-3.5 pb-0 pt-[9px]">{forwardedLabel}</div>
            {effectiveType === "TEXT" ? (
              <div className="px-3.5 pt-[9px] pb-1">
                <div
                  className="text-[14px] leading-[1.55] wrap-break-word"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{
                    __html: formatMessage(message.forwardedMessageText),
                  }}
                />
                <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} />
              </div>
            ) : effectiveType === "VIDEO" && mediaPath ? (
              <div className="relative m-[5px]">
                {renderVideo(mediaPath)}
                <TimeOverlay
                  time={message.created}
                  isSender={isSender}
                  isReadByAll={message.isReadByAll}
                />
              </div>
            ) : effectiveType === "DOCUMENT" ? (
              <div className="px-3.5 pt-[9px] pb-1">
                {renderDocument(mediaName)}
                <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} />
              </div>
            ) : mediaPath ? (
              <div className="relative m-[5px] overflow-hidden rounded-xl">
                {renderImage(mediaPath)}
                <TimeOverlay
                  time={message.created}
                  isSender={isSender}
                  isReadByAll={message.isReadByAll}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            {message.messageType === "TEXT" && (
              <div className="px-3.5 pt-[9px] pb-1">
                <div
                  className="text-[14px] leading-[1.55] wrap-break-word"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{
                    __html: formatMessage(message.messageText),
                  }}
                />
                <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} />
              </div>
            )}

            {message.messageType === "VIDEO" && mediaPath && (
              <div className="relative m-[5px]">
                {renderVideo(mediaPath)}
                <TimeOverlay
                  time={message.created}
                  isSender={isSender}
                  isReadByAll={message.isReadByAll}
                />
              </div>
            )}

            {message.messageType === "IMAGE" &&
              (message.replyToMessageId || imgError) &&
              mediaPath && (
                <div className="relative m-[5px] overflow-hidden rounded-xl">
                  {renderImage(mediaPath)}
                  {!imgError && (
                    <TimeOverlay
                      time={message.created}
                      isSender={isSender}
                      isReadByAll={message.isReadByAll}
                    />
                  )}
                </div>
              )}

            {message.messageType === "DOCUMENT" && (
              <div className="px-3.5 pt-[9px] pb-1">
                {renderDocument(mediaName)}
                <BubbleTimestamp time={message.created} isSender={isSender} isReadByAll={message.isReadByAll} isEdited={isEdited} />
              </div>
            )}
          </>
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
