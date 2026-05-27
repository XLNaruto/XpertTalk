import { useChatStore } from "@/stores/chat-store";
import useIsMobile from "@/hooks/use-is-mobile";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { EmptyState } from "@/components/chat/empty-state";

export function ChatLayout() {
  const isMobile = useIsMobile();
  const talkId = useChatStore((s) => s.activeChat.talkId);
  const receiverId = useChatStore((s) => s.activeChat.receiverId);
  const showChatArea = !!(talkId || receiverId);

  // Mobile: show sidebar or chat area
  if (isMobile) {
    if (showChatArea) {
      return (
        <div className="h-screen bg-background">
          <ChatArea />
        </div>
      );
    }
    return (
      <div className="h-screen overflow-hidden bg-background">
        <ChatSidebar />
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
        {showChatArea ? <ChatArea /> : <EmptyState />}
      </div>
    </div>
  );
}
