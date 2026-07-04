import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@sampada/shared";

/**
 * Admin auth session: JWT access token + user, persisted to localStorage.
 * Privileged requests send `Authorization: Bearer <token>`.
 */
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "nsk-auth" },
  ),
);

/** Header object for authenticated requests (empty when logged out). */
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
