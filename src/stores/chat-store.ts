import { create } from 'zustand';

interface ActiveChat {
  talkId: string;
  receiverId: string;
  receiverType: string;
  receiverName: string;
  receiverProfile: string;
  talkType: string;
  talkName: string;
  talkProfile: string;
  isActive: boolean;
  isGroupAdmin: boolean;
}

interface ChatStore {
  // Config
  WS_URL: string;

  // Active chat
  activeChat: ActiveChat;
  setActiveChat: (data: Partial<ActiveChat>) => void;
  clearActiveChat: () => void;

  // Window focus
  isWindowFocused: boolean;
  setWindowFocused: (val: boolean) => void;

  // Deep-link target message (from encrypted URL `data.messageId`).
  // Set by chat-page on mount; consumed and cleared by chat-area after scroll.
  deepLinkMessageId: string | null;
  setDeepLinkMessageId: (id: string | null) => void;
}

const DEFAULT_CHAT: ActiveChat = {
  talkId: '', receiverId: '', receiverType: '', receiverName: '',
  receiverProfile: '', talkType: '', talkName: '', talkProfile: '',
  isActive: false, isGroupAdmin: false,
};

const appStage = import.meta.env.VITE_APP_STAGE || 'development';
const WS_URL = import.meta.env[`VITE_APP_${appStage.toUpperCase()}_SOCKET_URL`] || '';

export const useChatStore = create<ChatStore>((set) => ({
  WS_URL,
  activeChat: DEFAULT_CHAT,
  setActiveChat: (data) => set((state) => ({
    activeChat: { ...state.activeChat, ...data },
  })),
  clearActiveChat: () => set({ activeChat: DEFAULT_CHAT }),
  isWindowFocused: true,
  setWindowFocused: (val) => set({ isWindowFocused: val }),
  deepLinkMessageId: null,
  setDeepLinkMessageId: (id) => set({ deepLinkMessageId: id }),
}));

export type { ActiveChat };
