import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskCreateInput, TaskItem, TaskList, TaskUpdateInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** The task's file needs the auth header: fetch it and hand back a blob URL (caller revokes it). */
export function useTaskDocumentOpener() {
  const token = useAuthStore((s) => s.token);
  return (id: string) =>
    api
      .get(`tasks/${id}/document`, { headers: authHeaders(token), searchParams: { view: "1" } })
      .blob()
      .then((b) => URL.createObjectURL(b));
}

export function useTasks(assigneeId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["tasks", assigneeId],
    enabled: !!token,
    refetchInterval: 60_000,
    queryFn: () =>
      api.get("tasks", { headers: authHeaders(token), searchParams: assigneeId ? { assigneeId } : {} }).json<TaskList>(),
  });
}

export function useCreateTask() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<TaskItem, Error, TaskCreateInput>({
    mutationFn: (input) => api.post("tasks", { headers: authHeaders(token), json: input }).json<TaskItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<TaskItem, Error, { id: string; input: TaskUpdateInput }>({
    mutationFn: ({ id, input }) => api.patch(`tasks/${id}`, { headers: authHeaders(token), json: input }).json<TaskItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
