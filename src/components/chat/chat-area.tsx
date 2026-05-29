import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/stores/chat-store";
import { useMessageCacheStore } from "@/stores/message-cache-store";
import { useUIStore } from "@/stores/ui-store";
import { useUserListStore } from "@/stores/user-list-store";
import useIsMobile from "@/hooks/use-is-mobile";
import { useTalkSocket } from "@/hooks/use-socket";
import useMessageSelection from "@/hooks/use-message-selection";
import useMediaLightbox from "@/hooks/use-media-lightbox";
import { getEncodedCookie, encryptUrlData } from "@/lib/encryption";
import { apiHeader, postData } from "@/lib/api-helper";
import { toast } from "sonner";
import { unformatMentionsFromMessage } from "@/lib/message-formatters";
import { MessageSquare, Sparkles, Download, Trash2, Forward, Pin, PinOff, Reply } from "lucide-react";
import ChatHeader from "@/components/chat/chat-header";
import { MessageList, type MessageListHandle } from "@/components/chat/message-list";
import MessageInput from "@/components/chat/message-input";
import { GroupManagementSheet } from "@/components/group/group-management-sheet";
import type { MessageInputHandle } from "@/components/chat/message-input";
import type { DraftState } from "@/hooks/use-draft";
import { DragOverlay } from "@/components/chat/drag-overlay";
import { ForwardDialog } from "@/components/modals/forward-dialog";
import { PinnedMessagesSheet } from "@/components/chat/pinned-messages-sheet";
import { MediaListSheet } from "@/components/chat/media-list-sheet";
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

const Lightbox = React.lazy(() => import("yet-another-react-lightbox"));
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import logger from "@/lib/logger";


export function ChatArea() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Chat store
  const WS_URL = useChatStore((s) => s.WS_URL);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const talkId = useChatStore((s) => s.activeChat.talkId);
  const receiverId = useChatStore((s) => s.activeChat.receiverId);
  const receiverType = useChatStore((s) => s.activeChat.receiverType);
  const receiverName = useChatStore((s) => s.activeChat.receiverName);
  const receiverProfile = useChatStore((s) => s.activeChat.receiverProfile);
  const talkType = useChatStore((s) => s.activeChat.talkType);
  const talkName = useChatStore((s) => s.activeChat.talkName);
  const talkProfile = useChatStore((s) => s.activeChat.talkProfile);
  const isActive = useChatStore((s) => s.activeChat.isActive);
  const isGroupAdmin = useChatStore((s) => s.activeChat.isGroupAdmin);
  const deepLinkMessageId = useChatStore((s) => s.deepLinkMessageId);
  const setDeepLinkMessageId = useChatStore((s) => s.setDeepLinkMessageId);
  const getMessagesList = useMessageCacheStore((s) => s.getMessagesList);

  // Message cache store
  const messages = useMessageCacheStore((s) => s.messages);
  const formattedMessages = useMessageCacheStore((s) => s.formattedMessages);
  const dispatchMessage = useMessageCacheStore((s) => s.dispatchMessage);
  const switchChat = useMessageCacheStore((s) => s.switchChat);
  // UI store
  const handleCreateGroupClose = useUIStore((s) => s.handleCreateGroupClose);
  // User list store (sidebar)
  const setUserList = useUserListStore((s) => s.setUserList);

  // Auth info
  const xtoken = getEncodedCookie("token") || "";
  const chatuserId = getEncodedCookie("chatuserId") || "";

  // Local state
  const [message, setMessage] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState<any>({});
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [replyAllMessageIds, setReplyAllMessageIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isReply, setIsReply] = useState(false);
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
  const [lightboxDeleteOpen, setLightboxDeleteOpen] = useState(false);
  const [selectionDeleteOpen, setSelectionDeleteOpen] = useState(false);
  const [isPinnedSheetOpen, setIsPinnedSheetOpen] = useState(false);
  const [isMediaListOpen, setIsMediaListOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Message search state ──
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear typing state and close search on talk change
  useEffect(() => {
    setTypingUsers(new Map());
    typingTimersRef.current.forEach((t) => clearTimeout(t));
    typingTimersRef.current.clear();
    // Close search when switching chats
    setIsSearchOpen(false);
    setSearchTerm("");
    setSearchResults([]);
    setCurrentSearchIndex(0);
  }, [talkId]);

  const messageInputRef = useRef<MessageInputHandle>(null);
  const messageListRef = useRef<MessageListHandle>(null);

  // Hooks
  const {
    isSelectionMode,
    selectedMessages,
    toggleSelection,
    toggleSelectionMultiple,
    enterSelectionMode,
    enterSelectionModeMultiple,
    cancelSelection,
    canDeleteSelected,
  } = useMessageSelection({ talkId, chatuserId });

  const {
    isOpen: openLightbox,
    slides: mediaSlides,
    currentIndex,
    setCurrentIndex,
    currentSlide,
    openMedia: handleMediaClick,
    openMediaFromList: handleMediaClickFromList,
    close: closeLightbox,
  } = useMediaLightbox(formattedMessages);

  // ── Socket.IO (talk namespace) ──

  const { emit, isConnected } = useTalkSocket({
    baseUrl: WS_URL,
    talkId: talkId || null,
    talkType: talkType || null,
    token: xtoken || null,
    onConnect: (isReconnect: boolean) => {
      
      logger.debug("talkId,talkType,WS_URL,xtoken, isReconnect+++++++++",talkId,talkType,WS_URL,xtoken, isReconnect);

      // On reconnect, fetch any messages missed during the disconnect gap
      if (isReconnect && talkId) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.messageId) {
          getMessagesList(talkId, lastMsg.messageId, "newer", -1);
        }
      }
      // Only auto-mark last message as read if there are NO unreads.
      // When there are unreads, let viewport-based marking (handleRangeChanged) handle it
      // so the user sees the "Unread messages" label and scroll stops at the first unread.
      const hasUnreads = messages.some(
        (m: any) => m.unread === 1 && String(m.senderChatuserId) !== String(chatuserId)
      );
      if (!hasUnreads) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg) readMessagesApi(lastMsg.messageId, lastMsg.created, talkId);
      }
    },
    onNewMessage: (newMessage) => {
      const isSelf = String(chatuserId) === String(newMessage?.senderChatuserId);
      const messageToAdd = {
        ...newMessage,
        ...(!("unread" in newMessage) && { unread: 1 }),
      };
      dispatchMessage({
        type: "ADD_MESSAGE",
        payload: isSelf ? newMessage : messageToAdd,
      });
      if (isSelf) {
        readMessagesApi(newMessage.messageId, newMessage.created || newMessage.sendAt, talkId);
      }
    },
    onMessageEdited: (data) => {
      dispatchMessage({
        type: "EDIT_MESSAGE",
        payload: { messageId: data.messageId, messageText: data.messageText },
      });
    },
    onMessageDeleted: (data) => {
      dispatchMessage({
        type: "DELETE_MESSAGE",
        payload: data.messageId,
      });
    },
    onReadStatusUpdated: (data) => {
      dispatchMessage({
        type: "UPDATE_READ_STATUS",
        payload: { messageId: data.messageId },
      });
    },
    onPresenceChanged: (data) => {
      setActiveChat({ isActive: !!data?.isOnline });
    },
    onUserTyping: (data) => {
      const id = String(data?.chatuserId);
      if (id === String(chatuserId)) return; // ignore self
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(id, data?.name || "Someone");
        return next;
      });
      // Auto-clear after 3s if no stopTyping received
      const existing = typingTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        id,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          typingTimersRef.current.delete(id);
        }, 3000)
      );
    },
    onUserStopTyping: (data) => {
      const id = String(data?.chatuserId);
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const timer = typingTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        typingTimersRef.current.delete(id);
      }
    },
    onReactionToggled: (data) => {
      dispatchMessage({
        type: "TOGGLE_REACTION",
        payload: {
          messageId: data.messageId,
          chatuserId: data.chatuserId,
          userName: data.userName,
          userProfile: data.userProfile,
          reaction: data.reaction,
        },
      });
    },
    onPinToggled: (data) => {
      dispatchMessage({
        type: "TOGGLE_PIN",
        payload: {
          messageId: data.messageId,
          isPinned: data.isPinned,
        },
      });
    },
  });

  // ── Read messages API ──

  const readMessagesApi = useCallback(
    (messageId: string, _created: string, _talkId: string) => {
      if (!messageId) return;
      emit("markRead", { messageId });
    },
    [emit]
  );

  // ── Delete message ──

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (isConnected && messageId) {
        emit("deleteMessage", { messageId }, (ack: any) => {
          if (!ack?.success) {
            toast.error("Failed to delete message");
          }
        });
      }
      setEditingMessageId(null);
      setMessage("");
    },
    [isConnected, emit]
  );

  // ── Toggle reaction ──

  const handleToggleReaction = useCallback(
    (messageId: string, reaction: string) => {
      if (isConnected && messageId) {
        emit("toggleReaction", { messageId, reaction }, (ack: any) => {
          if (!ack?.success) {
            toast.error("Failed to toggle reaction");
          }
        });
      }
    },
    [isConnected, emit]
  );

  // ── Toggle pin ──

  const handleTogglePin = useCallback(
    (messageId: string) => {
      if (isConnected && messageId) {
        emit("togglePin", { messageId }, (ack: any) => {
          if (!ack?.success) {
            toast.error("Failed to toggle pin");
          }
        });
      }
    },
    [isConnected, emit]
  );

  // ── Start private connection ──

  const makeConnectionChatting = async (
    targetChatuserId: string,
    _uType: string,
    rName: string
  ) => {
    const response: any = await postData(
      "chat/talk/start/private",
      { chatuserId: targetChatuserId },
      apiHeader(false, 0)
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      const data = response.data.data;
      setActiveChat({
        talkId: data.talkId,
        receiverId: targetChatuserId,
        receiverName: rName,
        receiverType: "",
        talkType: "PRIVATE",
      });
      navigate(
        `/chats/?data=${encryptUrlData({
          talkId: data.talkId,
          receiverId: targetChatuserId,
          receiverName: rName,
          receiverType: "",
          talkType: "PRIVATE",
          talkName: "",
          isActive,
          isGroupAdmin,
        })}`
      );
    }
  };

  // ── Fetch group detail for member count ──

  const fetchGroupDetail = useCallback(
    async (id: string) => {
      const response: any = await postData(
        "chat/talk/group/detail",
        { id },
        apiHeader(false, 0)
      );
      if (
        String(response?.status) === "200" &&
        String(response?.data.status) === "200"
      ) {
        const data = response.data.data;
        setGroupMemberCount(data.members?.length || 0);
        setGroupMembers(data.members || []);
      }
    },
    []
  );

  // ── Switch chat when talkId changes ──

  useEffect(() => {
    setMessage("");
    setEditingMessageId(null);
    setIsEditing(false);
    setReplyMessage({});
    setReplyMessageId(null);
    setReplyAllMessageIds([]);
    setIsReply(false);

    // Reset group state
    setGroupMemberCount(0);
    setGroupMembers([]);
    setIsGroupSheetOpen(false);

    if (talkId) {
      switchChat(talkId);
    }
  }, [talkId, switchChat]);

  // Fetch group members when switching to a group chat
  useEffect(() => {
    if (talkId && talkType === "GROUP") {
      fetchGroupDetail(talkId);
    }
  }, [talkId, talkType, fetchGroupDetail]);

  // ── Deep-link: scroll to a specific message when arriving via encrypted URL ──
  // Fires once per (talkId, deepLinkMessageId) pair, after messages have loaded.
  // Clears the URL `?data=...` param and the store flag so a reload won't re-trigger.
  const deepLinkFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkMessageId || !talkId || messages.length === 0) return;
    const key = `${talkId}:${deepLinkMessageId}`;
    if (deepLinkFiredRef.current === key) return;
    deepLinkFiredRef.current = key;

    // Defer one tick so MessageList has rendered the current page.
    setTimeout(() => {
      messageListRef.current?.scrollToMessage(deepLinkMessageId);
    }, 50);

    // Clear `?data=...` from the address bar so reload doesn't repeat the jump.
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setDeepLinkMessageId(null);
  }, [deepLinkMessageId, talkId, messages.length, setDeepLinkMessageId]);

  // ── Edit/Reply handlers ──

  const startEditing = useCallback((msg: any) => {
    if (msg.messageId && msg.messageText) {
      setReplyMessageId(null);
      setReplyMessage({});
      setReplyAllMessageIds([]);
      setIsReply(false);
      setEditingMessageId(msg.messageId);
      setIsEditing(true);
      setMessage(unformatMentionsFromMessage(msg.messageText));
      setTimeout(() => messageInputRef.current?.focus(), 50);
    }
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setIsEditing(false);
    setMessage("");
  }, []);

  const startReply = useCallback((msg: any) => {

    logger.debug("startReply++++++++++",msg)

    if (msg.forwardFromMessageId) {
      setEditingMessageId(null);
      setIsEditing(false);
      setReplyAllMessageIds([]);
      setReplyMessageId(msg.messageId);
      setReplyMessage({
        ...msg.forwardMessage,
        senderName: msg.senderName,
      });
      setIsReply(true);
    } else if (msg.messageId) {
      setEditingMessageId(null);
      setIsEditing(false);
      setReplyAllMessageIds([]);
      setReplyMessageId(msg.messageId);
      setReplyMessage(msg);
      setIsReply(true);
    }
    // Delay focus until after React re-renders the reply UI
    setTimeout(() => messageInputRef.current?.focus(), 50);
  }, []);

  // Reply to every media item in a group — the typed message is sent
  // once per item (one-by-one over the socket) when the user hits send.
  const startReplyAll = useCallback((msgs: any[]) => {
    if (!msgs?.length) return;
    const ids = msgs.map((m: any) => m.messageId).filter(Boolean);
    if (ids.length === 0) return;
    setEditingMessageId(null);
    setIsEditing(false);
    setReplyMessageId(ids[0]);
    setReplyMessage(msgs[0]);
    setReplyAllMessageIds(ids);
    setIsReply(true);
    setTimeout(() => messageInputRef.current?.focus(), 50);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyMessageId(null);
    setReplyMessage({});
    setReplyAllMessageIds([]);
    setIsReply(false);
  }, []);

  const handleSendComplete = useCallback(() => {
    setMessage("");
    setEditingMessageId(null);
    setIsEditing(false);
    setReplyMessage({});
    setReplyMessageId(null);
    setReplyAllMessageIds([]);
    setIsReply(false);
    // Mark all unread messages as read when user sends a message
    messageListRef.current?.markAllAsRead();
    setTimeout(() => messageListRef.current?.scrollToBottom(), 100);
  }, []);

  const handleDraftLoaded = useCallback((draft: DraftState | null) => {
    if (draft) {
      if (draft.isEditing && draft.editingMessageId) {
        setEditingMessageId(draft.editingMessageId);
        setIsEditing(true);
      }
      if (draft.isReply && draft.replyMessageId) {
        setReplyMessageId(draft.replyMessageId);
        setReplyMessage(draft.replyMessage || {});
        setIsReply(true);
      }
    }
  }, []);

  // ── Message search handlers ──

  const searchMessages = useCallback(
    async (term: string) => {
      if (!term.trim() || !talkId) {
        setSearchResults([]);
        setCurrentSearchIndex(0);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const response: any = await postData(
          "chat/message/search",
          { talkId, term: term.trim() },
          apiHeader(false, 0)
        );
        if (
          String(response?.status) === "200" &&
          String(response?.data.status) === "200"
        ) {
          const results = response.data.data || [];
          setSearchResults(results);
          setCurrentSearchIndex(0);
          if (results.length > 0) {
            messageListRef.current?.scrollToMessage(results[0].messageId);
          }
        } else {
          setSearchResults([]);
          setCurrentSearchIndex(0);
        }
      } catch {
        setSearchResults([]);
        setCurrentSearchIndex(0);
      } finally {
        setIsSearching(false);
      }
    },
    [talkId]
  );

  const handleSearchTermChange = useCallback(
    (term: string) => {
      setSearchTerm(term);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        searchMessages(term);
      }, 400);
    },
    [searchMessages]
  );

  const handleSearchOpen = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchTerm("");
    setSearchResults([]);
    setCurrentSearchIndex(0);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  // Up arrow = go to older message (higher display number, higher array index)
  const handleSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    messageListRef.current?.scrollToMessage(searchResults[nextIndex].messageId);
  }, [searchResults, currentSearchIndex]);

  // Down arrow = go to newer message (lower display number, lower array index)
  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    messageListRef.current?.scrollToMessage(searchResults[prevIndex].messageId);
  }, [searchResults, currentSearchIndex]);

  // ── Keyboard shortcuts: Escape + Ctrl/Cmd+F ──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F (Windows/Linux) or Cmd+F (Mac) to open search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        if (!isSearchOpen && talkId) {
          handleSearchOpen();
        }
        return;
      }

      if (e.key === "Escape") {
        if (isSearchOpen) {
          handleSearchClose();
        } else if (isEditing) {
          cancelEditing();
        } else if (isReply) {
          cancelReply();
        } else if (isSelectionMode) {
          cancelSelection();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen, isEditing, isReply, isSelectionMode, talkId, handleSearchOpen, handleSearchClose, cancelEditing, cancelReply, cancelSelection]);

  // ── Back button (mobile) ──

  const handleBack = useCallback(() => {
    handleCreateGroupClose();
    setActiveChat({ talkId: "", receiverId: "", receiverType: "" });
    navigate("/chats/");
  }, [handleCreateGroupClose, setActiveChat, navigate]);

  // ── Stable callbacks ──

  const handleReply = useCallback((msg: any) => startReply(msg), [startReply]);
  const handleReplyAll = useCallback(
    (msgs: any[]) => startReplyAll(msgs),
    [startReplyAll]
  );
  const handleEdit = useCallback((msg: any) => startEditing(msg), [startEditing]);
  const handleDelete = useCallback(
    (id: string) => deleteMessage(id),
    [deleteMessage]
  );
  const handleSelect = useCallback(
    (msg: any) => toggleSelection(msg),
    [toggleSelection]
  );
  const handleSelectMultiple = useCallback(
    (msgs: any[]) => toggleSelectionMultiple(msgs),
    [toggleSelectionMultiple]
  );
  const handleEnterSelection = useCallback(
    (msg: any) => enterSelectionMode(msg),
    [enterSelectionMode]
  );
  const handleEnterSelectionMultiple = useCallback(
    (msgs: any[]) => enterSelectionModeMultiple(msgs),
    [enterSelectionModeMultiple]
  );
  const handleForwardSelected = useCallback(() => {
    const ids = selectedMessages
      .map((msg: any) => msg.forwardFromMessageId || msg.messageId)
      .filter(Boolean);
    if (ids.length > 0) {
      setForwardMessageIds(ids);
      setForwardOpen(true);
    }
  }, [selectedMessages]);

  const handleForward = useCallback((msg: any) => {
    const id = msg.forwardFromMessageId || msg.messageId;
    if (id) {
      setForwardMessageIds([id]);
      setForwardOpen(true);
    }
  }, []);

  const handleForwardMultiple = useCallback((msgs: any[]) => {
    const ids = msgs
      .map((m: any) => m.forwardFromMessageId || m.messageId)
      .filter(Boolean);
    if (ids.length > 0) {
      setForwardMessageIds(ids);
      setForwardOpen(true);
    }
  }, []);

  const handleMediaClickCb = useCallback(
    (mediaPath: string, mediaType: "image" | "video") =>
      handleMediaClick(mediaPath, mediaType),
    [handleMediaClick]
  );

  const handleDeleteAll = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => deleteMessage(id));
    },
    [deleteMessage]
  );

  // ── Render ──

  // If we have a receiverId but no talkId, show "Start Conversation" screen
  if (!talkId && receiverId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 chat-bg">
        <div className="relative animate-float">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <MessageSquare className="h-9 w-9 text-primary" strokeWidth={1.5} />
          </div>
          <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            Start a new conversation
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Say hello to {receiverName || "this user"}
          </p>
        </div>
        <button
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90"
          onClick={() =>
            makeConnectionChatting(receiverId, receiverType, receiverName)
          }
        >
          Start Conversation
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <ChatHeader
        receiverName={receiverName}
        receiverProfile={receiverProfile}
        talkName={talkName}
        talkProfile={talkProfile}
        talkType={talkType}
        isActive={isActive}
        isMobile={isMobile}
        isGroupAdmin={isGroupAdmin}
        groupMemberCount={groupMemberCount}
        isSelectionMode={isSelectionMode}
        selectedCount={selectedMessages.length}
        canDeleteSelected={canDeleteSelected}
        onBackClick={handleBack}
        onProfileClick={() => setIsGroupSheetOpen(true)}
        onCancelSelection={cancelSelection}
        onForwardSelected={handleForwardSelected}
        onDeleteSelected={() => setSelectionDeleteOpen(true)}
        isSearchOpen={isSearchOpen}
        searchTerm={searchTerm}
        onSearchTermChange={handleSearchTermChange}
        searchResultCount={searchResults.length}
        currentSearchIndex={currentSearchIndex}
        isSearching={isSearching}
        onSearchOpen={handleSearchOpen}
        onSearchClose={handleSearchClose}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onPinnedClick={() => setIsPinnedSheetOpen(true)}
        onMediaListClick={() => setIsMediaListOpen(true)}
      />

      {/* Message list */}
      <div
        className="relative min-h-0 flex-1"
        onDragOver={(e) => messageInputRef.current?.handleDragOver(e)}
        onDragEnter={(e) => messageInputRef.current?.handleDragEnter(e)}
        onDragLeave={(e) => messageInputRef.current?.handleDragLeave(e)}
        onDrop={(e) => messageInputRef.current?.handleDrop(e)}
      >
        <MessageList
          ref={messageListRef}
          talkId={talkId}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSelect={handleSelect}
          onSelectMultiple={handleSelectMultiple}
          onEnterSelectionMode={handleEnterSelection}
          onEnterSelectionModeMultiple={handleEnterSelectionMultiple}
          onForward={handleForward}
          onForwardMultiple={handleForwardMultiple}
          onMediaClick={handleMediaClickCb}
          onDeleteAll={handleDeleteAll}
          isSelectionMode={isSelectionMode}
          selectedMessages={selectedMessages}
          readMessagesApi={readMessagesApi}
          onToggleReaction={handleToggleReaction}
          onTogglePin={handleTogglePin}
        />
        <DragOverlay isVisible={isFileDragging} />
      </div>

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div className="flex items-center gap-2 px-4 pt-1.5 chat-bg"
        style={{backgroundImage:"none"}}
        >
          <div className="flex gap-[3px]">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-muted-foreground">
            {(() => {
              const names = Array.from(typingUsers.values());
              if (names.length === 1) return `${names[0]} is typing...`;
              if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
              return `${names[0]} and ${names.length - 1} others are typing...`;
            })()}
          </span>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        ref={messageInputRef}
        message={message}
        onMessageChange={setMessage}
        onSend={handleSendComplete}
        isEditing={isEditing}
        editingMessageId={editingMessageId}
        onCancelEdit={cancelEditing}
        isReply={isReply}
        replyMessage={replyMessage}
        replyMessageId={replyMessageId}
        replyAllMessageIds={replyAllMessageIds}
        onCancelReply={cancelReply}
        mentionMembers={groupMembers}
        emit={emit}
        isConnected={isConnected}
        talkId={talkId}
        talkType={talkType}
        onDraftLoaded={handleDraftLoaded}
        onFileDragChange={setIsFileDragging}
      />

      {/* Group management sheet */}
      {talkType === "GROUP" && (
        <GroupManagementSheet
          open={isGroupSheetOpen}
          onOpenChange={setIsGroupSheetOpen}
          talkId={talkId}
          talkName={talkName}
          talkProfile={talkProfile}
          isGroupAdmin={isGroupAdmin}
          onGroupUpdated={(data) => {
            if (data.talkName) {
              setActiveChat({ talkName: data.talkName });
              // Update sidebar userList with new group name
              setUserList((prev: any[]) =>
                prev.map((item: any) =>
                  item.talkId === talkId
                    ? { ...item, talkName: data.talkName }
                    : item
                )
              );
              // Update URL with new group name
              navigate(
                `/chats/?data=${encryptUrlData({
                  talkId,
                  receiverId,
                  receiverName,
                  receiverType,
                  talkType,
                  talkName: data.talkName,
                  isActive,
                  isGroupAdmin,
                })}`,
                { replace: true }
              );
            }
            if (data.members) {
              setGroupMembers(data.members);
              setGroupMemberCount(data.members.length);
            }
          }}
        />
      )}

      {/* Pinned messages sheet */}
      <PinnedMessagesSheet
        open={isPinnedSheetOpen}
        onOpenChange={setIsPinnedSheetOpen}
        talkId={talkId}
        onMessageClick={(messageId) => {
          messageListRef.current?.scrollToMessage(messageId);
        }}
      />

      {/* Media list sheet */}
      <MediaListSheet
        open={isMediaListOpen}
        onOpenChange={setIsMediaListOpen}
        talkId={talkId}
        onMediaClick={handleMediaClickFromList}
      />

      {/* Forward dialog */}
      <ForwardDialog
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        messageIds={forwardMessageIds}
        onForwarded={cancelSelection}
      />

      {/* Lightbox */}
      {openLightbox && (
        <Suspense fallback={null}>
          <Lightbox
            open={openLightbox}
            close={closeLightbox}
            slides={mediaSlides as any}
            index={currentIndex}
            plugins={[Video, Zoom]}
            carousel={{ finite: true }}
            on={{
              view: ({ index }: { index: number }) => setCurrentIndex(index),
            }}
            toolbar={{
              buttons: [
                <button
                  key="lightbox-download"
                  type="button"
                  className="yarl__button"
                  title="Download"
                  aria-label="Download"
                  onClick={async () => {
                    if (!currentSlide) return;
                    const url = currentSlide.mediaPath;
                    const fileName = currentSlide.mediaName || "download";
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
                  }}
                >
                  <Download className="h-6 w-6" />
                </button>,
                <button
                  key="lightbox-reply"
                  type="button"
                  className="yarl__button"
                  title="Reply"
                  aria-label="Reply"
                  onClick={() => {
                    if (!currentSlide) return;
                    handleReply(currentSlide);
                    closeLightbox();
                  }}
                >
                  <Reply className="h-6 w-6" />
                </button>,
                <button
                  key="lightbox-forward"
                  type="button"
                  className="yarl__button"
                  title="Forward"
                  aria-label="Forward"
                  onClick={() => {
                    if (!currentSlide) return;
                    const id = currentSlide.forwardFromMessageId || currentSlide.messageId;
                    if (id) {
                      setForwardMessageIds([id]);
                      setForwardOpen(true);
                      closeLightbox();
                    }
                  }}
                >
                  <Forward className="h-6 w-6" />
                </button>,
                <button
                  key="lightbox-pin"
                  type="button"
                  className="yarl__button"
                  title={currentSlide?.isPinned ? "Unpin" : "Pin"}
                  aria-label={currentSlide?.isPinned ? "Unpin" : "Pin"}
                  onClick={() => {
                    if (!currentSlide?.messageId) return;
                    handleTogglePin(currentSlide.messageId);
                  }}
                >
                  {currentSlide?.isPinned
                    ? <PinOff className="h-6 w-6" />
                    : <Pin className="h-6 w-6" />}
                </button>,
                // Only show delete for sender's own messages
                ...(currentSlide && String(currentSlide.senderChatuserId) === String(chatuserId)
                  ? [
                      <button
                        key="lightbox-delete"
                        type="button"
                        className="yarl__button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => setLightboxDeleteOpen(true)}
                      >
                        <Trash2 className="h-6 w-6" />
                      </button>,
                    ]
                  : []),
                "close",
              ],
            }}
          />
        </Suspense>
      )}

      {/* Lightbox delete confirmation */}
      <AlertDialog open={lightboxDeleteOpen} onOpenChange={setLightboxDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this media? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!currentSlide) return;
                deleteMessage(currentSlide.messageId);
                setLightboxDeleteOpen(false);
                if (mediaSlides.length <= 1) {
                  closeLightbox();
                } else {
                  setCurrentIndex((prev) =>
                    prev >= mediaSlides.length - 1 ? prev - 1 : prev
                  );
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Selection delete confirmation */}
      <AlertDialog open={selectionDeleteOpen} onOpenChange={setSelectionDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedMessages.length} message{selectedMessages.length > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected message{selectedMessages.length > 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                selectedMessages.forEach((msg: any) => {
                  if (msg.messageId) deleteMessage(msg.messageId);
                });
                setSelectionDeleteOpen(false);
                cancelSelection();
                toast.success(
                  `${selectedMessages.length} message${selectedMessages.length > 1 ? "s" : ""} deleted`
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
