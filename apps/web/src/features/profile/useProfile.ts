import { useMutation } from "@tanstack/react-query";
import type { AuthResponse, UpdateProfileInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Employee self-edit: name/email/username/password. Reissues the session on success. */
export function useUpdateProfile() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, UpdateProfileInput>({
    mutationFn: (input) =>
      api
        .patch("profile", { headers: authHeaders(token), json: input })
        .json<AuthResponse>(),
    onSuccess: (res) => setSession(res.accessToken, res.user),
  });
}

/** Employee self-edit: replace profile photo. Reissues the session on success. */
export function useUploadProfilePhoto() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, File>({
    mutationFn: (file) => {
      const body = new FormData();
      body.append("file", file);
      return api.post("profile/photo", { headers: authHeaders(token), body }).json<AuthResponse>();
    },
    onSuccess: (res) => setSession(res.accessToken, res.user),
  });
}
