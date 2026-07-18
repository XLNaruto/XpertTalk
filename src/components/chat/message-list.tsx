import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useMessageCacheStore } from "@/stores/message-cache-store";
import { getEncodedCookie } from "@/lib/encryption";
import { cn } from "@/lib/utils";

import { Loader2 } from "lucide-react";
import MessageBubble from "@/components/chat/message-bubble";
import MediaGrid from "@/components/chat/media-grid";
import ReplyAllBubble from "@/components/chat/reply-all-bubble";
import { MessageListSkeleton } from "@/components/chat/message-list-skeleton";
import { ScrollToBottom } from "@/components/chat/scroll-to-bottom";

export interface MessageListHandle {
  scrollToBottom: () => void;
  scrollToMessage: (messageId: string) => void;
  markAllAsRead: () => void;
  openAtMessageMarkingRead: (messageId: string) => void;
}

interface MessageListProps {
  talkId: string;
  onReply: (msg: any) => void;
  onReplyAll: (msgs: any[]) => void;
  onEdit: (msg: any) => void;
  onDelete: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
  onSelect: (msg: any) => void;
  onSelectMultiple: (msgs: any[]) => void;
  onEnterSelectionMode: (msg: any) => void;
  onEnterSelectionModeMultiple: (msgs: any[]) => void;
  onForward: (msg: any) => void;
  onForwardMultiple: (msgs: any[]) => void;
  onMediaClick: (path: string, type: "image" | "video") => void;
  isSelectionMode: boolean;
  selectedMessages: any[];
  readMessagesApi: (messageId: string, created: string, talkId: string) => void;
  onUnreadCountChange?: (count: number) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  onTogglePin: (messageId: string) => void;
}

// ── Media group detection ──
// Groups consecutive IMAGE/VIDEO messages from the same sender within 1 minute
function computeMediaGroups(messages: any[]): Map<string, { messages: any[]; isFirst: boolean }> {
  const groups = new Map<string, { messages: any[]; isFirst: boolean }>();
  let currentGroup: any[] = [];

  const flush = () => {
    if (currentGroup.length > 1) {
      const groupMsgs = [...currentGroup];
      groupMsgs.forEach((msg, i) => {
        groups.set(msg.messageId, { messages: groupMsgs, isFirst: i === 0 });
      });
    }
    currentGroup = [];
  };

  for (const msg of messages) {
    if (msg.type !== "message") { flush(); continue; }

    const isMedia =
      (msg.messageType === "IMAGE" || msg.messageType === "VIDEO") &&
      msg.mediaPath &&
      !msg.isDeleted &&
      !msg.replyToMessageId &&
      !msg.forwardFromMessageId;

    if (!isMedia) { flush(); continue; }

    if (currentGroup.length === 0) {
      currentGroup.push(msg);
      continue;
    }

    const prev = currentGroup[currentGroup.length - 1];
    const timeDiff = Math.abs(
      new Date(msg.created).getTime() - new Date(prev.created).getTime()
    );
    const sameSender = msg.senderChatuserId === prev.senderChatuserId;

    if (sameSender && timeDiff <= 60000) {
      currentGroup.push(msg);
    } else {
      flush();
      currentGroup.push(msg);
    }
  }
  flush();

  return groups;
}

// ── Reply-all group detection ──
// A "Reply All" on a media grid sends one identical reply per media item. This
// groups that burst (same sender, identical text, each replying to media,
// within 10s) so it can be collapsed into a single bubble with a grid preview.
function computeReplyAllGroups(messages: any[]): Map<string, { messages: any[]; isFirst: boolean }> {
  const groups = new Map<string, { messages: any[]; isFirst: boolean }>();
  let currentGroup: any[] = [];

  const flush = () => {
    if (currentGroup.length > 1) {
      const groupMsgs = [...currentGroup];
      groupMsgs.forEach((msg, i) => {
        groups.set(msg.messageId, { messages: groupMsgs, isFirst: i === 0 });
      });
    }
    currentGroup = [];
  };

  for (const msg of messages) {
    if (msg.type !== "message") { flush(); continue; }

    const isMediaReply =
      msg.messageType === "TEXT" &&
      !msg.isDeleted &&
      msg.replyToMessageId &&
      !msg.forwardFromMessageId &&
      msg.messageText &&
      (msg.replyMessage?.messageType === "IMAGE" ||
        msg.replyMessage?.messageType === "VIDEO");

    if (!isMediaReply) { flush(); continue; }

    if (currentGroup.length === 0) {
      currentGroup.push(msg);
      continue;
    }

    const prev = currentGroup[currentGroup.length - 1];
    const timeDiff = Math.abs(
      new Date(msg.created).getTime() - new Date(prev.created).getTime()
    );
    const sameSender = msg.senderChatuserId === prev.senderChatuserId;
    const sameText = msg.messageText === prev.messageText;

    if (sameSender && sameText && timeDiff <= 10000) {
      currentGroup.push(msg);
    } else {
      flush();
      currentGroup.push(msg);
    }
  }
  flush();

  return groups;
}

export const MessageList = React.forwardRef<MessageListHandle, MessageListProps>(function MessageList({
  talkId,
  onReply,
  onReplyAll,
  onEdit,
  onDelete,
  onDeleteAll,
  onSelect,
  onSelectMultiple,
  onEnterSelectionMode,
  onEnterSelectionModeMultiple,
  onForward,
  onForwardMultiple,
  onMediaClick,
  isSelectionMode,
  selectedMessages,
  readMessagesApi,
  onUnreadCountChange,
  onToggleReaction,
  onTogglePin,
}, ref) {
  const chatuserId = getEncodedCookie("chatuserId") || "";

  const messages = useMessageCacheStore((s) => s.messages);
  const formattedMessages = useMessageCacheStore((s) => s.formattedMessages);
  // The chat whose messages are currently loaded. During a chat switch the
  // `talkId` prop updates a render before the store swaps in the new messages,
  // so positioning must only run when this matches `talkId` — otherwise it
  // captures against the PREVIOUS chat's messages and mis-positions the new one.
  const storeActiveTalkId = useMessageCacheStore((s) => s.activeTalkId);
  const isLoading = useMessageCacheStore((s) => s.isLoading);
  const isMsgApiCall = useMessageCacheStore((s) => s.isMsgApiCall);
  const hasMoreOlder = useMessageCacheStore((s) => s.hasMoreOlder);
  const hasMoreNewer = useMessageCacheStore((s) => s.hasMoreNewer);
  const firstItemIndex = useMessageCacheStore((s) => s.firstItemIndex);
  const getMessagesList = useMessageCacheStore((s) => s.getMessagesList);
  const dispatchMessage = useMessageCacheStore((s) => s.dispatchMessage);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Compute media groups for grid rendering
  const mediaGroups = useMemo(
    () => computeMediaGroups(formattedMessages),
    [formattedMessages]
  );
  // Collapse "Reply All" bursts into a single grid-preview bubble
  const replyAllGroups = useMemo(
    () => computeReplyAllGroups(formattedMessages),
    [formattedMessages]
  );
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const lastVisibleRangeRef = useRef<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const markedAsReadRef = useRef<Set<string>>(new Set());

  // Suppress followOutput auto-scroll when positioned at unreads
  const suppressFollowRef = useRef(false);
  // Track whether initial unread positioning has been done for this talkId
  const initialPositionDoneRef = useRef(false);
  // Gate read-marking until Virtuoso has finished initial scroll positioning.
  // Without this, rangeChanged fires for intermediate positions during Virtuoso's
  // alignToBottom → initialTopMostItemIndex settling, marking messages as read prematurely.
  const readyToMarkRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture initial unread index ONCE per talkId when messages first load
  const initialUnreadRef = useRef<number | null>(null);
  const prevTalkIdRef = useRef(talkId);
  const allReadBottomRef = useRef(false);
  // For "all read" chats, keep re-asserting bottom until this deadline. Cached
  // chats swap formattedMessages up to 3x (cached → newer-sync → full-sync) and
  // media loads async — each reflow can strand the view mid-list, so a one-shot
  // scroll isn't enough during the initial settle.
  const allReadSettleUntilRef = useRef(Date.now() + 2500);

  if (prevTalkIdRef.current !== talkId) {
    // Reset when switching chats
    initialUnreadRef.current = null;
    prevTalkIdRef.current = talkId;
    initialPositionDoneRef.current = false;
    suppressFollowRef.current = false;
    allReadBottomRef.current = false;
    allReadSettleUntilRef.current = Date.now() + 2500;
    readyToMarkRef.current = false;
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
  }

  if (
    initialUnreadRef.current === null &&
    formattedMessages.length > 0 &&
    storeActiveTalkId === talkId
  ) {
    const idx = formattedMessages.findIndex(
      (msg: any) =>
        msg.type === "message" &&
        msg.unread === 1 &&
        String(msg.senderChatuserId) !== String(chatuserId)
    );
    initialUnreadRef.current = idx >= 0 ? idx : formattedMessages.length - 1;
    // If there are unreads, suppress followOutput until user scrolls to bottom
    if (idx >= 0) {
      initialPositionDoneRef.current = true;
      suppressFollowRef.current = true;
    } else {
      allReadBottomRef.current = true;
      // Start the settle window from when THIS chat's data actually loaded.
      allReadSettleUntilRef.current = Date.now() + 2500;
    }
  }

  const firstUnreadIndex = initialUnreadRef.current ?? formattedMessages.length - 1;

  // Eagerly suppress followOutput during render when background sync adds unreads
  // (prevents auto-scroll to bottom before the repositioning useEffect can fire)
  if (
    !initialPositionDoneRef.current &&
    formattedMessages.length > 0 &&
    storeActiveTalkId === talkId
  ) {
    const hasUnreads = formattedMessages.some(
      (msg: any) =>
        msg.type === "message" &&
        msg.unread === 1 &&
        String(msg.senderChatuserId) !== String(chatuserId)
    );
    if (hasUnreads) {
      suppressFollowRef.current = true;
    }
  }

  // Reset local read-tracking state when switching chats
  useEffect(() => {
    setReadMessages(new Set());
    markedAsReadRef.current = new Set();
    setUnreadBelowCount(0);
  }, [talkId]);

  // Keep a ref to the latest handleRangeChanged so the settling timer can call it
  const handleRangeChangedRef = useRef<((range: { startIndex: number; endIndex: number }) => void) | null>(null);

  // Reposition to first unread after background sync adds new unread messages
  // (handles the case where cached messages had no unreads but sync fetches new ones)
  useEffect(() => {
    if (initialPositionDoneRef.current) return;
    if (formattedMessages.length === 0) return;
    if (storeActiveTalkId !== talkId) return;

    const idx = formattedMessages.findIndex(
      (msg: any) =>
        msg.type === "message" &&
        msg.unread === 1 &&
        String(msg.senderChatuserId) !== String(chatuserId)
    );

    if (idx >= 0) {
      allReadBottomRef.current = false;
      initialPositionDoneRef.current = true;
      initialUnreadRef.current = idx;
      suppressFollowRef.current = true;
      setForceScrollIndex(idx);
      setVirtuosoKey((k) => k + 1);
      setTimeout(() => setForceScrollIndex(null), 500);
    }
  }, [formattedMessages, chatuserId, storeActiveTalkId, talkId]);

  // Keep scroll pinned to bottom for "all read" chats.
  // Cached chats swap formattedMessages up to 3x (cached → newer-sync → full-sync)
  // and media loads async — each reflow can strand the view mid-list. The old
  // guard only re-scrolled when the list GREW, so the final full-sync swap (same
  // length) left the view stranded. Now we re-assert bottom on every swap during
  // the initial settle window, and afterwards only when the list grows (new msgs).
  // The double timer covers the two reflow sources: the array swap and late media.
  useEffect(() => {
    if (!allReadBottomRef.current) return;
    if (formattedMessages.length === 0) return;
    if (storeActiveTalkId !== talkId) return;
    const lastIndex = formattedMessages.length - 1;
    const withinSettle = Date.now() < allReadSettleUntilRef.current;
    const grew =
      initialUnreadRef.current !== null && initialUnreadRef.current < lastIndex;
    if (!grew && !withinSettle) return;

    initialUnreadRef.current = lastIndex;
    const toBottom = () =>
      virtuosoRef.current?.scrollToIndex({
        index: "LAST",
        align: "end",
        behavior: "auto",
      });
    const t1 = setTimeout(toBottom, 50);
    const t2 = setTimeout(toBottom, 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [formattedMessages, storeActiveTalkId, talkId]);

  // True remaining-unread count for THIS chat. The store cascades reads
  // (UPDATE_READ_STATUS marks every message up to the read one as read), so this
  // ticks down as the user scrolls the viewport — it does not jump to 0 on entry.
  const remainingUnreadCount = useMemo(
    () =>
      formattedMessages.reduce(
        (n: number, m: any) =>
          n +
          (m.type === "message" &&
          m.unread === 1 &&
          String(m.senderChatuserId) !== String(chatuserId)
            ? 1
            : 0),
        0
      ),
    [formattedMessages, chatuserId]
  );

  // Push the live count to the sidebar badge whenever it changes. Skip while the
  // list is empty/loading (chat-switch clears it briefly) so we don't flash the
  // badge to 0 before the messages reload.
  useEffect(() => {
    if (!isMsgApiCall || formattedMessages.length === 0) return;
    onUnreadCountChange?.(remainingUnreadCount);
  }, [remainingUnreadCount, onUnreadCountChange, isMsgApiCall, formattedMessages.length]);

  // Live unread index for unread label rendering
  const liveFirstUnreadIndex = useMemo(() => {
    const idx = formattedMessages.findIndex(
      (msg: any) =>
        msg.type === "message" &&
        msg.unread === 1 &&
        !readMessages.has(msg.messageId) &&
        String(msg.senderChatuserId) !== String(chatuserId)
    );
    return idx >= 0 ? idx : -1;
  }, [formattedMessages, readMessages, chatuserId]);

  const markAsRead = useCallback(
    (messageId: string, created: string) => {
      if (markedAsReadRef.current.has(messageId)) return;
      markedAsReadRef.current.add(messageId);
      readMessagesApi(messageId, created, talkId);
      // Update store immediately so msg.unread becomes 0 — keeps
      // unreadBelowCount (scroll button) in sync with sidebar count
      dispatchMessage({
        type: "UPDATE_READ_STATUS",
        payload: { messageId },
      });
      setReadMessages((prev) => new Set(prev).add(messageId));
    },
    [readMessagesApi, talkId, dispatchMessage]
  );

  const handleRangeChanged = useCallback(
    ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
      lastVisibleRangeRef.current = { startIndex, endIndex };
      let latestUnreadBelow = 0;

      // Always count unreads below for the scroll-to-bottom badge,
      // but only mark messages as read AFTER Virtuoso has settled.
      // During initial mount, Virtuoso fires rangeChanged for intermediate
      // positions (alignToBottom → initialTopMostItemIndex) which would
      // prematurely mark messages as read.
      if (readyToMarkRef.current) {
        // Find the LAST unread message in the visible range.
        // Server marks everything up to the given messageId as read,
        // so we only need to emit markRead once for the last one.
        let lastVisibleUnread: { messageId: string; created: string } | null = null;

        for (let i = startIndex; i <= endIndex; i++) {
          const adjustedIndex = i - firstItemIndex;
          const msg = formattedMessages[adjustedIndex];
          if (!msg || msg.type !== "message") continue;
          if (String(msg.senderChatuserId) === String(chatuserId)) continue;

          // Skip non-first items in a media group — they render as 1px hidden divs
          // and aren't truly visible to the user
          const groupInfo = mediaGroups.get(msg.messageId);
          if (groupInfo && !groupInfo.isFirst) continue;

          // If this is the first item of a media group, check ALL group messages
          if (groupInfo && groupInfo.isFirst) {
            for (const gMsg of groupInfo.messages) {
              if (
                gMsg.unread === 1 &&
                !readMessages.has(gMsg.messageId) &&
                String(gMsg.senderChatuserId) !== String(chatuserId)
              ) {
                lastVisibleUnread = { messageId: gMsg.messageId, created: gMsg.created };
              }
            }
            continue;
          }

          // Normal (non-grouped) message
          if (msg.unread === 1 && !readMessages.has(msg.messageId)) {
            lastVisibleUnread = { messageId: msg.messageId, created: msg.created };
          }
        }

        // Emit a single markRead for the last visible unread — server marks all prior as read
        if (lastVisibleUnread && !markedAsReadRef.current.has(lastVisibleUnread.messageId)) {
          markAsRead(lastVisibleUnread.messageId, lastVisibleUnread.created);
        }
      }

      const adjustedEnd = endIndex - firstItemIndex;
      for (let i = adjustedEnd + 1; i < formattedMessages.length; i++) {
        const msg = formattedMessages[i];
        if (
          msg?.type === "message" &&
          msg.unread === 1 &&
          !readMessages.has(msg.messageId) &&
          String(msg.senderChatuserId) !== String(chatuserId)
        ) {
          latestUnreadBelow++;
        }
      }
      setUnreadBelowCount(latestUnreadBelow);
    },
    [formattedMessages, firstItemIndex, readMessages, chatuserId, markAsRead, mediaGroups]
  );

  // Keep ref in sync so the settling timer can call the latest version
  handleRangeChangedRef.current = handleRangeChanged;

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end" });
  }, []);

  // Mark ALL unread messages as read (used when user sends a message)
  const markAllAsRead = useCallback(() => {
    let lastUnreadMsg: any = null;
    const newRead = new Set(readMessages);

    for (const msg of formattedMessages) {
      if (
        msg.type === "message" &&
        msg.unread === 1 &&
        String(msg.senderChatuserId) !== String(chatuserId)
      ) {
        newRead.add(msg.messageId);
        markedAsReadRef.current.add(msg.messageId);
        lastUnreadMsg = msg;
      }
    }

    // Emit markRead for the last unread — server marks all prior messages as read too
    if (lastUnreadMsg) {
      readMessagesApi(lastUnreadMsg.messageId, lastUnreadMsg.created, talkId);
    }

    setReadMessages(newRead);
    setUnreadBelowCount(0);
    suppressFollowRef.current = false;
  }, [formattedMessages, readMessages, chatuserId, readMessagesApi, talkId]);



  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [forceScrollIndex, setForceScrollIndex] = useState<number | null>(null);
  const [virtuosoKey, setVirtuosoKey] = useState(0);

  // After Virtuoso settles (talkId change or remount), enable read-marking
  // and trigger it for the current visible range
  useEffect(() => {
    readyToMarkRef.current = false;
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = setTimeout(() => {
      readyToMarkRef.current = true;
      // Trigger marking for the settled visible range
      if (lastVisibleRangeRef.current && handleRangeChangedRef.current) {
        handleRangeChangedRef.current(lastVisibleRangeRef.current);
      }
    }, 600);
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [talkId, virtuosoKey]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSearchRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightMessage = useCallback((messageId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedId(messageId);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 2000);
  }, []);

  // Find a message by messageId, falling back to forwardFromMessageId
  // (handles replies to forwarded messages where replyToMessageId is the original ID)
  const findMessageIndex = useCallback(
    (msgs: any[], targetId: string) => {
      const idx = msgs.findIndex((msg: any) => msg.messageId === targetId);
      if (idx >= 0) return idx;
      return msgs.findIndex((msg: any) => msg.forwardFromMessageId === targetId);
    },
    []
  );

  // Non-first members of a media group render as 1px hidden divs — only the
  // group's first message renders the visible grid. Resolve any group member
  // to its first message so scroll/highlight lands on the rendered grid.
  const resolveGroupTarget = useCallback(
    (msgs: any[], idx: number) => {
      const foundMsg = msgs[idx];
      const groupInfo = foundMsg && mediaGroups.get(foundMsg.messageId);
      if (groupInfo && !groupInfo.isFirst) {
        const firstId = groupInfo.messages[0]?.messageId;
        const firstIdx = msgs.findIndex((m: any) => m.messageId === firstId);
        if (firstIdx >= 0) return { idx: firstIdx, id: firstId };
      }
      return { idx, id: foundMsg?.messageId };
    },
    [mediaGroups]
  );

  // Perform the actual scroll after formattedMessages updates with fetched messages
  const pendingScrollIdRef = useRef(pendingScrollId);
  pendingScrollIdRef.current = pendingScrollId;

  useEffect(() => {
    if (!pendingScrollId) return;

    const rawIdx = findMessageIndex(formattedMessages, pendingScrollId);
    if (rawIdx < 0) return;

    // Resolve media-group members to the group's first (rendered) message
    const { idx, id } = resolveGroupTarget(formattedMessages, rawIdx);
    const actualId = id || pendingScrollId;

    // Clear pending immediately so we don't re-trigger
    setPendingScrollId(null);
    scrollSearchRef.current = false;

    // Let the freshly-prepended list settle a tick, then scroll imperatively.
    // scrollToIndex re-corrects against real item heights (unlike the
    // defaultItemHeight estimate), so tall media bubbles land accurately.
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: idx,
        align: "center",
        behavior: "auto",
      });
      highlightMessage(actualId);
      scrollTimerRef.current = null;
    }, 150);
  }, [formattedMessages, firstItemIndex, pendingScrollId, highlightMessage, findMessageIndex, resolveGroupTarget]);

  const scrollToMessage = useCallback(
    async (messageId: string) => {
      if (scrollSearchRef.current) return;

      // Check if already in current list (also checks forwardFromMessageId for forwarded replies)
      const rawIdx = findMessageIndex(formattedMessages, messageId);

      if (rawIdx >= 0) {
        // Resolve media-group members to the group's first (rendered) message
        const { idx, id } = resolveGroupTarget(formattedMessages, rawIdx);
        const actualId = id || messageId;
        // Use the imperative scrollToIndex instead of an initialTopMostItemIndex
        // remount: it re-corrects after measuring real item heights, so tall
        // media / media-grid bubbles land accurately. The remount path relied on
        // defaultItemHeight (60px) and mis-estimated big media, scrolling to the
        // wrong place (document replies happened to work because they're ~60px).
        virtuosoRef.current?.scrollToIndex({
          index: idx,
          align: "center",
          behavior: "auto",
        });
        highlightMessage(actualId);
        return;
      }

      // Not found — set pending target and fetch older messages
      setPendingScrollId(messageId);
      scrollSearchRef.current = true;

      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts) {
        attempts++;
        const currentState = useMessageCacheStore.getState();
        const msgs = currentState.messages;

        if (!currentState.hasMoreOlder || msgs.length === 0) break;

        const oldestId = msgs[0]?.messageId;
        if (!oldestId) break;

        await currentState.getMessagesList(talkId, oldestId, "older", 1000);

        // Wait for React render cycle
        await new Promise((r) => setTimeout(r, 200));

        // Check if the effect already handled it
        if (!pendingScrollIdRef.current) return;

        // Also check directly in case effect hasn't fired yet
        const updated = useMessageCacheStore.getState();
        const foundIdx = findMessageIndex(updated.formattedMessages, messageId);
        if (foundIdx >= 0) return;
      }

      // Exhausted — clean up
      setPendingScrollId(null);
      scrollSearchRef.current = false;
    },
    [talkId, formattedMessages, firstItemIndex, highlightMessage, findMessageIndex, resolveGroupTarget]
  );

  // Notification deep-link: land on the notified message AND mark everything up
  // to it as read, bypassing the "stop at first unread divider" positioning.
  // Newer messages (arrived after the notification) stay unread.
  const openAtMessageMarkingRead = useCallback(
    (messageId: string) => {
      const rawIdx = findMessageIndex(formattedMessages, messageId);
      if (rawIdx < 0) {
        // Not in the loaded page yet — fall back to fetch-and-scroll. Normal
        // read-on-view will clear unreads once the view settles on it.
        scrollToMessage(messageId);
        return;
      }

      // Resolve media-group members to the group's first (rendered) message.
      const { idx, id } = resolveGroupTarget(formattedMessages, rawIdx);
      const target = formattedMessages[idx];

      // Mark read up to (and including) the notified message. The store's
      // UPDATE_READ_STATUS cascades to all earlier messages and the server marks
      // everything up to this messageId as read too.
      if (target) markAsRead(target.messageId, target.created);

      // Neutralize the unread auto-positioning so it can't yank the view back
      // to the unread divider.
      initialPositionDoneRef.current = true;
      allReadBottomRef.current = false;
      suppressFollowRef.current = false;

      // Remount Virtuoso positioned at the target so it *settles* there. A plain
      // scrollToIndex loses to Virtuoso's initial unread-settle when the chat
      // mounted with unreads present.
      setForceScrollIndex(idx);
      setVirtuosoKey((k) => k + 1);
      setTimeout(() => {
        setForceScrollIndex(null);
        highlightMessage(id || messageId);
      }, 500);
    },
    [formattedMessages, findMessageIndex, resolveGroupTarget, markAsRead, highlightMessage, scrollToMessage]
  );

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage, markAllAsRead, openAtMessageMarkingRead }), [scrollToBottom, scrollToMessage, markAllAsRead, openAtMessageMarkingRead]);

  if (!isMsgApiCall || formattedMessages.length === 0) {
    if (isLoading) {
      return <MessageListSkeleton />;
    }
    return <div className="h-full chat-bg" />;
  }

  return (
    <div
      className="relative h-full chat-bg"
    >
      <Virtuoso
        key={`${talkId}-${virtuosoKey}`}
        ref={virtuosoRef}
        style={{ width: "100%", height: "100%", overflowX: "hidden" }}
        data={formattedMessages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={
          forceScrollIndex != null
            ? forceScrollIndex
            : allReadBottomRef.current
              ? { index: firstUnreadIndex, align: "end" }
              : firstUnreadIndex
        }
        alignToBottom
        overscan={400}
        increaseViewportBy={{ top: 600, bottom: 200 }}
        defaultItemHeight={60}
        startReached={() => {
          if (hasMoreOlder && !isLoading) {
            // User scrolled to top — disable the "all read bottom" auto-scroll
            allReadBottomRef.current = false;
            const oldestId = messages[0]?.messageId;
            if (oldestId)
              getMessagesList(talkId, oldestId, "older", 50);
          }
        }}
        endReached={() => {
          if (hasMoreNewer && !isLoading) {
            const newestId = messages[messages.length - 1]?.messageId;
            if (newestId)
              getMessagesList(talkId, newestId, "newer", 50);
          }
        }}
        followOutput={(isBottom: boolean) => {
          if (suppressFollowRef.current) return false;
          return isBottom ? "smooth" : false;
        }}
        atBottomStateChange={(atBottom: boolean) => {
          setIsAtBottom(atBottom);
          if (atBottom) {
            suppressFollowRef.current = false;
          }
        }}
        atBottomThreshold={20}
        rangeChanged={handleRangeChanged}
        components={{ Footer: () => <div className="h-3" /> }}
        itemContent={(index, message) => {
          const arrayIndex = index - firstItemIndex;
          const isSender =
            String(message.senderChatuserId) === String(chatuserId);

          // Date separator
          if (message.type === "status") {
            return (
              <div className="flex items-center justify-center py-3">
                <span
                  className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: 'var(--color-muted)',
                    color: 'var(--color-muted-foreground)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }}
                >
                  {message.text}
                </span>
              </div>
            );
          }

          // Unread label
          const shouldShowUnreadLabel =
            arrayIndex === liveFirstUnreadIndex &&
            message.unread === 1 &&
            !readMessages.has(message.messageId);

          const prevMsg = formattedMessages[arrayIndex - 1];
          const showSenderInfo =
            !isSender &&
            (message.senderChatuserId !== prevMsg?.senderChatuserId ||
              new Date(message.created).getTime() -
                new Date(prevMsg?.created || 0).getTime() >=
                60000);

          const isHighlighted = highlightedId === message.messageId;

          // ── Media grid handling ──
          const groupInfo = mediaGroups.get(message.messageId);

          // Non-first items in a group are hidden (rendered by the first item)
          if (groupInfo && !groupInfo.isFirst) {
            return <div style={{ height: 1, overflow: "hidden" }} />;
          }

          // First item in a group → render MediaGrid
          if (groupInfo && groupInfo.isFirst) {
            return (
              <div
                data-message-id={message.messageId}
                className={cn(
                  showSenderInfo ? "px-4 pt-4 pb-1" : "px-4 py-1",
                  isHighlighted && "rounded-xl bg-primary/10 transition-colors duration-500"
                )}
              >
                {shouldShowUnreadLabel && (
                  <div className="flex justify-center py-2">
                    <span
                      className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm"
                    >
                      Unread messages
                    </span>
                  </div>
                )}
                <MediaGrid
                  messages={groupInfo.messages}
                  isSender={isSender}
                  showSenderInfo={showSenderInfo}
                  senderName={message.senderName}
                  senderProfile={message.senderProfile}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedMessages.some(
                    (item: any) => groupInfo.messages.some((gm: any) => gm.messageId === item.messageId)
                  )}
                  onMediaClick={onMediaClick}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onSelect={onSelect}
                  onSelectMultiple={onSelectMultiple}
                  onEnterSelectionMode={onEnterSelectionMode}
                  onEnterSelectionModeMultiple={onEnterSelectionModeMultiple}
                  onForwardMultiple={onForwardMultiple}
                  onDeleteAll={onDeleteAll}
                  onToggleReaction={onToggleReaction}
                />
              </div>
            );
          }

          // ── Reply-all group handling ──
          const replyAllInfo = replyAllGroups.get(message.messageId);

          // Non-first items in a reply-all group are hidden (rendered by the first)
          if (replyAllInfo && !replyAllInfo.isFirst) {
            return <div style={{ height: 1, overflow: "hidden" }} />;
          }

          // First item in a reply-all group → render the collapsed grid bubble
          if (replyAllInfo && replyAllInfo.isFirst) {
            return (
              <div
                data-message-id={message.messageId}
                className={cn(
                  showSenderInfo ? "px-4 pt-4 pb-1" : "px-4 py-1",
                  isHighlighted && "rounded-xl bg-primary/10 transition-colors duration-500"
                )}
              >
                {shouldShowUnreadLabel && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                      Unread messages
                    </span>
                  </div>
                )}
                <ReplyAllBubble
                  messages={replyAllInfo.messages}
                  isSender={isSender}
                  showSenderInfo={showSenderInfo}
                  isSelected={selectedMessages.some(
                    (item: any) => replyAllInfo.messages.some((gm: any) => gm.messageId === item.messageId)
                  )}
                  isSelectionMode={isSelectionMode}
                  onReply={onReply}
                  onForward={onForward}
                  onDeleteAll={onDeleteAll}
                  onSelectMultiple={onSelectMultiple}
                  onEnterSelectionModeMultiple={onEnterSelectionModeMultiple}
                  onToggleReaction={onToggleReaction}
                  onScrollToMessage={scrollToMessage}
                />
              </div>
            );
          }

          // ── Normal message bubble ──
          return (
            <div
              data-message-id={message.messageId}
              className={cn(
                showSenderInfo ? "px-4 pt-4 pb-1" : "px-4 py-1",
                isHighlighted && "rounded-xl bg-primary/10 transition-colors duration-500"
              )}
            >
              {shouldShowUnreadLabel && (
                <div className="flex justify-center py-2">
                  <span
                    className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm"
                  >
                    Unread messages
                  </span>
                </div>
              )}
              <MessageBubble
                message={message}
                isSender={isSender}
                showSenderInfo={showSenderInfo}
                isSelected={selectedMessages.some(
                  (item: any) => item.messageId === message.messageId
                )}
                isSelectionMode={isSelectionMode}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onSelect={onSelect}
                onEnterSelectionMode={onEnterSelectionMode}
                onForward={onForward}
                onMediaClick={onMediaClick}
                onScrollToMessage={scrollToMessage}
                onToggleReaction={onToggleReaction}
                onTogglePin={onTogglePin}
              />
            </div>
          );
        }}
      />

      {/* Loading indicator for older messages */}
      {isLoading && hasMoreOlder && (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1 shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        </div>
      )}

      <ScrollToBottom
        isVisible={!isAtBottom}
        unreadCount={unreadBelowCount}
        onClick={scrollToBottom}
      />
    </div>
  );
});

export { type MessageListProps };
