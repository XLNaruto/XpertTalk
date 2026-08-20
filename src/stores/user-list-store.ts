import { create } from 'zustand';
import { apiHeader, getData, postData } from '@/lib/api-helper';
import logger from '@/lib/logger';

interface UserListStore {
  userList: any[];
  receiverData: any;
  isLoading: boolean;
  setUserList: (listOrUpdater: any[] | ((prev: any[]) => any[])) => void;
  setReceiverData: (data: any) => void;
  getUserList: () => Promise<void>;
  getUserProfile: (talkId: string) => Promise<any | null>;
  /**
   * Mute or unmute a talk. Lives in the store so the sidebar and the chat
   * header share one implementation and one optimistic update. Resolves false
   * when the server refuses (mute is admin-only), after rolling the row back.
   */
  toggleMute: (talkId: string, isMuted: boolean, muteUntil?: string | null) => Promise<boolean>;
  applyPresence: (statuses: { chatuserId: number | string; isActive: boolean }[]) => void;
}

// userStage removed — endpoints now use common prefix

export const useUserListStore = create<UserListStore>((set, get) => ({
  userList: [],
  receiverData: {},
  isLoading: true,
  setUserList: (listOrUpdater) => set((state) => ({
    userList: typeof listOrUpdater === 'function' ? listOrUpdater(state.userList) : listOrUpdater,
  })),
  setReceiverData: (data) => set({ receiverData: data }),

  getUserList: async () => {
    const response: any = await getData(
      'chat/talk/list', {}, apiHeader(false, 0)
    );
    if (String(response?.status) === '200' && String(response?.data.status) === '200') {
      const data = response.data.data;
      set({ userList: data, isLoading: false });
      if (data.length > 0 && !get().receiverData?.talkId) {
        set({ receiverData: data[0] });
      }
    } else {
      set({ isLoading: false });
    }
  },

  applyPresence: (statuses) => set((state) => {
    if (!statuses?.length) return {};
    const statusMap = new Map(statuses.map((s) => [String(s.chatuserId), s.isActive]));
    let changed = false;
    const next = state.userList.map((u) => {
      if (u.talkType === 'PRIVATE' && statusMap.has(String(u.receiverId))) {
        const active = statusMap.get(String(u.receiverId));
        if (u.isActive !== active) {
          changed = true;
          return { ...u, isActive: active };
        }
      }
      return u;
    });
    return changed ? { userList: next } : {};
  }),

  toggleMute: async (talkId, isMuted, muteUntil = null) => {
    if (!talkId) return false;
    const previous = get().userList.find((u: any) => u.talkId === talkId);

    // Optimistic — the toggle should feel instant in the list and the header.
    set((state) => ({
      userList: state.userList.map((u: any) =>
        u.talkId === talkId ? { ...u, isMuted, muteUntil: isMuted ? muteUntil : null } : u
      ),
    }));

    try {
      const response: any = await postData(
        'chat/talk/mute',
        { id: talkId, isMuted, ...(isMuted ? { muteUntil } : {}) },
        apiHeader(false, 0)
      );
      if (String(response?.status) === '200' && String(response?.data?.status) === '200') {
        return true;
      }
      logger.warn('toggleMute rejected:', response?.data?.message);
    } catch (error) {
      logger.error('toggleMute failed:', error);
    }

    // Roll back to exactly what the row held before.
    set((state) => ({
      userList: state.userList.map((u: any) =>
        u.talkId === talkId
          ? { ...u, isMuted: previous?.isMuted ?? false, muteUntil: previous?.muteUntil ?? null }
          : u
      ),
    }));
    return false;
  },

  getUserProfile: async (talkId: string) => {
    const response: any = await getData(
      'chat/talk/list', {}, apiHeader(false, 0)
    );
    if (String(response?.status) === '200' && String(response?.data.status) === '200') {
      const data = response.data.data;
      return data.find((item: any) => item.talkId === talkId) || null;
    }
    return null;
  },
}));
