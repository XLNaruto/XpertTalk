import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useUserListStore } from "@/stores/user-list-store";
import useIsMobile from "@/hooks/use-is-mobile";
import { ChatLayout } from "@/components/chat/chat-layout";
import {
  decryptUrlData,
} from "@/lib/encryption";
import { apiHeader, postData } from "@/lib/api-helper";
import logger from "@/lib/logger";
import { Bell, X } from "lucide-react";

// userStage removed — endpoints now use common prefix

function InitChat() {
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const setDeepLinkMessageId = useChatStore((s) => s.setDeepLinkMessageId);
  const talkIdState = useChatStore((s) => s.activeChat.talkId);
  const { getUserList, receiverData } = useUserListStore();
  const isMobile = useIsMobile();

  const [showNotifBanner, setShowNotifBanner] = useState(false);

  // URL params
  const queryParams = new URLSearchParams(location.search);
  const decryptedData: any = decryptUrlData(queryParams.get("data"));
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
  } = decryptedData || {};

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

      const { messaging } = await import("@/lib/firebase");
      const { getToken } = await import("firebase/messaging");
      const token = await getToken(messaging, {
        vapidKey:
          "BFog9fo16WkUfO37C9jJZB8l0TfN2tVxNY-Y3Mry-7SzXSbsAMOHvN4ZONHX2DErzLI8JuU7ijhm9teY7nY9dP8",
        serviceWorkerRegistration: swReady,
      });
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
