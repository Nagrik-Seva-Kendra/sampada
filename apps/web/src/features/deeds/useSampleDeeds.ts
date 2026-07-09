import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSampleDeedInput,
  DeedCreator,
  DeedType,
  ListDeedsQuery,
  SampleDeedItem,
  SampleDeedListItem,
  UpdateSampleDeedInput,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Own sample deeds for one deed type (ADMIN: everyone's). Metadata only — no `content`. */
export function useSampleDeeds(type: DeedType) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["sample-deeds", type],
    enabled: !!token,
    queryFn: () =>
      api
        .get("sample-deeds", { headers: authHeaders(token), searchParams: { type } })
        .json<SampleDeedListItem[]>(),
  });
}

/** Admin/Employee: every sample deed across every type (all creators) — the "All Deeds" page. Light rows (no content). */
export function useAllDeeds(filters: ListDeedsQuery = {}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const canView = role === "ADMIN" || role === "EMPLOYEE";
  return useQuery({
    queryKey: ["sample-deeds", "all", filters],
    enabled: !!token && canView,
    queryFn: () =>
      api
        .get("sample-deeds/all", {
          headers: authHeaders(token),
          searchParams: toSearchParams(filters),
        })
        .json<SampleDeedListItem[]>(),
  });
}

function toSearchParams(filters: ListDeedsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.types?.length) params.types = filters.types.join(",");
  if (filters.status) params.status = filters.status;
  if (filters.createdById) params.createdById = filters.createdById;
  return params;
}

/** Every admin/employee account, for the "All Deeds" creator filter dropdown. */
export function useDeedCreators() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const canView = role === "ADMIN" || role === "EMPLOYEE";
  return useQuery({
    queryKey: ["sample-deeds", "creators"],
    enabled: !!token && canView,
    queryFn: () =>
      api.get("sample-deeds/creators", { headers: authHeaders(token) }).json<DeedCreator[]>(),
  });
}

/** Fetch one sample deed with its full content (for view/print/edit). */
export function useSampleDeed(id: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["sample-deeds", "one", id],
    enabled: !!token && !!id,
    queryFn: () =>
      api.get(`sample-deeds/${id}`, { headers: authHeaders(token) }).json<SampleDeedItem>(),
  });
}

/**
 * Imperative counterpart to useSampleDeed, for actions that need the body but
 * don't render it (print, duplicate). Shares useSampleDeed's cache entry.
 */
export function useFetchSampleDeed() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return (id: string) =>
    qc.fetchQuery({
      queryKey: ["sample-deeds", "one", id],
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
    // The body lives in its own cache entry now — stale it too, or view/print
    // would keep serving the pre-edit content.
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["sample-deeds", type] });
      qc.invalidateQueries({ queryKey: ["sample-deeds", "one", id] });
    },
  });
}

export function useDeleteSampleDeed(type: DeedType) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      api.delete(`sample-deeds/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["sample-deeds", type] });
      qc.removeQueries({ queryKey: ["sample-deeds", "one", id] });
    },
  });
}
