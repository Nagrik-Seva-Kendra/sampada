import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformOrgDetail, PlatformOrgSummary, PlatformUpdateMembershipInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

interface Page {
  data: PlatformOrgSummary[];
  nextCursor: string | null;
}

/** Platform-admin only: every organization on the platform, cursor-paginated + searchable. */
export function usePlatformOrganizations(search: string) {
  const token = useAuthStore((s) => s.token);
  const isPlatformAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);
  return useInfiniteQuery({
    queryKey: ["platform", "organizations", search],
    enabled: !!token && isPlatformAdmin,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api
        .get("platform/organizations", {
          headers: authHeaders(token),
          searchParams: { ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
        })
        .json<Page>(),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePlatformOrganization(id: string) {
  const token = useAuthStore((s) => s.token);
  const isPlatformAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);
  return useQuery({
    queryKey: ["platform", "organizations", "detail", id],
    enabled: !!token && isPlatformAdmin && !!id,
    queryFn: () => api.get(`platform/organizations/${id}`, { headers: authHeaders(token) }).json<PlatformOrgDetail>(),
  });
}

function useOrgAction(action: "suspend" | "reactivate" | "cancel") {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PlatformOrgDetail, Error, string>({
    mutationFn: (id) =>
      api.post(`platform/organizations/${id}/${action}`, { headers: authHeaders(token) }).json<PlatformOrgDetail>(),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["platform", "organizations"] });
      qc.invalidateQueries({ queryKey: ["platform", "organizations", "detail", id] });
    },
  });
}

export const useSuspendOrganization = () => useOrgAction("suspend");
export const useReactivateOrganization = () => useOrgAction("reactivate");
export const useCancelOrganization = () => useOrgAction("cancel");

export function useUpdateMembership() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    PlatformOrgDetail,
    Error,
    { organizationId: string; membershipId: string; input: PlatformUpdateMembershipInput }
  >({
    mutationFn: ({ organizationId, membershipId, input }) =>
      api
        .patch(`platform/organizations/${organizationId}/memberships/${membershipId}`, {
          headers: authHeaders(token),
          json: input,
        })
        .json<PlatformOrgDetail>(),
    onSuccess: (_data, { organizationId }) => {
      qc.invalidateQueries({ queryKey: ["platform", "organizations", "detail", organizationId] });
    },
  });
}
