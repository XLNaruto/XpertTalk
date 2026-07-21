import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useUserListStore } from "@/stores/user-list-store";
import useIsMobile from "@/hooks/use-is-mobile";
import { ChatLayout } from "@/components/chat/chat-layout";
import { useNavigate, useLocation } from "react-router-dom";
import {
  decryptUrlData,
  encryptUrlData,
} from "@/lib/encryption";
import { apiHeader, postData } from "@/lib/api-helper";
import logger from "@/lib/logger";
import { Bell, X } from "lucide-react";

// userStage removed — endpoints now use common prefix

// FCM payload `data` fields arrive as strings ("true"/"false"); normalize the
// boolean flags so downstream `|| false` logic doesn't treat "false" as truthy.
function normalizeNotifData(data: any) {
  if (!data || typeof data !== "object") return {};
  const out: any = { ...data };
  if ("isActive" in out) out.isActive = out.isActive === true || out.isActive === "true";
  if ("isGroupAdmin" in out)
    out.isGroupAdmin = out.isGroupAdmin === true || out.isGroupAdmin === "true";
  return out;
}

// Decode the SW notification deep-link param (`fcm` = base64-encoded JSON).
function decodeFcmParam(raw: string | null) {
  if (!raw) return {};
  try {
    const bin = atob(decodeURIComponent(raw));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeNotifData(JSON.parse(json));
  } catch {
    return {};
  }
}

function InitChat() {
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const setDeepLinkMessageId = useChatStore((s) => s.setDeepLinkMessageId);
  const talkIdState = useChatStore((s) => s.activeChat.talkId);
  const { getUserList, receiverData } = useUserListStore();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  const [showNotifBanner, setShowNotifBanner] = useState(false);

  // URL params — read reactively via useLocation so that in-app navigation
  // (e.g. a notification click posting OPEN_CHAT) re-feeds these values and the
  // hydration effects below stay in sync instead of clobbering with stale data.
  const queryParams = new URLSearchParams(location.search);
  const decryptedData: any = decryptUrlData(queryParams.get("data"));
  // Notification deep-link: SW passes the FCM payload as base64 JSON in `fcm`.
  // Merged on top of the encrypted `data` param (only one is present normally).
  const fcmData: any = decodeFcmParam(queryParams.get("fcm"));
  const mergedData = { ...(decryptedData || {}), ...(fcmData || {}) };
  if (queryParams.get("fcm")) {
    logger.info("[fcm deep-link] decoded:", fcmData);
    logger.info("[fcm deep-link] merged:", mergedData);
  }
  const {
    talkId: urlTalkId,
    receiverId: urlReceiverId,
    receiverName: urlReceiverName,
    receiverType: urlReceiverType,
    talkType: urlTalkType,
    talkName: urlTalkName,
    isActive: urlIsActive,
    isGroupAdmin: urlIsGroupAdmin,
    messageId: urlMessageId,
  } = mergedData;

  // Stash deep-link target messageId — chat-area picks it up after messages load.
  useEffect(() => {
    if (urlMessageId) setDeepLinkMessageId(String(urlMessageId));
  }, [urlMessageId, setDeepLinkMessageId]);

  // Fetch user list on mount and when layout changes
  useEffect(() => {
    getUserList();
  }, [isMobile]);

  // Set talkId from URL or receiverData
  useEffect(() => {
    if (urlTalkId || urlReceiverId) {
      setActiveChat({ talkId: urlTalkId || "" });
    } else {
      if (!isMobile) {
        setActiveChat({ talkId: receiverData?.talkId || "" });
      } else {
        setActiveChat({ talkId: "", receiverId: "", receiverType: "" });
      }
    }
  }, [urlTalkId, receiverData?.talkId, isMobile]);

  // Sync receiverData → activeChat when no URL params
  useEffect(() => {
    if (
      !urlReceiverId &&
      !urlReceiverName &&
      !urlReceiverType &&
      !urlTalkType &&
      !urlTalkName
    ) {
      setActiveChat({
        receiverName: receiverData?.receiverName || "",
        receiverProfile: receiverData?.receiverProfile || "",
        talkType: receiverData?.talkType || "",
        talkName: receiverData?.talkName || "",
        talkProfile: receiverData?.talkProfile || "",
        isActive: receiverData?.isActive || false,
        isGroupAdmin: receiverData?.isGroupAdmin || false,
      });
      if (!isMobile) {
        setActiveChat({
          receiverId: receiverData?.receiverId || "",
          receiverType: receiverData?.receiverType || "",
        });
      } else {
        setActiveChat({ receiverId: "", receiverType: "" });
      }
    }
  }, [receiverData]);

  // Set activeChat from URL params
  useEffect(() => {
    if (urlReceiverName) setActiveChat({ receiverName: urlReceiverName });
    if (urlReceiverId) setActiveChat({ receiverId: urlReceiverId });
    if (urlReceiverType) setActiveChat({ receiverType: urlReceiverType });
    if (urlTalkType) setActiveChat({ talkType: urlTalkType });
    if (urlTalkName) setActiveChat({ talkName: urlTalkName });
    setActiveChat({
      isActive: urlIsActive || false,
      isGroupAdmin: urlIsGroupAdmin || false,
    });
  }, [
    urlReceiverId,
    urlReceiverName,
    urlReceiverType,
    urlTalkType,
    urlTalkName,
    urlIsActive,
    urlIsGroupAdmin,
  ]);

  // Sync profile from already-fetched userList when talkId changes
  const userList = useUserListStore((s) => s.userList);
  useEffect(() => {
    if (!talkIdState) return;
    const matched = userList.find(
      (item: any) => item.talkId === talkIdState
    );
    if (matched) {
      if (matched.talkType === "PRIVATE") {
        setActiveChat({ receiverProfile: matched.receiverProfile });
      }
      if (matched.talkType === "GROUP") {
        setActiveChat({ talkProfile: matched.talkProfile });
      }
    }
  }, [talkIdState, userList]);

  // ── Firebase notification setup ──

  const addFCMToken = async (token: string) => {
    const response: any = await postData(
      "auth/fcm/save",
      { token, platform: "WEB" },
      apiHeader(false, 0)
    );

    if (
      !(
        String(response?.status) === "200" &&
        String(response?.data.status) === "200"
      )
    ) {
      logger.error("API Error:", response?.data?.message || "Unknown error");
    }
  };

  // Deletes Firebase's IndexedDB stores. A newer Firebase build on this origin
  // can leave `firebase-messaging-database` at a higher schema version than the
  // one this app's SDK requests, which then throws
  // "VersionError: The requested version (1) is less than the existing version (2)".
  // Removing the stale DBs lets getToken re-create them at the expected version.
  const deleteFirebaseIDB = () =>
    Promise.all(
      ["firebase-messaging-database", "firebase-installations-database"].map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          })
      )
    );

  const generateFCMToken = async (swReady: ServiceWorkerRegistration) => {
    const { messaging } = await import("@/lib/firebase");
    const { getToken } = await import("firebase/messaging");
    return getToken(messaging, {
      vapidKey:
        "BFog9fo16WkUfO37C9jJZB8l0TfN2tVxNY-Y3Mry-7SzXSbsAMOHvN4ZONHX2DErzLI8JuU7ijhm9teY7nY9dP8",
      serviceWorkerRegistration: swReady,
    });
  };

  const saveFCM = async () => {
    try {
      logger.debug("saveFCM: starting...");

      if (!("serviceWorker" in navigator)) {
        logger.error("saveFCM: Service Worker not supported");
        return;
      }

      // Wait for SW with timeout — in dev mode SW may not be registered
      const swReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      if (!swReady) {
        logger.error("saveFCM: Service Worker not ready (timeout)");
        return;
      }

      let token: string;
      try {
        token = await generateFCMToken(swReady);
      } catch (error) {
        // Self-heal the stale-schema VersionError by clearing Firebase's IDB
        // and retrying once.
        if ((error as Error)?.name === "VersionError") {
          logger.debug("saveFCM: stale Firebase IDB, clearing and retrying...");
          await deleteFirebaseIDB();
          token = await generateFCMToken(swReady);
        } else {
          throw error;
        }
      }

      logger.debug("saveFCM: token generated", token);
      addFCMToken(token);
    } catch (error) {
      logger.error("Error generating FCM token:", error);
    }
  };

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      saveFCM();
    } else if (Notification.permission !== "denied") {
      setShowNotifBanner(true);
    }

    // Listen for permission changes (e.g. user allows from browser UI)
    navigator.permissions?.query({ name: "notifications" }).then((status) => {
      status.onchange = () => {
        if (status.state === "granted") {
          setShowNotifBanner(false);
          saveFCM();
        } else if (status.state === "denied") {
          setShowNotifBanner(false);
        }
      };
    });
  }, []);

  // Foreground push notification handler
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { messaging } = await import("@/lib/firebase");
        const { onMessage } = await import("firebase/messaging");
        unsubscribe = onMessage(messaging, (payload) => {
          const data = payload.data || payload.notification || {};
          if (data.title || data.body) {
            logger.debug(`${data.title || "New Message"}: ${data.body || ""}`);
          }
        });
      } catch {
        // Firebase not available
      }
    })();
    return () => unsubscribe?.();
  }, []);

  // Notification click on an already-open app: the SW posts OPEN_CHAT and we
  // switch the active chat in place (no reload).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "OPEN_CHAT") return;
      const d = normalizeNotifData(event.data.data);
      logger.info("[OPEN_CHAT] raw:", event.data.data);
      logger.info("[OPEN_CHAT] normalized:", d);
      const chat = {
        talkId: d.talkId || "",
        receiverId: d.receiverId || "",
        receiverType: d.receiverType || "",
        receiverName: d.receiverName || "",
        talkType: d.talkType || "",
        talkName: d.talkName || "",
        isActive: d.isActive || false,
        isGroupAdmin: d.isGroupAdmin || false,
      };
      setActiveChat(chat);
      if (d.messageId) setDeepLinkMessageId(String(d.messageId));
      // Sync the URL to the selected chat. Because URL params are now read via
      // useLocation, this re-runs the hydration effects with the correct chat
      // instead of letting a stale `data`/`fcm` param revert the selection.
      navigate(`/chats/?data=${encryptUrlData(chat)}`, { replace: true });
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [setActiveChat, setDeepLinkMessageId, navigate]);

  // Window focus/blur + visibility change listeners
  useEffect(() => {
    const onFocus = () => useChatStore.getState().setWindowFocused(true);
    const onBlur = () => useChatStore.getState().setWindowFocused(false);
    const onVisChange = () => {
      useChatStore.getState().setWindowFocused(!document.hidden);
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisChange);

    // Linux fallback: poll document.hasFocus() every 2s
    const pollInterval = setInterval(() => {
      const isFocused = document.hasFocus();
      const storeValue = useChatStore.getState().isWindowFocused;
      if (isFocused !== storeValue) {
        useChatStore.getState().setWindowFocused(isFocused);
      }
    }, 2000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisChange);
      clearInterval(pollInterval);
    };
  }, []);

  const handleEnableNotifications = async () => {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      saveFCM();
    }
    setShowNotifBanner(false);
  };

  return showNotifBanner ? (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
      <div className="flex items-center gap-2.5">
        <Bell className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">
          Enable notifications to stay updated with new messages
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleEnableNotifications}
          className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-white/30"
        >
          Enable
        </button>
        <button
          onClick={() => setShowNotifBanner(false)}
          className="rounded-md p-1 transition-colors hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  ) : null;
}

export default function ChatPage() {
  return (
    <>
      <InitChat />
      <ChatLayout />
    </>
  );
}
