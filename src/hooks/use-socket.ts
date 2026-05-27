import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import logger from "@/lib/logger";

// ── Talk socket hook ────────────────────────────────────────

interface UseTalkSocketOptions {
  baseUrl: string;
  talkId: string | null;
  talkType?: string | null;
  token: string | null;
  onNewMessage?: (data: any) => void;
  onMessageEdited?: (data: any) => void;
  onMessageDeleted?: (data: any) => void;
  onReadStatusUpdated?: (data: any) => void;
  onPresenceChanged?: (data: any) => void;
  onReactionToggled?: (data: any) => void;
  onPinToggled?: (data: any) => void;
  onUserTyping?: (data: any) => void;
  onUserStopTyping?: (data: any) => void;
  onConnect?: (isReconnect: boolean) => void;
}

export function useTalkSocket({
  baseUrl,
  talkId,
  talkType,
  token,
  onNewMessage,
  onMessageEdited,
  onMessageDeleted,
  onReadStatusUpdated,
  onPresenceChanged,
  onReactionToggled,
  onPinToggled,
  onUserTyping,
  onUserStopTyping,
  onConnect,
}: UseTalkSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const hadConnectedRef = useRef(false);

  // Keep latest callbacks in refs to avoid stale closures
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const onMessageEditedRef = useRef(onMessageEdited);
  onMessageEditedRef.current = onMessageEdited;
  const onMessageDeletedRef = useRef(onMessageDeleted);
  onMessageDeletedRef.current = onMessageDeleted;
  const onReadStatusUpdatedRef = useRef(onReadStatusUpdated);
  onReadStatusUpdatedRef.current = onReadStatusUpdated;
  const onPresenceChangedRef = useRef(onPresenceChanged);
  onPresenceChangedRef.current = onPresenceChanged;
  const onReactionToggledRef = useRef(onReactionToggled);
  onReactionToggledRef.current = onReactionToggled;
  const onPinToggledRef = useRef(onPinToggled);
  onPinToggledRef.current = onPinToggled;
  const onUserTypingRef = useRef(onUserTyping);
  onUserTypingRef.current = onUserTyping;
  const onUserStopTypingRef = useRef(onUserStopTyping);
  onUserStopTypingRef.current = onUserStopTyping;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  // talkType is NOT part of socket identity (not in query params),
  // so keep it in a ref to avoid tearing down the socket when it changes.
  const talkTypeRef = useRef(talkType);
  talkTypeRef.current = talkType;

  // Socket lifecycle — depends only on connection identity (baseUrl, talkId, token).
  useEffect(() => {
    if (!baseUrl || !talkId || !token) return;

    hadConnectedRef.current = false;

    const socket = io(`${baseUrl}/talk?talkId=${talkId}&token=${token}`, {
      path: "/socket.io/",
      query: { talkId, token },
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      const isReconnect = hadConnectedRef.current;
      hadConnectedRef.current = true;
      logger.debug(`Talk socket ${isReconnect ? "re" : ""}connected`);
      setIsConnected(true);
      if (talkTypeRef.current?.toUpperCase() === "PRIVATE") socket.emit("requestPresence", {});
      onConnectRef.current?.(isReconnect);
    });

    socket.on("disconnect", (reason) => {
      logger.warn("Talk socket disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      logger.error("Talk socket error:", error.message);
    });

    // Listen events
    socket.on("newMessage", (data) => onNewMessageRef.current?.(data));
    socket.on("messageEdited", (data) => onMessageEditedRef.current?.(data));
    socket.on("messageDeleted", (data) => onMessageDeletedRef.current?.(data));
    socket.on("readStatusUpdated", (data) => onReadStatusUpdatedRef.current?.(data));
    socket.on("presenceChanged", (data) => onPresenceChangedRef.current?.(data));
    socket.on("reactionToggled", (data) => onReactionToggledRef.current?.(data));
    socket.on("pinToggled", (data) => onPinToggledRef.current?.(data));
    socket.on("userTyping", (data) => onUserTypingRef.current?.(data));
    socket.on("userStopTyping", (data) => onUserStopTypingRef.current?.(data));

    // Request presence every 30s for private chats (reads latest talkType from ref)
    const presenceInterval = setInterval(() => {
      if (socket.connected && talkTypeRef.current?.toUpperCase() === "PRIVATE") {
        socket.emit("requestPresence", {});
      }
    }, 30000);

    return () => {
      clearInterval(presenceInterval);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [baseUrl, talkId, token]);

  const emit = useCallback(
    (event: string, data?: any, ack?: (response: any) => void) => {
      if (socketRef.current?.connected) {
        if (ack) {
          socketRef.current.emit(event, data, ack);
        } else {
          socketRef.current.emit(event, data);
        }
      }
    },
    []
  );

  return { emit, isConnected };
}

// ── Contact socket hook ─────────────────────────────────────

interface UseContactSocketOptions {
  baseUrl: string;
  token: string | null;
  onTalkUpdated?: (data: any) => void;
  onPresenceChanged?: (data: any) => void;
}

export function useContactSocket({
  baseUrl,
  token,
  onTalkUpdated,
  onPresenceChanged,
}: UseContactSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  const onTalkUpdatedRef = useRef(onTalkUpdated);
  onTalkUpdatedRef.current = onTalkUpdated;
  const onPresenceChangedRef = useRef(onPresenceChanged);
  onPresenceChangedRef.current = onPresenceChanged;

  useEffect(() => {
    if (!baseUrl || !token) return;

    const socket = io(`${baseUrl}/contact`, {
      path: "/socket.io/",
      query: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      logger.debug("Contact socket connected");
    });

    socket.on("disconnect", (reason) => {
      logger.warn("Contact socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      logger.error("Contact socket error:", error.message);
    });

    socket.on("talkUpdated", (data) => onTalkUpdatedRef.current?.(data));
    socket.on("presenceChanged", (data) => onPresenceChangedRef.current?.(data));

    const pingInterval = setInterval(() => {
      if (socket.connected) socket.emit("ping", {});
    }, 20000);

    return () => {
      clearInterval(pingInterval);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [baseUrl, token]);
}
