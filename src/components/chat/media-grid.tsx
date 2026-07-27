import React, { useState } from "react";
import {
  Play,
  Check,
  CheckCheck,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Download,
  SquareCheck,
  SmilePlus,
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getEncodedCookie } from "@/lib/encryption";
import { QuickReactionsBar } from "@/components/chat/quick-reactions-bar";
import { MessageReactions } from "@/components/chat/message-reactions";
import { ReactionDetailsDialog } from "@/components/modals/reaction-details-dialog";
import { isConvertingMedia } from "@/lib/media-convert";
import { ConvertingMedia } from "@/components/chat/converting-media";

interface MediaGridProps {
  messages: any[];
  isSender: boolean;
  showSenderInfo: boolean;
  senderName?: string;
  senderProfile?: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onMediaClick: (mediaPath: string, mediaType: "image" | "video") => void;
  onReply: (message: any) => void;
  onReplyAll: (messages: any[]) => void;
  onSelect: (message: any) => void;
  onSelectMultiple: (messages: any[]) => void;
  onEnterSelectionMode: (message: any) => void;
  onEnterSelectionModeMultiple: (messages: any[]) => void;
  onForwardMultiple: (messages: any[]) => void;
  onDeleteAll: (messageIds: string[]) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
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

function MediaGrid({
  messages,
  isSender,
  showSenderInfo,
  senderName,
  senderProfile,
  isSelectionMode,
  isSelected,
  onMediaClick,
  onReply,
  onReplyAll,
  onSelectMultiple,
  onEnterSelectionMode: _onEnterSelectionMode,
  onEnterSelectionModeMultiple,
  onForwardMultiple,
  onDeleteAll,
  onToggleReaction,
}: MediaGridProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reactionDetailOpen, setReactionDetailOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const chatuserId = getEncodedCookie("chatuserId") || "";

  const visibleItems = messages.slice(0, 4);
  const extraCount = messages.length - 4;
  const lastMessage = messages[messages.length - 1];
  const total = messages.length;

  const handleDeleteAll = () => {
    onDeleteAll(messages.map((m) => m.messageId));
    setDeleteConfirmOpen(false);
  };

  // Hide Delete All once any message in the group is older than 24 hours.
  // Admins are exempt (same rule as the message bubble context menu).
  const isAdmin = (import.meta.env.VITE_APP_USER || "employee") === "admin";
  const canDeleteAll =
    isAdmin ||
    messages.every(
      (m: any) =>
        Date.now() - new Date(m.created).getTime() < 24 * 60 * 60 * 1000
    );

  // Determine cell sizing based on count
  function getCellClass(idx: number) {
    if (total === 1) return "aspect-square w-[200px]";
    // The first tile of a 3-item group is a full-width banner
    if (total === 3 && idx === 0) return "h-[150px] w-full";
    // All other tiles are proper squares
    return "aspect-square w-full";
  }

  // Determine if cell should span 2 columns
  function shouldSpan(idx: number) {
    if (total === 1) return true;
    if (total === 3 && idx === 0) return true;
    return false;
  }

  const gridContent = (
    <div
      className={cn(
        "relative w-[300px] max-w-full overflow-hidden rounded-2xl [.dark_&]:shadow-none!",
        isSender ? "rounded-tr-[4px]" : "rounded-tl-[4px]",
        isSelected && "ring-2 ring-primary/40"
      )}
      style={
        isSender
          ? { boxShadow: "0 2px 12px color-mix(in srgb, var(--color-primary) 20%, transparent)" }
          : { boxShadow: "0 2px 10px rgba(0,0,0,0.15)" }
      }
      onClick={isSelectionMode ? () => onSelectMultiple(messages) : undefined}
    >
      <div
        className={cn(
          "grid gap-[2px]",
          total === 1 ? "grid-cols-1" : "grid-cols-2"
        )}
      >
        {visibleItems.map((msg: any, idx: number) => {
          const showCountOverlay = idx === 3 && extraCount > 0;
          const span = shouldSpan(idx);
          const cellClass = getCellClass(idx);
          // HEIC/HEIF still being converted to PNG server-side — nothing to
          // paint or open yet, so show the loader and swallow the click.
          const converting = isConvertingMedia(msg.mediaPath);

          return (
            <div
              key={msg.messageId}
              className={cn(
                "relative overflow-hidden bg-black/15 [.dark_&]:bg-white/5",
                !converting && "cursor-pointer",
                cellClass,
                span && "col-span-2"
              )}
              onClick={
                !isSelectionMode && !converting
                  ? () =>
                      onMediaClick(
                        msg.mediaPath,
                        msg.messageType === "VIDEO" ? "video" : "image"
                      )
                  : undefined
              }
            >
              {converting ? (
                <ConvertingMedia className="h-full w-full" />
              ) : msg.messageType === "VIDEO" ? (
                <>
                  <video
                    src={msg.mediaPath}
                    muted
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                  <div
                    className="absolute left-1/2 top-1/2 z-[2] flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm transition-transform hover:scale-110"
                  >
                    <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
                  </div>
                </>
              ) : (
                <img
                  src={msg.mediaPath}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              )}

              {/* +N overlay on the 4th item */}
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

      {/* Time overlay */}
      <div
        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg px-2 py-[3px]"
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span className="text-[10px] font-medium text-white/90">
          {format(new Date(lastMessage.created), "h:mm a")}
        </span>
        {isSender &&
          (lastMessage.isReadByAll ? (
            <CheckCheck className="h-3.5 w-3.5 text-[var(--chat-check-read)]" />
          ) : (
            <Check className="h-3.5 w-3.5 text-white/50" />
          ))}
      </div>
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-2.5",
          isSender && "flex-row-reverse"
        )}
      >
        {/* Avatar for received messages */}
        {!isSender &&
          (showSenderInfo ? (
            <div className="mt-0.5 shrink-0">
              <UserAvatar
                src={senderProfile}
                name={senderName}
                size="default"
              />
            </div>
          ) : (
            <div className="w-8 shrink-0" />
          ))}

        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className="mt-2 shrink-0">
            <SelectionCheckbox
              isSelected={isSelected}
              onClick={() => onSelectMultiple(messages)}
            />
          </div>
        )}

        {/* Grid bubble with context menu */}
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={isSelectionMode}>
            <div
              className={cn(
                "group relative min-w-0 max-w-[55%]",
                isSender && "flex flex-col items-end"
              )}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {/* Sender name */}
              {showSenderInfo && !isSender && senderName && (
                <p className="mb-0.75 pl-1 text-[11.5px] font-bold tracking-wide text-primary">
                  {senderName}
                </p>
              )}
              <div className="relative">
                {gridContent}

                {/* Hover-only add reaction button (when no reactions on first msg) */}
                {!messages[0]?.reactions?.length && (isHovered || reactionBarOpen) && !isSelectionMode && (
                  <div className={cn(
                    "absolute -bottom-2.5 z-[2]",
                    isSender ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
                  )}>
                    <QuickReactionsBar
                      isSender={isSender}
                      onQuickReaction={(emoji) => onToggleReaction(messages[0].messageId, emoji)}
                      onFullEmojiSelect={(emoji) => onToggleReaction(messages[0].messageId, emoji)}
                      onOpenChange={setReactionBarOpen}
                    />
                  </div>
                )}
              </div>

              {/* Reactions row (when first message has reactions) */}
              {messages[0]?.reactions?.length > 0 && (
                <div className={cn(
                  "relative flex items-center gap-1 mt-0.5",
                  isSender ? "justify-end mr-1" : "ml-1"
                )}>
                  <MessageReactions
                    reactions={messages[0].reactions}
                    isSender={isSender}
                    currentUserId={chatuserId}
                    onReactionClick={(emoji) => onToggleReaction(messages[0].messageId, emoji)}
                    onShowDetails={() => setReactionDetailOpen(true)}
                  />
                  {!isSelectionMode && (
                    <QuickReactionsBar
                      isSender={isSender}
                      onQuickReaction={(emoji) => onToggleReaction(messages[0].messageId, emoji)}
                      onFullEmojiSelect={(emoji) => onToggleReaction(messages[0].messageId, emoji)}
                    />
                  )}
                </div>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="min-w-[160px] rounded-xl border-border/50 bg-popover p-1.5 shadow-xl">
            <ContextMenuItem
              onClick={() => onReply(messages[0])}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Reply className="h-4 w-4" /> Reply
            </ContextMenuItem>
            {messages.length > 1 && (
              <ContextMenuItem
                onClick={() => onReplyAll(messages)}
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
              >
                <ReplyAll className="h-4 w-4" /> Reply All
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onClick={() => onForwardMultiple(messages)}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Forward className="h-4 w-4" /> Forward
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                messages.forEach((msg: any) => {
                  if (msg.mediaPath) {
                    fetch(msg.mediaPath)
                      .then((res) => res.blob())
                      .then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = msg.mediaName || msg.mediaPath.split("/").pop() || "media";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      })
                      .catch(() => window.open(msg.mediaPath, "_blank"));
                  }
                });
              }}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Download className="h-4 w-4" /> Download All
            </ContextMenuItem>
            {!isSelectionMode && (
              <ContextMenuItem
                onClick={() => onEnterSelectionModeMultiple(messages)}
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
              >
                <SquareCheck className="h-4 w-4" /> Select
              </ContextMenuItem>
            )}
            {messages[0]?.reactions?.length > 0 && (
              <ContextMenuItem
                onClick={() => setReactionDetailOpen(true)}
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
              >
                <SmilePlus className="h-4 w-4" /> View Reactions
              </ContextMenuItem>
            )}
            {isSender && canDeleteAll && (
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete All
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {/* Reaction details dialog */}
      <ReactionDetailsDialog
        open={reactionDetailOpen}
        onOpenChange={setReactionDetailOpen}
        reactions={messages[0]?.reactions || []}
      />

      {/* Delete All confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all media?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {messages.length} media messages in this
              group. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default React.memo(MediaGrid);
