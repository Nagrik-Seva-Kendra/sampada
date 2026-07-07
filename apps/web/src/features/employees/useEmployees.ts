import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmployeeItem } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useRejectEmployee() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`employees/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

/** Admin: reveal the password an employee set at signup (fetched on demand, not preloaded with the list). */
export function useEmployeePassword() {
  const token = useAuthStore((s) => s.token);
  return useMutation<{ password: string }, Error, string>({
    mutationFn: (id) =>
      api.get(`employees/${id}/password`, { headers: authHeaders(token) }).json<{ password: string }>(),
  });
}
