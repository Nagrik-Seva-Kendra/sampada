import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserInput, EmployeeItem, UpdateUserInput } from "@sampada/shared";
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

/** Admin: discontinue an employee's services (blocks login, keeps the record). */
export function useDeactivateEmployee() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, string>({
    mutationFn: (id) =>
      api.post(`employees/${id}/deactivate`, { headers: authHeaders(token) }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

/** Admin: restore a discontinued employee's access. */
export function useReactivateEmployee() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<EmployeeItem, Error, string>({
    mutationFn: (id) =>
      api.post(`employees/${id}/reactivate`, { headers: authHeaders(token) }).json<EmployeeItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

