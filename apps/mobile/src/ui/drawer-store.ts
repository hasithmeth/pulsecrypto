import { create } from 'zustand';

interface DrawerStore {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  isOpen: false,
  open: () => {
    set({ isOpen: true });
  },
  close: () => {
    set({ isOpen: false });
  },
}));
