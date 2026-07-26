import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUser } from "@sampada/shared";
import { queryClient } from "../lib/queryClient";

/**
 * "Keep me signed in" (checked by default): unchecked at login, the session
 * still works for the rest of the tab but isn't written to localStorage, so
 * it's gone the next time the browser opens. Module-level because it must be
 * set synchronously right before the `set()` call below triggers persist's
 * own `setItem` — there's no other hook point to intercept that write.
 */
let rememberSession = true;

const sessionAwareStorage = {
  getItem: (name: string) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
  setItem: (name: string, value: string) => {
    if (rememberSession) {
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      sessionStorage.setItem(name, value);
      localStorage.removeItem(name);
    }
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

/**
 * Admin auth session: JWT access token + user, persisted to localStorage (or
 * sessionStorage — see `rememberSession` above).
 * Privileged requests send `Authorization: Bearer <token>`.
 */
interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, refreshToken: string, user: AuthUser, remember?: boolean) => void;
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
      setSession: (token, refreshToken, user, remember = true) => {
        rememberSession = remember;
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
    { name: "nsk-auth", storage: createJSONStorage(() => sessionAwareStorage) },
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

/** The org the current session acts under (null only if the user has no active membership). */
export function useActiveOrganization() {
  return useAuthStore((s) => s.user?.activeOrganization ?? null);
}
