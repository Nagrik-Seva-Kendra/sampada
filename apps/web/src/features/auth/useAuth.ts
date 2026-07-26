import { useMutation } from "@tanstack/react-query";
import type {
  AcceptInviteInput,
  AuthResponse,
  EmployeeItem,
  EmployeeSignupInput,
  LoginInput,
  OrgSignupInput,
} from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/** POST /auth/login → stores token + user on success. `remember` is UI-only — never sent to the API. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, LoginInput & { remember?: boolean }>({
    mutationFn: async ({ remember: _remember, ...input }) => {
      try {
        return await api.post("auth/login", { json: input }).json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Invalid email or password."));
      }
    },
    onSuccess: (res, variables) => setSession(res.accessToken, res.refreshToken, res.user, variables.remember ?? true),
  });
}

/** Public: request a password-reset email; always resolves the same way regardless of match. */
export function useForgotPassword() {
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: async (login) => {
      try {
        return await api.post("auth/forgot-password", { json: { login } }).json<{ ok: true }>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Something went wrong — try again."));
      }
    },
  });
}

/** Public: create a new organization + its founding Owner, logged in immediately. */
export function useOrgSignup() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, OrgSignupInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("organizations/signup", { json: input }).json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Could not create the organization."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Public: onboarding — creates the account's organization directly, logged in immediately. */
export function useOnboard() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, OrgSignupInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("organizations/onboard", { json: input }).json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Could not create your account."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Public: accept an email invite (token from the link) — creates the account, logged in immediately. */
export function useAcceptInvite() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, AcceptInviteInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("invites/accept", { json: input }).json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "This invite link is invalid or has expired."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Public: confirm an ownership transfer via the emailed token link. No session change — the nominee already has an account. */
export function useAcceptOwnershipTransfer() {
  return useMutation<void, Error, string>({
    mutationFn: async (token) => {
      try {
        await api.post("ownership-transfers/accept", { json: { token } }).json();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "This ownership-transfer link is invalid or has expired."));
      }
    },
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
