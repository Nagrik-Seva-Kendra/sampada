import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateInviteInput,
  CreateOwnershipTransferInput,
  CreateUserInput,
  EmployeeItem,
  InviteItem,
  InviteLink,
  OwnershipTransferItem,
  OwnershipTransferLink,
  PasswordResetLink,
  UpdateUserInput,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Admin: active (already-approved) employees. */
export function useEmployeesList() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["employees"],
    enabled: !!token && isAdmin,
    queryFn: () => api.get("employees", { headers: authHeaders(token) }).json<EmployeeItem[]>(),
  });
}

/** Admin: every approved staff account (employees + admins) — the "User Management" directory. */
export function useStaffList() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["staff"],
    enabled: !!token && isAdmin,
    queryFn: () => api.get("users", { headers: authHeaders(token) }).json<EmployeeItem[]>(),
  });
}

/** Admin: create a new employee or admin account (immediately active). */
export function useCreateUser() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, CreateUserInput>({
    mutationFn: (input) =>
      api.post("users", { headers: authHeaders(token), json: input }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/** Admin: edit a staff account's details / role / password. */
export function useUpdateUser() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, { id: string; input: UpdateUserInput }>({
    mutationFn: ({ id, input }) =>
      api.patch(`users/${id}`, { headers: authHeaders(token), json: input }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/** Admin: employee signups awaiting approval. */
export function usePendingEmployees() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["employees", "pending"],
    enabled: !!token && isAdmin,
    queryFn: () =>
      api.get("employees/pending", { headers: authHeaders(token) }).json<EmployeeItem[]>(),
  });
}

export function useApproveEmployee() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, string>({
    mutationFn: (id) =>
      api.post(`employees/${id}/approve`, { headers: authHeaders(token) }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

export function useRejectEmployee() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`employees/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

/** Admin: discontinue any staff member's services — employee or admin (blocks login, keeps the record). */
export function useDeactivateUser() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, string>({
    mutationFn: (id) =>
      api.post(`users/${id}/deactivate`, { headers: authHeaders(token) }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

/** Admin: restore a discontinued staff member's access. */
export function useReactivateUser() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, string>({
    mutationFn: (id) =>
      api.post(`users/${id}/reactivate`, { headers: authHeaders(token) }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}


/** Admin: mint a single-use, 1-hour password reset link for a staff member. */
export function useSendResetLink() {
  const token = useAuthStore((s) => s.token);
  return useMutation<PasswordResetLink, Error, string>({
    mutationFn: (id) =>
      api.post(`employees/${id}/reset-link`, { headers: authHeaders(token) }).json<PasswordResetLink>(),
  });
}

/** Admin/owner: live (unused, unrevoked) invites for the org. */
export function useInvites() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["invites"],
    enabled: !!token && isAdmin,
    queryFn: () => api.get("invites", { headers: authHeaders(token) }).json<InviteItem[]>(),
  });
}

/** Admin/owner: invite someone by email to join the org with a chosen role. */
export function useCreateInvite() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<InviteLink, Error, CreateInviteInput>({
    mutationFn: (input) =>
      api.post("invites", { headers: authHeaders(token), json: input }).json<InviteLink>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
}

/** Admin/owner: cancel a live invite early. */
export function useRevokeInvite() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`invites/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
}

/** Owner-only (server-enforced): live (unconfirmed, uncancelled) ownership transfers for the org. */
export function useOwnershipTransfers() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["ownership-transfers"],
    enabled: !!token && isAdmin,
    queryFn: () => api.get("ownership-transfers", { headers: authHeaders(token) }).json<OwnershipTransferItem[]>(),
  });
}

/** Owner-only (server-enforced): nominate an existing active admin as the new owner. */
export function useCreateOwnershipTransfer() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<OwnershipTransferLink, Error, CreateOwnershipTransferInput>({
    mutationFn: (input) =>
      api.post("ownership-transfers", { headers: authHeaders(token), json: input }).json<OwnershipTransferLink>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ownership-transfers"] }),
  });
}

/** Owner-only (server-enforced): cancel a live ownership transfer early. */
export function useCancelOwnershipTransfer() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`ownership-transfers/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ownership-transfers"] }),
  });
}
