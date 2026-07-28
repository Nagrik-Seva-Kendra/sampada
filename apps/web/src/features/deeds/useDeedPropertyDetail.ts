import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeedPropertyDetail, DeedPropertyDetailCreateInput, DeedPropertyDetailExtraction } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Structured property data for one deed (plot/khasra/measurements/chauhaddi), or null if not entered yet. */
export function useDeedPropertyDetail(deedId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deed-property-detail", deedId],
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/property-detail`, { headers: authHeaders(token) }).json<DeedPropertyDetail | null>(),
  });
}

/** Creates/updates a deed's property detail (upsert — at most one row per deed). */
export function useSaveDeedPropertyDetail(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<DeedPropertyDetail, Error, DeedPropertyDetailCreateInput>({
    mutationFn: (input) =>
      api
        .put(`deeds/${deedId}/property-detail`, { headers: authHeaders(token), json: input })
        .json<DeedPropertyDetail>(),
    onSuccess: (item) => {
      qc.setQueryData(["deed-property-detail", deedId], item);
    },
  });
}

/**
 * AI-assisted prefill: asks the server to read the deed's own text with
 * Claude and return a best-effort structured reading of it. Never saves
 * anything — the caller pre-fills the form from the result and staff review
 * it before hitting Save, same as every other field here.
 */
export function useExtractDeedPropertyDetail(deedId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation<DeedPropertyDetailExtraction, Error, void>({
    mutationFn: () =>
      api
        .post(`deeds/${deedId}/property-detail/extract`, { headers: authHeaders(token), timeout: 30000 })
        .json<DeedPropertyDetailExtraction>(),
  });
}
