import React, { useState } from "react";
import {
  Reply,
  Forward,
  SquareCheck,
  Trash2,
  Check,
  CheckCheck,
  SmilePlus,
  Play,
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
import { formatMessage } from "@/lib/message-formatters";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getEncodedCookie } from "@/lib/encryption";
import { QuickReactionsBar } from "@/components/chat/quick-reactions-bar";
import { MessageReactions } from "@/components/chat/message-reactions";
import { ReactionDetailsDialog } from "@/components/modals/reaction-details-dialog";

// ── Props ──
// A "reply all" group is a burst of identical reply messages, each replying to
// one item of a media grid. We collapse them into ONE bubble: the typed text is
// shown once, and the replied-to media are shown together in a grid preview.

interface ReplyAllBubbleProps {
  messages: any[];
  isSender: boolean;
  showSenderInfo: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onReply: (message: any) => void;
  onForward: (message: any) => void;
  onDeleteAll: (messageIds: string[]) => void;
  onSelectMultiple: (messages: any[]) => void;
  onEnterSelectionModeMultiple: (messages: any[]) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  onScrollToMessage?: (messageId: string) => void;
}

// ── Grid of replied-to media (mini preview inside the reply chip) ──

function ReplyMediaGrid({
  items,
  onThumbClick,
}: {
  items: any[];
  onThumbClick: (replyToMessageId: string) => void;
}) {
  const visible = items.slice(0, 4);
  const extra = items.length - 4;
  const total = items.length;

  return (
    <div
      className={cn(
        "grid gap-[2px] overflow-hidden rounded-lg",
        total === 1 ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {visible.map((it: any, idx: number) => {
        const span = total === 3 && idx === 0;
        const showOverlay = idx === 3 && extra > 0;
        const media = it.replyMessage;
        return (
          <div
            key={it.messageId}
            className={cn(
              "relative h-[64px] cursor-pointer overflow-hidden bg-black/5 dark:bg-white/5",
              span && "col-span-2",
              total === 1 && "h-[120px]"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (it.replyToMessageId) onThumbClick(it.replyToMessageId);
            }}
          >
            {media?.messageType === "VIDEO" ? (
              <>
                <video
                  src={media.mediaPath}
                  muted
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm">
                  <Play className="ml-0.5 h-3 w-3 fill-white text-white" />
                </div>
              </>
            ) : (
              <img
                src={media?.mediaPath}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            )}
            {showOverlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-lg font-bold text-white">+{extra}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──

const ReplyAllBubble: React.FC<ReplyAllBubbleProps> = ({
  messages,
  isSender,
  showSenderInfo,
  isSelected,
  isSelectionMode,
  onReply,
  onForward,
  onDeleteAll,
  onSelectMultiple,
  onEnterSelectionModeMultiple,
  onToggleReaction,
  onScrollToMessage,
}) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reactionDetailOpen, setReactionDetailOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const chatuserId = getEncodedCookie("chatuserId") || "";

  const first = messages[0];
  const last = messages[messages.length - 1];
  const senderName = first.replyMessage?.senderName || first.senderName;
  const isReadByAll = messages.every((m) => m.isReadByAll);

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
                src={first.senderProfile}
                name={first.senderName}
                size="default"
              />
            </div>
          ) : (
            <div className="w-8 shrink-0" />
          ))}

        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className="mt-2 shrink-0">
            <button
              onClick={() => onSelectMultiple(messages)}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                isSelected
                  ? "border-primary bg-primary text-white glow-ring"
                  : "border-muted-foreground/30 bg-transparent"
              )}
            >
              {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
          </div>
        )}

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
              {/* Sender name (received) */}
              {!isSender && showSenderInfo && (
                <p className="mb-0.75 pl-1 text-[11.5px] font-bold tracking-wide text-primary">
                  {first.senderName}
                </p>
              )}

              <div className="relative">
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl",
                    isSender
                      ? "rounded-tr-[6px] bubble-sent"
                      : "rounded-tl-[6px] bubble-recv",
                    isSelected && "ring-2 ring-primary/40"
                  )}
                  onClick={
                    isSelectionMode ? () => onSelectMultiple(messages) : undefined
                  }
                >
                  {/* Grid reply preview — all replied-to media together */}
                  <div
                    className={cn(
                      "mx-[5px] mt-[5px] overflow-hidden rounded-xl border-l-[3px] px-2 py-[6px]",
                      isSender
                        ? "border-white/50 bg-white/20"
                        : "border-primary/50 bg-primary/5 dark:bg-primary/10"
                    )}
                  >
                    <p
                      className={cn(
                        "mb-1 px-1 text-[11px] font-semibold",
                        isSender ? "text-white/90" : "text-primary"
                      )}
                    >
                      {senderName}
                    </p>
                    <ReplyMediaGrid
                      items={messages}
                      onThumbClick={(id) => onScrollToMessage?.(id)}
                    />
                  </div>

                  {/* The typed reply — shown once */}
                  <div className="px-3.5 pt-[7px] pb-1">
                    <div
                      className="text-[14px] leading-[1.55] wrap-break-word"
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: formatMessage(first.messageText),
                      }}
                    />
                    <span
                      className={cn(
                        "float-right ml-2 my-1 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium leading-none",
                        isSender ? "text-white/70" : "text-muted-foreground/70"
                      )}
                    >
                      {format(new Date(last.created), "h:mm a")}
                      {isSender &&
                        (isReadByAll ? (
                          <CheckCheck className="h-3 w-3 text-white" />
                        ) : (
                          <Check className="h-3 w-3 opacity-50" />
                        ))}
                    </span>
                  </div>
                </div>

                {/* Hover add-reaction button (when no reactions on first msg) */}
                {!first.reactions?.length &&
                  (isHovered || reactionBarOpen) &&
                  !isSelectionMode && (
                    <div
                      className={cn(
                        "absolute -bottom-2.5 z-[2]",
                        isSender
                          ? "left-0 -translate-x-1/2"
                          : "right-0 translate-x-1/2"
                      )}
                    >
                      <QuickReactionsBar
                        isSender={isSender}
                        onQuickReaction={(emoji) =>
                          onToggleReaction(first.messageId, emoji)
                        }
                        onFullEmojiSelect={(emoji) =>
                          onToggleReaction(first.messageId, emoji)
                        }
                        onOpenChange={setReactionBarOpen}
                      />
                    </div>
                  )}
              </div>

              {/* Reactions row */}
              {first.reactions?.length > 0 && (
                <div
                  className={cn(
                    "relative flex items-center gap-1 mt-0.5",
                    isSender ? "justify-end mr-1" : "ml-1"
                  )}
                >
                  <MessageReactions
                    reactions={first.reactions}
                    isSender={isSender}
                    currentUserId={chatuserId}
                    onReactionClick={(emoji) =>
                      onToggleReaction(first.messageId, emoji)
                    }
                    onShowDetails={() => setReactionDetailOpen(true)}
                  />
                  {!isSelectionMode && (
                    <QuickReactionsBar
                      isSender={isSender}
                      onQuickReaction={(emoji) =>
                        onToggleReaction(first.messageId, emoji)
                      }
                      onFullEmojiSelect={(emoji) =>
                        onToggleReaction(first.messageId, emoji)
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="min-w-[160px] rounded-xl border-border/50 bg-popover p-1.5 shadow-xl">
            <ContextMenuItem
              onClick={() => onReply(first)}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Reply className="h-4 w-4" /> Reply
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onForward(first)}
              className="gap-2 rounded-lg px-2.5 py-2 text-sm"
            >
              <Forward className="h-4 w-4" /> Forward
            </ContextMenuItem>
            {!isSelectionMode && (
              <ContextMenuItem
                onClick={() => onEnterSelectionModeMultiple(messages)}
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
              >
                <SquareCheck className="h-4 w-4" /> Select
              </ContextMenuItem>
            )}
            {first.reactions?.length > 0 && (
              <ContextMenuItem
                onClick={() => setReactionDetailOpen(true)}
                className="gap-2 rounded-lg px-2.5 py-2 text-sm"
              >
                <SmilePlus className="h-4 w-4" /> View Reactions
              </ContextMenuItem>
            )}
            {isSender && (
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
        reactions={first.reactions || []}
      />

      {/* Delete All confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all replies?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {messages.length} reply messages in this
              group. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteAll(messages.map((m) => m.messageId));
                setDeleteConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default React.memo(ReplyAllBubble);
