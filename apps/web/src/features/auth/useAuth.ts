import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AcceptInviteInput,
  AuthResponse,
  CreateOrganizationInput,
  EmployeeItem,
  EmployeeSignupInput,
  LoginInput,
  OrganizationSummary,
  OrgSignupInput,
} from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

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

/** Authenticated: create an ADDITIONAL org for the current user; auto-switches into it. */
export function useCreateOrganization() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, CreateOrganizationInput>({
    mutationFn: async (input) => {
      try {
        return await api
          .post("organizations", { headers: authHeaders(token), json: input })
          .json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Could not create the organization."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Authenticated: switch which org the session acts under — just mints a new session. */
export function useSwitchOrganization() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation<AuthResponse, Error, string>({
    mutationFn: async (organizationId) => {
      try {
        return await api
          .post("organizations/switch", { headers: authHeaders(token), json: { organizationId } })
          .json<AuthResponse>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Could not switch workspace."));
      }
    },
    onSuccess: (res) => setSession(res.accessToken, res.refreshToken, res.user),
  });
}

/** Authenticated: every org the current user actively belongs to (workspace switcher). */
export function useMyOrganizations() {
  const token = useAuthStore((s) => s.token);
  return useQuery<OrganizationSummary[]>({
    queryKey: ["organizations", "mine"],
    queryFn: () => api.get("organizations/mine", { headers: authHeaders(token) }).json<OrganizationSummary[]>(),
    enabled: !!token,
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
