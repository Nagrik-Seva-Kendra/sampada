import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CallbackItem, CallbackList, FollowUpList, FollowUpRule } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export function useCallbacks() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["calls", "list"],
    enabled: !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("whatsapp/calls", { headers: authHeaders(token) }).json<CallbackList>(),
  });
}

/** Sidebar badge: NEW call-backs the user sees. */
export function useCallbackCount(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["calls", "count"],
    enabled: enabled && !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("whatsapp/calls/count", { headers: authHeaders(token) }).json<{ newCount: number }>(),
  });
}

export function useCallbackActions() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const onSuccess = () => qc.invalidateQueries({ queryKey: ["calls"] });
  return {
    done: useMutation<CallbackItem, Error, { id: string; note: string | null }>({
      mutationFn: ({ id, note }) => api.post(`whatsapp/calls/${id}/done`, { ...h, json: { note } }).json<CallbackItem>(),
      onSuccess,
    }),
    reopen: useMutation<CallbackItem, Error, string>({
      mutationFn: (id) => api.post(`whatsapp/calls/${id}/reopen`, h).json<CallbackItem>(),
      onSuccess,
    }),
    assign: useMutation<CallbackItem, Error, { id: string; assigneeId: string | null }>({
      mutationFn: ({ id, assigneeId }) => api.post(`whatsapp/calls/${id}/assign`, { ...h, json: { assigneeId } }).json<CallbackItem>(),
      onSuccess,
    }),
  };
}

export function useFollowUps() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["follow-ups"],
    enabled: !!token,
    queryFn: () => api.get("whatsapp/follow-ups", { headers: authHeaders(token) }).json<FollowUpList>(),
  });
}

export function useSaveFollowUpRules() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<FollowUpList, Error, FollowUpRule[]>({
    mutationFn: (rules) => api.put("whatsapp/follow-ups/rules", { headers: authHeaders(token), json: { rules } }).json<FollowUpList>(),
    onSuccess: (data) => qc.setQueryData(["follow-ups"], data),
  });
}
