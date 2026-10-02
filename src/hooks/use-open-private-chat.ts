import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { encryptUrlData } from "@/lib/encryption";
import { useBroadcastStore } from "@/stores/broadcast-store";
import { useChatStore } from "@/stores/chat-store";
import { useUserListStore } from "@/stores/user-list-store";

interface PrivateChatTarget {
  talkId: string;
  chatuserId: number | string;
  userType?: string;
  name?: string;
  profile?: string | null;
}

/**
 * Open a 1:1 chat the same way a sidebar row does. Prefers the row already in
 * the chat list (it carries presence and the canonical names); falls back to
 * what the caller knows when the talk hasn't been loaded into the list yet.
 */
export function useOpenPrivateChat() {
  const navigate = useNavigate();
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  return useCallback(
    (target: PrivateChatTarget) => {
      const row = useUserListStore
        .getState()
        .userList.find((u: { talkId?: string }) => u.talkId === target.talkId);

      const data = {
        talkId: target.talkId,
        receiverId: String(row?.receiverId ?? target.chatuserId ?? ""),
        receiverName: row?.receiverName || target.name || "",
        receiverType: row?.receiverType || target.userType || "",
        receiverProfile: row?.receiverProfile || target.profile || "",
        talkType: row?.talkType || "PRIVATE",
        talkName: row?.talkName || target.name || "",
        talkProfile: row?.talkProfile || target.profile || "",
        isActive: !!row?.isActive,
        isGroupAdmin: false,
      };

      useBroadcastStore.getState().closeListChat();
      setActiveChat(data);
      navigate(
        `/chats/?data=${encryptUrlData({
          talkId: data.talkId,
          receiverId: data.receiverId,
          receiverName: data.receiverName,
          receiverType: data.receiverType,
          talkType: data.talkType,
          talkName: data.talkName,
          isActive: data.isActive,
          isGroupAdmin: false,
        })}`
      );
    },
    [navigate, setActiveChat]
  );
}
