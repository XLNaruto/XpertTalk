import { useRef, useEffect, useCallback, useState } from "react";
import logger from "@/lib/logger";

interface UseWebSocketOptions {
  url: string | null;
  onMessage: (data: any) => void;
  deps: any[];
  onOpen?: () => void;
  shouldReconnect?: boolean;
}

export default function useWebSocket({
  url,
  onMessage,
  deps,
  onOpen,
  shouldReconnect = true,
}: UseWebSocketOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for latest callback values to avoid stale closures
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const shouldReconnectRef = useRef(shouldReconnect);
  shouldReconnectRef.current = shouldReconnect;
  const urlRef = useRef(url);
  urlRef.current = url;

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;

    // Clean existing socket
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    const ws = new WebSocket(currentUrl);
    let heartbeatInterval: ReturnType<typeof setInterval>;

    ws.onopen = () => {
      logger.debug("WebSocket connected");
      socketRef.current = ws;
      reconnectAttempts.current = 0;
      setIsConnected(true);

      // Heartbeat every 10 seconds
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 10000);

      onOpenRef.current?.();
    };

    ws.onclose = (event) => {
      clearInterval(heartbeatInterval);
      setIsConnected(false);
      logger.warn("WebSocket closed", event);

      if (shouldReconnectRef.current) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts.current),
          30000
        );
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (error) => {
      logger.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "pong") return;
      onMessageRef.current(data);
    };
  }, []); // stable — reads everything from refs

  // Connect/reconnect when url or deps change
  useEffect(() => {
    if (!url) return;

    // Immediately nullify old socket so wsSend can't use it during transition
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
      setIsConnected(false);
    }

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    reconnectAttempts.current = 0;

    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  const send = useCallback((data: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  const reconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return { send, isConnected, reconnect };
}
