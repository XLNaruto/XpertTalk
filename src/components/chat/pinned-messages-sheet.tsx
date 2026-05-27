import { useCallback, useEffect, useState } from "react";
import { Pin, FileText, Image, Video, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { apiHeader, getData } from "@/lib/api-helper";
import { getEncodedCookie } from "@/lib/encryption";
import { formatPreview } from "@/lib/message-formatters";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import logger from "@/lib/logger";

interface PinnedMessagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talkId: string;
  onMessageClick: (messageId: string) => void;
}

export function PinnedMessagesSheet({
  open,
  onOpenChange,
  talkId,
  onMessageClick,
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

  const handleMessageClick = (messageId: string) => {
    onOpenChange(false);
    setTimeout(() => onMessageClick(messageId), 300);
  };

  const getEffectiveType = (msg: any) => {
    if (msg.forwardFromMessageId && msg.forwardMessage) {
      return msg.forwardMessage.messageType || msg.messageType;
    }
    return msg.messageType;
  };

  const getMessagePreview = (msg: any) => {
    const type = getEffectiveType(msg);
    if (type === "IMAGE") {
      const name = msg.forwardFromMessageId
        ? msg.forwardMessage?.mediaName
        : msg.mediaName;
      return name || "Photo";
    }
    if (type === "VIDEO") return "Video";
    if (type === "DOCUMENT") {
      const name = msg.forwardFromMessageId
        ? msg.forwardMessage?.mediaName
        : msg.mediaName;
      return name || "Document";
    }
    // For text: use forwarded text if it's a forwarded message
    if (msg.forwardFromMessageId) {
      return msg.forwardedMessageText || msg.forwardMessage?.messageText || "";
    }
    return msg.messageText || "";
  };

  const getMessageIcon = (msg: any) => {
    const type = getEffectiveType(msg);
    if (type === "IMAGE")
      return <Image className="h-4 w-4 text-primary/60" />;
    if (type === "VIDEO")
      return <Video className="h-4 w-4 text-primary/60" />;
    if (type === "DOCUMENT")
      return <FileText className="h-4 w-4 text-primary/60" />;
    return null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-105 flex-col gap-0 overflow-hidden p-0 sm:max-w-105">
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
            <div className="py-2">
              {messages.map((msg) => (
                <button
                  key={msg.messageId}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                  onClick={() => handleMessageClick(msg.messageId)}
                >
                  <UserAvatar
                    src={msg.senderProfile}
                    name={msg.senderName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-semibold text-primary">
                        {String(msg.senderChatuserId) === String(chatuserId) ? "You" : msg.senderName}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {format(new Date(msg.pinnedAt || msg.created), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {getMessageIcon(msg)}
                      <p
                        className={cn(
                          "truncate text-[13px] leading-snug",
                          msg.messageType === "TEXT"
                            ? "text-foreground/80"
                            : "text-muted-foreground"
                        )}
                        dangerouslySetInnerHTML={{
                          __html: formatPreview(getMessagePreview(msg)),
                        }}
                      />
                    </div>
                  </div>
                </button>
              ))}

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
