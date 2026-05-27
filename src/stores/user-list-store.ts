import { create } from 'zustand';
import { apiHeader, getData } from '@/lib/api-helper';

interface UserListStore {
  userList: any[];
  receiverData: any;
  isLoading: boolean;
  setUserList: (listOrUpdater: any[] | ((prev: any[]) => any[])) => void;
  setReceiverData: (data: any) => void;
  getUserList: () => Promise<void>;
  getUserProfile: (talkId: string) => Promise<any | null>;
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
