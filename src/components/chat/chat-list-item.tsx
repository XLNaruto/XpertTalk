import React, { useCallback, useEffect } from "react";
import { Ban, Forward, Pin, Trash2 } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo, formatPreview } from "@/lib/message-formatters";
import { cn } from "@/lib/utils";

function SenderMiniAvatar({ src, name }: { src?: string; name?: string }) {

  const [error, setError] = React.useState(false);
  const initial = (name || "?").charAt(0).toUpperCase();
  
  useEffect(()=>{
    setError(false);
  },[src])

  if (!src || error) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-5 w-5 shrink-0 rounded-full object-cover"
      onError={() =>{ 
        setError(true)}
      }
    />
  );
}

export interface ChatListItemProps {
  data: any;
  isActive: boolean;
  chatuserId: string;
  draft?: { message: string; attachments?: any[] };
  onSelect: (data: any) => void;
  onPin: (talkId: string, isPinned: boolean) => void;
  onDelete?: (talkId: string) => void;
}

const ChatListItemInner: React.FC<ChatListItemProps> = ({
  data,
  isActive,
  chatuserId,
  draft,
  onSelect,
  onPin,
  onDelete,
}) => {
  const isPrivate = data.talkType === "PRIVATE";
  const isGroup = data.talkType === "GROUP";
  const name = isPrivate ? data.receiverName : data.talkName;
  const profile = isPrivate ? data.receiverProfile : data.talkProfile;
  const isSelfLastMessage = data?.lastMessage?.senderChatuserId
    ? String(data.lastMessage.senderChatuserId) === String(chatuserId)
    : false;

  let displayMessage = "";
  let messageType = "";

  if (draft) {
    if (draft.message?.trim()) {
      messageType = "Draft";
      displayMessage = draft.message;
    } else if (draft.attachments && draft.attachments.length > 0) {
      messageType = "Draft";
      displayMessage = "Media";
    }
  }

  if (!displayMessage) {
    displayMessage = data?.lastMessage?.messageText || "";
    messageType = data?.lastMessage?.messageType || "";
  }

  const handleClick = useCallback(() => onSelect(data), [onSelect, data]);

  const isDeletedLastMessage =
    messageType !== "Draft" && data?.lastMessage?.isDeleted === true;

  const renderPreview = () => {
    if (messageType === "Draft") {
      return (
        <span className="flex items-center gap-1 truncate">
          <span className="shrink-0 font-semibold text-emerald-500">Draft:</span>
          <span className="truncate" dangerouslySetInnerHTML={{ __html: formatPreview(displayMessage) }} />
        </span>
      );
    }

    // Deleted message → tombstone placeholder (WhatsApp-style)
    if (isDeletedLastMessage) {
      return (
        <span className="flex items-center gap-1 truncate italic text-muted-foreground/60">
          <Ban className="h-3 w-3 shrink-0" />
          <span className="truncate pr-0.5">
            {isSelfLastMessage
              ? "You deleted this message"
              : "This message was deleted"}
          </span>
        </span>
      );
    }

    const lastMsgType = data?.lastMessage?.messageType || messageType;

    if (lastMsgType === "TEXT") {
      if (data?.lastMessage?.forwardFromMessageId) {
        return <span className="italic text-muted-foreground/50 flex gap-1"><Forward className="h-3 w-3" /><span>Forwarded</span></span>;
      }
      return (
        <span className="truncate" dangerouslySetInnerHTML={{ __html: formatPreview(displayMessage) }} />
      );
    }

    if (lastMsgType) {
      return <span className="capitalize">{lastMsgType.toLowerCase()}</span>;
    }

    return null;
  };

  const menuItemClass =
    "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none hover:bg-accent focus:bg-accent";

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>
        <div
          onClick={handleClick}
          className={cn(
            "chat-item relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150",
            isActive
              ? "chat-item-active"
              : "hover:bg-muted/60"
          )}
        >
          {/* Active indicator bar */}
          {isActive && <div className="chat-active-bar" />}

          <div className="relative shrink-0">
            <UserAvatar
              src={profile}
              name={name}
              size="lg"
              online={isPrivate ? data.isActive : undefined}
            />
            {isGroup && data?.lastMessage?.senderChatuserId && (
              <span className="absolute -bottom-[2px] -right-0.5 rounded-full border-2 border-card">
                <SenderMiniAvatar
                  src={data.lastMessage.senderProfile}
                  name={data.lastMessage.senderName}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "truncate text-[13px] font-semibold",
                  isActive ? "text-primary" : "text-foreground"
                )}
              >
                {name}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {data.isPinned && (
                  <Pin className="h-3 w-3 rotate-45 text-primary/40" />
                )}
                {data?.lastMessage?.sendAt && (
                  <span className="whitespace-nowrap text-[10.5px] font-medium text-muted-foreground">
                    {formatTimeAgo(data.lastMessage.sendAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  {/* Self: "You:" | Group + other: sender avatar (skip for forwarded/deleted) */}
                  {messageType !== "Draft" && data?.lastMessage && !data?.lastMessage?.forwardFromMessageId && !isDeletedLastMessage && (
                    isSelfLastMessage ? (
                      <span className="shrink-0 font-semibold text-primary/70">You:</span>
                    ) : null
                  )}
                  {data?.lastMessage?.isEdited == true && !isDeletedLastMessage && !(draft?.message?.trim() || (draft?.attachments && draft.attachments.length > 0)) && (
                    <span className="shrink-0 text-[11px] italic text-muted-foreground/60">Edited</span>
                  )}
                  {renderPreview()}
                </span>
              </div>
              {data.unreadCount > 0 && (
                <Badge className="glow-badge h-[18px] min-w-[18px] shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {data.unreadCount > 99 ? "99+" : data.unreadCount}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </ContextMenuPrimitive.Trigger>

      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className="z-50 min-w-[150px] overflow-hidden rounded-xl border border-border/50 bg-popover p-1.5 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
        >
          <ContextMenuPrimitive.Item
            className={menuItemClass}
            onSelect={() => onPin(data.talkId, data.isPinned)}
          >
            <Pin className="h-4 w-4 text-muted-foreground" />
            {data.isPinned ? "Unpin" : "Pin"}
          </ContextMenuPrimitive.Item>
          {onDelete && (
            <ContextMenuPrimitive.Item
              className={cn(
                menuItemClass,
                ""
              )}
              onSelect={() => onDelete(data.talkId)}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              Delete
            </ContextMenuPrimitive.Item>
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
};

function areEqual(prev: ChatListItemProps, next: ChatListItemProps) {
  return (
    prev.data === next.data &&
    prev.isActive === next.isActive &&
    prev.draft === next.draft
  );
}

export const ChatListItem = React.memo(ChatListItemInner, areEqual);
