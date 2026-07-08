import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSampleDeedInput,
  DeedType,
  SampleDeedItem,
  SampleDeedListItem,
  UpdateSampleDeedInput,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Own sample deeds for one deed type (ADMIN: everyone's). */
export function useSampleDeeds(type: DeedType) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["sample-deeds", type],
    enabled: !!token,
    queryFn: () =>
      api
        .get("sample-deeds", { headers: authHeaders(token), searchParams: { type } })
        .json<SampleDeedItem[]>(),
  });
}

/** Admin/Employee: every partner's sample deeds across every type; pass a creatorId to narrow to one partner. */
export function useAllPartnerSampleDeeds(creatorId: string | null) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const canView = role === "ADMIN" || role === "EMPLOYEE";
  return useQuery({
    queryKey: ["sample-deeds", "partners", creatorId],
    enabled: !!token && canView,
    queryFn: () =>
      api
        .get("sample-deeds/partners", {
          headers: authHeaders(token),
          searchParams: creatorId ? { creatorId } : {},
        })
        .json<SampleDeedItem[]>(),
  });
}

/** Admin/Employee: every sample deed across every type (all creators) — the "All Deeds" page. Light rows (no content). */
export function useAllDeeds() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const canView = role === "ADMIN" || role === "EMPLOYEE";
  return useQuery({
    queryKey: ["sample-deeds", "all"],
    enabled: !!token && canView,
    queryFn: () =>
      api.get("sample-deeds/all", { headers: authHeaders(token) }).json<SampleDeedListItem[]>(),
  });
}

/** Admin/Employee: fetch one sample deed with its full content (for view/print). */
export function useSampleDeed(id: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["sample-deeds", "one", id],
    enabled: !!token && !!id,
    queryFn: () =>
      api.get(`sample-deeds/${id}`, { headers: authHeaders(token) }).json<SampleDeedItem>(),
  });
}

export function useCreateSampleDeed() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SampleDeedItem, Error, CreateSampleDeedInput>({
    mutationFn: (input) =>
      api
        .post("sample-deeds", { headers: authHeaders(token), json: input })
        .json<SampleDeedItem>(),
    onSuccess: (_, input) =>
      qc.invalidateQueries({ queryKey: ["sample-deeds", input.type] }),
  });
}

export function useUpdateSampleDeed(type: DeedType) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SampleDeedItem, Error, { id: string; input: UpdateSampleDeedInput }>({
    mutationFn: ({ id, input }) =>
      api
        .patch(`sample-deeds/${id}`, { headers: authHeaders(token), json: input })
        .json<SampleDeedItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sample-deeds", type] }),
  });
}

export function useDeleteSampleDeed(type: DeedType) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      api.delete(`sample-deeds/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sample-deeds", type] }),
  });
}
