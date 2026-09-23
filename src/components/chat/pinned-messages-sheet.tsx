import { useCallback, useEffect, useState } from "react";
import { Pin, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { apiHeader, getData } from "@/lib/api-helper";
import { getEncodedCookie } from "@/lib/encryption";
import MessageBubble from "@/components/chat/message-bubble";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import logger from "@/lib/logger";

/**
 * Clicks the bubble itself owns — a link, a media tile, a document chip, a link
 * card, a poll row, any button. The row-level "jump to message" must not fire
 * on top of them. `.cursor-pointer` is the honest test: everything clickable in
 * a bubble carries it (the row's own class is excluded at the call site).
 *
 * Only used by the jump-to-message click, which is parked — see below.
 */
// const INTERACTIVE =
//   'a, button, video, [role="button"], .media-plate, .cursor-pointer';

interface PinnedMessagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talkId: string;
  /** Parked: the row-click jump is commented out for now. */
  onMessageClick: (messageId: string) => void;
  onReply: (message: any) => void;
  onEdit: (message: any) => void;
  onDelete: (messageId: string) => void;
  onForward: (message: any) => void;
  onEnterSelectionMode: (message: any) => void;
  onMediaClick: (
    mediaPath: string,
    mediaType: "image" | "video",
    messageId?: string,
    mediaId?: string
  ) => void;
  onTogglePin: (messageId: string) => void;
  onMarkUnread: (message: any) => void;
  onClosePoll: (messageId: string) => Promise<void>;
}

export function PinnedMessagesSheet({
  open,
  onOpenChange,
  talkId,
  // onMessageClick, — parked with the jump-to-message click below.
  onReply,
  onEdit,
  onDelete,
  onForward,
  onEnterSelectionMode,
  onMediaClick,
  onTogglePin,
  onMarkUnread,
  onClosePoll,
}: PinnedMessagesSheetProps) {
  const chatuserId = getEncodedCookie("chatuserId") || "";
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPinnedMessages = useCallback(
    async (cursor?: string) => {
      if (!talkId) return;
      setIsLoading(true);
      try {
        const body: any = { talkId, limit:10 };
        if (cursor) body.cursor = cursor;
        const response: any = await getData(
          "chat/message/pin/list",
          body,
          apiHeader(false, 0)
        );

        logger.debug("fetchPinnedMessages+++++++++++++",response)

        if (
          String(response?.status) === "200" &&
          String(response?.data.status) === "200"
        ) {
          const data = response.data.data;
          const newMessages = data.messages || [];
          setMessages((prev) =>
            cursor ? [...prev, ...newMessages] : newMessages
          );
          setNextCursor(data.nextCursor || null);
          setHasMore(!!data.nextCursor);
        }
      } catch {
        // Silent fail
      } finally {
        setIsLoading(false);
      }
    },
    [talkId]
  );

  // Fetch on open
  useEffect(() => {
    if (open && talkId) {
      setMessages([]);
      setNextCursor(null);
      setHasMore(true);
      fetchPinnedMessages();
    }
  }, [open, talkId, fetchPinnedMessages]);

  // Clicking a pinned row used to close the sheet and scroll the conversation
  // to that message. Parked for now — the rows are read here, not navigated
  // from. Restore this, the `INTERACTIVE` guard and the row handlers together.
  // const handleMessageClick = (messageId: string) => {
  //   onOpenChange(false);
  //   setTimeout(() => onMessageClick(messageId), 300);
  // };

  /**
   * Anything that hands the user back to the conversation — composing a reply,
   * an edit, a forward, the lightbox — closes the sheet first. The sheet is a
   * modal overlay: a lightbox opened underneath it would be unclickable.
   */
  const closeThen = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 300);
  };

  /** Drop a row whose message is no longer pinned (or no longer exists). */
  const dropMessage = (messageId: string) =>
    setMessages((prev) => prev.filter((m) => m.messageId !== messageId));

  const handleTogglePin = (messageId: string) => {
    // Every message here IS pinned, so this is always an unpin — take the row
    // out at once rather than leaving a pinned list showing unpinned messages.
    onTogglePin(messageId);
    dropMessage(messageId);
  };

  const handleDelete = (messageId: string) => {
    onDelete(messageId);
    dropMessage(messageId);
  };

  const handleClosePoll = async (messageId: string) => {
    await onClosePoll(messageId);
    // The sheet holds its own copy of the poll and gets no broadcasts, so the
    // closed state only shows up on a re-read.
    fetchPinnedMessages();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Wider than the other sheets: these are FULL bubbles — media, polls and
          link cards — not one-line previews. */}
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-140 sm:max-w-140">
        <SheetHeader className="border-b border-border/50 px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Pin className="h-4 w-4 text-primary" />
            Pinned Messages
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-auto">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Pin className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  No pinned messages
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pin important messages to find them easily
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-2">
              {messages.map((msg) => {
                const isSender =
                  String(msg.senderChatuserId) === String(chatuserId);
                return (
                  <div
                    key={msg.messageId}
                    className="px-3 py-2"
                    // Jump-to-message — parked, see `handleMessageClick`.
                    // role="button"
                    // tabIndex={0}
                    // onClick={(e) => {
                    //   // A click the bubble owns (link, media, poll row, menu
                    //   // item) is that element's — jumping too would fire both.
                    //   const hit = (e.target as HTMLElement).closest(INTERACTIVE);
                    //   if (hit && hit !== e.currentTarget) return;
                    //   handleMessageClick(msg.messageId);
                    // }}
                  >
                    {/* Sender and pin time share ONE row, above the bubble —
                        inside it they would widen a short bubble to fit. */}
                    <div
                      className={cn(
                        "mb-1 flex items-center gap-2.5",
                        isSender && "justify-end"
                      )}
                    >
                      {!isSender && (
                        <>
                          <UserAvatar
                            src={msg.senderProfile}
                            name={msg.senderName}
                            size="default"
                          />
                          <span className="min-w-0 truncate text-[11.5px] font-bold tracking-wide text-primary">
                            {msg.senderName}
                          </span>
                        </>
                      )}
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        Pinned{" "}
                        {format(
                          new Date(msg.pinnedAt || msg.created),
                          "MMM d, h:mm a"
                        )}
                      </span>
                    </div>

                    {/* `readOnly` keeps reading whole — links, lightbox,
                        downloads, the right-click menu — and only drops the
                        controls whose result this sheet could not show back
                        (reacting, voting), since it gets no live updates. */}
                    <MessageBubble
                        message={msg}
                        isSender={isSender}
                        showSenderInfo={false}
                        isSelected={false}
                        isSelectionMode={false}
                        readOnly
                        bubbleMaxWidthClass="max-w-[85%]"
                        onReply={(m) => closeThen(() => onReply(m))}
                        onEdit={(m) => closeThen(() => onEdit(m))}
                        onDelete={handleDelete}
                        onSelect={(m) => closeThen(() => onEnterSelectionMode(m))}
                        onEnterSelectionMode={(m) =>
                          closeThen(() => onEnterSelectionMode(m))
                        }
                        onForward={(m) => closeThen(() => onForward(m))}
                        onMediaClick={(path, type, messageId, mediaId) =>
                          closeThen(() =>
                            onMediaClick(path, type, messageId, mediaId)
                          )
                        }
                        // onScrollToMessage={handleMessageClick}
                        onToggleReaction={() => {}}
                        onTogglePin={handleTogglePin}
                        onMarkUnread={(m) => closeThen(() => onMarkUnread(m))}
                        onVotePoll={() => {}}
                        onClosePoll={handleClosePoll}
                      />
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && nextCursor && (
                <div className="flex justify-center py-3">
                  <button
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                    onClick={() => fetchPinnedMessages(nextCursor)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
