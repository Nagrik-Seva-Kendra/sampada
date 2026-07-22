import { useMutation } from "@tanstack/react-query";
import type { AuthResponse, EmployeeItem, EmployeeSignupInput, LoginInput } from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/** POST /auth/login → stores token + user on success. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, LoginInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("auth/login", { json: input }).json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Invalid email or password."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Public: employee self-signup. Account stays PENDING until the admin approves it. */
export function useEmployeeSignup() {
  return useMutation<EmployeeItem, Error, EmployeeSignupInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("employees/signup", { json: input }).json<EmployeeItem>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Signup failed — that email may already be registered."));
      }
    },
  });
}

/** Public: email a 6-digit verification code (used before signup). */
export function useSendEmailOtp() {
  return useMutation<{ sent: true }, Error, string>({
    mutationFn: (email) =>
      api.post("otp/send-email", { json: { email } }).json<{ sent: true }>(),
  });
}

/** Public: check a received code ahead of final signup (does not consume it). */
export function useVerifyEmailOtp() {
  return useMutation<{ verified: true }, Error, { email: string; code: string }>({
    mutationFn: (input) =>
      api.post("otp/verify-email", { json: input }).json<{ verified: true }>(),
  });
}
