import { useMutation } from "@tanstack/react-query";
import type { AuthResponse, LoginInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/** POST /auth/login → stores token + user on success. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, LoginInput>({
    mutationFn: (input) =>
      api.post("auth/login", { json: input }).json<AuthResponse>(),
    onSuccess: (res) => setSession(res.accessToken, res.user),
  });
}
