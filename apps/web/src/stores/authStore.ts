import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@sampada/shared";
import { queryClient } from "../lib/queryClient";

/**
 * Admin auth session: JWT access token + user, persisted to localStorage.
 * Privileged requests send `Authorization: Bearer <token>`.
 */
interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, refreshToken: string, user: AuthUser) => void;
  /** Swap in a rotated token pair after a silent refresh (keeps cached queries). */
  setTokens: (token: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setSession: (token, refreshToken, user) => {
        queryClient.clear();
        set({ token, refreshToken, user });
      },
      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
      },
      logout: () => {
        queryClient.clear();
        set({ token: null, refreshToken: null, user: null });
      },
    }),
    { name: "nsk-auth" },
  ),
);

/** Header object for authenticated requests (empty when logged out). */
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when signed in as EMPLOYEE or ADMIN — gates the Deeds section. */
export function useIsStaff(): boolean {
  const user = useAuthStore((s) => s.user);
  return !!user && (user.role === "ADMIN" || user.role === "EMPLOYEE");
}

/** EMPLOYEE can view/edit/create/print every deed but never delete one. */
export function useCanDeleteDeeds(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN";
}
