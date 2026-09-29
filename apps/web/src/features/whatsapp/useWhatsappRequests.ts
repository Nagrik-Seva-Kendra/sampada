import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WaAssignee,
  WaRequestDetail,
  WaRequestList,
  WaRequestUpdateInput,
  WaRevealResult,
  WaWorkStatus,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export interface WaRequestFilters {
  workStatus?: WaWorkStatus;
  needsStaff?: boolean;
}

/** Staff: WhatsApp draft requests for the active organization. */
export function useWaRequests(filters: WaRequestFilters) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "list", filters.workStatus ?? null, filters.needsStaff ?? null],
    enabled: !!token,
    queryFn: () => {
      const searchParams: Record<string, string> = {};
      if (filters.workStatus) searchParams.workStatus = filters.workStatus;
      if (filters.needsStaff !== undefined) searchParams.needsStaff = String(filters.needsStaff);
      return api.get("whatsapp/requests", { headers: authHeaders(token), searchParams }).json<WaRequestList>();
    },
  });
}

/** NEW-request count for the sidebar badge; refreshed every minute. */
export function useWaNewCount(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "summary"],
    enabled: enabled && !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("whatsapp/requests/summary", { headers: authHeaders(token) }).json<{ newCount: number }>(),
  });
}

export function useWaRequest(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "detail", id],
    enabled: !!token && !!id,
    queryFn: () => api.get(`whatsapp/requests/${id}`, { headers: authHeaders(token) }).json<WaRequestDetail>(),
  });
}

export function useWaAssignees() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "assignees"],
    enabled: !!token,
    staleTime: 5 * 60_000,
    queryFn: () => api.get("whatsapp/requests/assignees", { headers: authHeaders(token) }).json<WaAssignee[]>(),
  });
}

export function useUpdateWaRequest(id: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<WaRequestDetail, Error, WaRequestUpdateInput>({
    mutationFn: (input) =>
      api.patch(`whatsapp/requests/${id}`, { headers: authHeaders(token), json: input }).json<WaRequestDetail>(),
    onSuccess: (detail) => {
      qc.setQueryData(["wa-requests", "detail", id], detail);
      qc.invalidateQueries({ queryKey: ["wa-requests", "list"] });
      qc.invalidateQueries({ queryKey: ["wa-requests", "summary"] });
    },
  });
}

/** OWNER/ADMIN: decrypted Aadhaar/PAN. Kept only in component state, never in the query cache. */
export function useRevealWaRequest(id: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation<WaRevealResult, Error, void>({
    mutationFn: () => api.post(`whatsapp/requests/${id}/reveal`, { headers: authHeaders(token) }).json<WaRevealResult>(),
  });
}

/**
 * The document endpoint needs the auth header, so a plain link can't reach it:
 * fetch the bytes and hand back a blob URL (caller revokes it).
 */
export function useWaDocumentOpener() {
  const token = useAuthStore((s) => s.token);
  return (id: string, index: number) =>
    api
      .get(`whatsapp/requests/${id}/document`, { headers: authHeaders(token), searchParams: { i: String(index) } })
      .blob()
      .then((b) => URL.createObjectURL(b));
}
