import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const MAX_SELECTION = 20;

interface UseMessageSelectionOptions {
  talkId: string;
  chatuserId: string;
}

export default function useMessageSelection({
  talkId,
  chatuserId,
}: UseMessageSelectionOptions) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<any[]>([]);

  // Reset on talk change
  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedMessages([]);
  }, [talkId]);

  const toggleSelection = useCallback((messageObj: any) => {
    setSelectedMessages((prev) => {
      const exists = prev.find(
        (item: any) => item.messageId === messageObj.messageId
      );
      if (exists) {
        return prev.filter(
          (item: any) => item.messageId !== messageObj.messageId
        );
      }
      if (prev.length >= MAX_SELECTION) {
        toast.error(`You can select up to ${MAX_SELECTION} messages`);
        return prev;
      }
      return [...prev, messageObj];
    });
  }, []);

  const toggleSelectionMultiple = useCallback((messageObjs: any[]) => {
    setSelectedMessages((prev) => {
      const ids = new Set(messageObjs.map((m: any) => m.messageId));
      const allSelected = messageObjs.every((m: any) =>
        prev.some((p: any) => p.messageId === m.messageId)
      );
      if (allSelected) {
        return prev.filter((item: any) => !ids.has(item.messageId));
      }
      const newItems = messageObjs.filter(
        (m: any) => !prev.some((p: any) => p.messageId === m.messageId)
      );
      if (prev.length + newItems.length > MAX_SELECTION) {
        toast.error(`You can select up to ${MAX_SELECTION} messages`);
        return prev;
      }
      return [...prev, ...newItems];
    });
  }, []);

  const enterSelectionMode = useCallback((messageObj: any) => {
    setIsSelectionMode(true);
    setSelectedMessages([messageObj]);
  }, []);

  const enterSelectionModeMultiple = useCallback((messageObjs: any[]) => {
    setIsSelectionMode(true);
    setSelectedMessages(messageObjs.slice(0, MAX_SELECTION));
    if (messageObjs.length > MAX_SELECTION) {
      toast.error(`You can select up to ${MAX_SELECTION} messages`);
    }
  }, []);

  const cancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessages([]);
  }, []);

  const canDeleteSelected = selectedMessages.every(
    (msg: any) =>
      String(msg.senderChatuserId) === String(chatuserId)
  );

  return {
    isSelectionMode,
    selectedMessages,
    toggleSelection,
    toggleSelectionMultiple,
    enterSelectionMode,
    enterSelectionModeMultiple,
    cancelSelection,
    canDeleteSelected,
  };
}
