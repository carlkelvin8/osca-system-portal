"use client";

import { create } from "zustand";
import { notificationsApi } from "@/lib/api";
import type { NotificationItem } from "@/types";

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  fetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  fetch: async () => {
    set({ loading: true });
    try {
      const { data } = await notificationsApi.list();
      set({
        notifications: data.items,
        unreadCount: data.unread_count,
      });
    } finally {
      set({ loading: false });
    }
  },
  markRead: async (id) => {
    await notificationsApi.markRead(id);
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },
  markAllRead: async () => {
    await notificationsApi.markAllRead();
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
  clear: () => set({ notifications: [], unreadCount: 0 }),
}));
