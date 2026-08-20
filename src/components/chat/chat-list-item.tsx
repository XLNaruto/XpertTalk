import React, { useCallback, useEffect, useState } from "react";
import { Ban, Bell, BellOff, Forward, MailOpen, Pin, Trash2 } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo, formatPreview } from "@/lib/message-formatters";
import { mediaLabel } from "@/lib/media-items";
import { isTalkMuted, muteStatusLabel } from "@/lib/mute";
import { MuteDialog } from "@/components/chat/mute-dialog";
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
  onMarkUnread?: (talkId: string, messageId: string) => void;
  /** Only supplied when the build may mute (admin) — see `canMuteTalks`. */
  onMute?: (talkId: string, isMuted: boolean, muteUntil: string | null) => void;
}

const ChatListItemInner: React.FC<ChatListItemProps> = ({
  data,
  isActive,
  chatuserId,
  draft,
  onSelect,
  onPin,
  onDelete,
  onMarkUnread,
  onMute,
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

  // Never read `isMuted` alone — a lapsed `muteUntil` means it's audible again.
  const muted = isTalkMuted(data);

  // The duration picker lives outside the context menu — a menu item can't host
  // a dialog, since selecting it unmounts the menu content.
  const [muteDialogOpen, setMuteDialogOpen] = useState(false);

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

    if (data?.lastMessage?.forwardFromMessageId && lastMsgType === "TEXT") {
      return <span className="italic text-muted-foreground/50 flex gap-1"><Forward className="h-3 w-3" /><span>Forwarded</span></span>;
    }

    // A media message can carry a caption, so show the text whenever there IS
    // text — `messageType` only describes how the bubble renders.
    if (displayMessage) {
      return (
        <span className="truncate" dangerouslySetInnerHTML={{ __html: formatPreview(displayMessage) }} />
      );
    }

    // Uncaptioned attachment(s) — "3 photos" for an album.
    const label = mediaLabel(data?.lastMessage);
    if (label) return <span>{label}</span>;

    if (lastMsgType && lastMsgType !== "TEXT") {
      return <span className="capitalize">{lastMsgType.toLowerCase()}</span>;
    }

    return null;
  };

  const menuItemClass =
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none hover:bg-accent focus:bg-accent";

  return (
    <>
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
                  {muted && (
                    <span title={muteStatusLabel(data)} className="flex items-center">
                      <BellOff className="h-3 w-3 text-muted-foreground/50" />
                    </span>
                  )}
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
            {onMute &&
              (muted ? (
                <ContextMenuPrimitive.Item
                  className={menuItemClass}
                  onSelect={() => onMute(data.talkId, false, null)}
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  Unmute
                </ContextMenuPrimitive.Item>
              ) : (
                <ContextMenuPrimitive.Item
                  className={menuItemClass}
                  // Deferred a tick: opening a modal dialog while the menu is
                // still tearing down can leave the dismiss layer's
                // `pointer-events: none` stuck on <body>.
                onSelect={() => setTimeout(() => setMuteDialogOpen(true), 0)}
                >
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                  Mute
                </ContextMenuPrimitive.Item>
              ))}
            {onMarkUnread && data?.lastMessage?.messageId && !data?.lastMessage?.isDeleted && (
              <ContextMenuPrimitive.Item
                className={menuItemClass}
                onSelect={() =>
                  onMarkUnread(data.talkId, data.lastMessage.messageId)
                }
              >
                <MailOpen className="h-4 w-4 text-muted-foreground" />
                Mark as unread
              </ContextMenuPrimitive.Item>
            )}
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

      {onMute && (
        <MuteDialog
          open={muteDialogOpen}
          onOpenChange={setMuteDialogOpen}
          name={name}
          onConfirm={(muteUntil) => onMute(data.talkId, true, muteUntil)}
        />
      )}
    </>
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
