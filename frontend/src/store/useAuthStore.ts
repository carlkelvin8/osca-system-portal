"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(email, password);

          Cookies.set("access_token", data.access_token, {
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            expires: 1 / 96,
          });
          Cookies.set("refresh_token", data.refresh_token, {
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            expires: 7,
          });

          const { data: user } = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
        } finally {
          Cookies.remove("access_token");
          Cookies.remove("refresh_token");
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      fetchCurrentUser: async () => {
        const token = Cookies.get("access_token");
        if (!token) {
          set({ isAuthenticated: false, user: null, isLoading: false });
          return;
        }
        set({ isLoading: true });
        try {
          const { data: user } = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          Cookies.remove("access_token");
          Cookies.remove("refresh_token");
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "osca-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
