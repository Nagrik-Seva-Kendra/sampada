import { useQuery } from "@tanstack/react-query";
import type { HomeSummary, SearchHit } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export function useHomeSummary() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["home", "summary"],
    enabled: !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("home/summary", { headers: authHeaders(token) }).json<HomeSummary>(),
  });
}

export function useGlobalSearch(q: string) {
  const token = useAuthStore((s) => s.token);
  const term = q.trim();
  return useQuery({
    queryKey: ["search", term],
    enabled: !!token && term.length >= 2,
    staleTime: 30_000,
    queryFn: () => api.get("search", { headers: authHeaders(token), searchParams: { q: term } }).json<SearchHit[]>(),
  });
}
