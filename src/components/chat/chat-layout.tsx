import { useChatStore } from "@/stores/chat-store";
import useIsMobile from "@/hooks/use-is-mobile";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { EmptyState } from "@/components/chat/empty-state";
import { EventsSheet } from "@/components/events/events-sheet";
import { BroadcastSheet } from "@/components/broadcast/broadcast-sheet";
import { BroadcastChat } from "@/components/broadcast/broadcast-chat";
import { useBroadcastStore } from "@/stores/broadcast-store";

export function ChatLayout() {
  const isMobile = useIsMobile();
  const talkId = useChatStore((s) => s.activeChat.talkId);
  const receiverId = useChatStore((s) => s.activeChat.receiverId);
  const showChatArea = !!(talkId || receiverId);
  // An open broadcast list takes the main area, like a chat would.
  const showBroadcast = useBroadcastStore((s) => !!s.activeListId);

  // Mobile: show sidebar or chat area
  if (isMobile) {
    if (showBroadcast) {
      return (
        <div className="h-screen bg-background">
          <BroadcastChat />
          <EventsSheet />
          <BroadcastSheet />
        </div>
      );
    }
    if (showChatArea) {
      return (
        <div className="h-screen bg-background">
          <ChatArea />
          <EventsSheet />
          <BroadcastSheet />
        </div>
      );
    }
    return (
      <div className="h-screen overflow-hidden bg-background">
        <ChatSidebar />
        <EventsSheet />
        <BroadcastSheet />
      </div>
    );
  }

  // Desktop: sidebar + chat area
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="h-full w-[clamp(320px,26vw,400px)] shrink-0 overflow-hidden">
        <ChatSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {showBroadcast ? <BroadcastChat /> : showChatArea ? <ChatArea /> : <EmptyState />}
      </div>
      <EventsSheet />
      <BroadcastSheet />
    </div>
  );
}
