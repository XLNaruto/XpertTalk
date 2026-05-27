import { create } from 'zustand';

interface UIStore {
  isModalOpen: boolean;
  createGroupShow: boolean;
  closeSearchOnMsg: boolean;

  setIsModalOpen: (val: boolean) => void;
  setCreateGroupShow: (val: boolean) => void;
  setCloseSearchOnMsg: (val: boolean) => void;
  openModal: () => void;
  closeModal: () => void;
  handleCreateGroupShow: () => void;
  handleCreateGroupClose: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isModalOpen: false,
  createGroupShow: false,
  closeSearchOnMsg: false,

  setIsModalOpen: (val) => set({ isModalOpen: val }),
  setCreateGroupShow: (val) => set({ createGroupShow: val }),
  setCloseSearchOnMsg: (val) => set({ closeSearchOnMsg: val }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  handleCreateGroupShow: () => set({ createGroupShow: true }),
  handleCreateGroupClose: () => set({ createGroupShow: false }),
}));
