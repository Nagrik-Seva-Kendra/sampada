import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiDraftAvailability, AiDraftRunItem, AiDraftSettings, AiEvalItem, AiLearningView, AiPropertyTypeT } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export function useAiAvailability(requestId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["ai-draft", "request", requestId],
    enabled: !!token,
    retry: false,
    queryFn: () => api.get(`ai-draft/requests/${requestId}`, { headers: authHeaders(token) }).json<AiDraftAvailability>(),
  });
}

export function useAiGenerate(requestId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<AiDraftRunItem, Error, void>({
    // A full deed takes a while: no client timeout.
    mutationFn: () => api.post(`ai-draft/requests/${requestId}`, { headers: authHeaders(token), timeout: false }).json<AiDraftRunItem>(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-draft", "request", requestId] });
      qc.invalidateQueries({ queryKey: ["wa-requests"] });
    },
  });
}

export function useAiMarkReviewed(requestId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (deedId) => api.post(`ai-draft/deeds/${deedId}/reviewed`, { headers: authHeaders(token) }).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-draft", "request", requestId] }),
  });
}

export function useAiSettings() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["ai-draft", "settings"],
    enabled: !!token,
    retry: false,
    queryFn: () => api.get("ai-draft/settings", { headers: authHeaders(token) }).json<AiDraftSettings>(),
  });
}

export function useAiSettingsActions() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const set = (data: AiDraftSettings) => qc.setQueryData(["ai-draft", "settings"], data);
  return {
    toggle: useMutation<AiDraftSettings, Error, { propertyType: AiPropertyTypeT; enabled: boolean }>({
      mutationFn: (json) => api.put("ai-draft/settings/type", { ...h, json }).json<AiDraftSettings>(),
      onSuccess: set,
    }),
    star: useMutation<AiDraftSettings, Error, { deedId: string; starred: boolean }>({
      mutationFn: (json) => api.put("ai-draft/settings/star", { ...h, json }).json<AiDraftSettings>(),
      onSuccess: (d) => {
        set(d);
        qc.invalidateQueries({ queryKey: ["ai-draft", "request"] });
      },
    }),
    startEval: useMutation<AiEvalItem, Error, { propertyType: AiPropertyTypeT }>({
      mutationFn: (json) => api.post("ai-draft/evals", { ...h, json }).json<AiEvalItem>(),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-draft", "evals"] }),
    }),
  };
}

export function useAiEvals() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["ai-draft", "evals"],
    enabled: !!token,
    retry: false,
    refetchInterval: (q) => ((q.state.data ?? []).some((e) => e.status === "RUNNING") ? 5000 : false),
    queryFn: () => api.get("ai-draft/evals", { headers: authHeaders(token) }).json<AiEvalItem[]>(),
  });
}

export function useAiLearning() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["ai-draft", "learning"],
    enabled: !!token,
    retry: false,
    queryFn: () => api.get("ai-draft/learning", { headers: authHeaders(token) }).json<AiLearningView>(),
  });
}

export function useAiDecideRule() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<AiLearningView, Error, { id: string; approve: boolean }>({
    mutationFn: ({ id, approve }) => api.put(`ai-draft/learning/${id}`, { headers: authHeaders(token), json: { approve } }).json<AiLearningView>(),
    onSuccess: (d) => qc.setQueryData(["ai-draft", "learning"], d),
  });
}
