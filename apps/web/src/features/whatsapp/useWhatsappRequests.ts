import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WaAssignee,
  WaNotification,
  WaTemplateStatus,
  WaRequestDetail,
  WaRequestList,
  WaRequestSummary,
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

/**
 * Sidebar: badge count (managers: NEW; employees: their own NEW + IN_PROGRESS)
 * and whether to show the item at all. Refreshed every minute.
 */
export function useWaSummary(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "summary"],
    enabled: enabled && !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("whatsapp/requests/summary", { headers: authHeaders(token) }).json<WaRequestSummary>(),
  });
}

export function useWaRequest(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "detail", id],
    enabled: !!token && !!id,
    // 404/403 are final answers (not yours / not found) -- show that at once, don't retry.
    retry: (count, err) => {
      const status = (err as { response?: { status?: number } }).response?.status;
      return status !== 404 && status !== 403 && count < 2;
    },
    queryFn: () => api.get(`whatsapp/requests/${id}`, { headers: authHeaders(token) }).json<WaRequestDetail>(),
  });
}

/** OWNER/ADMIN only (the API 403s for everyone else) -- pass enabled accordingly. */
export function useWaAssignees(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-requests", "assignees"],
    enabled: enabled && !!token,
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

/** Resend a PENDING WhatsApp message of this request, then refresh the request. */
export function useResendWaNotification(id: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<WaNotification, Error, string>({
    mutationFn: (nid) =>
      api.post(`whatsapp/requests/${id}/notifications/${nid}/resend`, { headers: authHeaders(token) }).json<WaNotification>(),
    onSettled: () => qc.invalidateQueries({ queryKey: ["wa-requests", "detail", id] }),
  });
}

/** OWNER/ADMIN: the WhatsApp templates' approval state at Meta. */
export function useWaTemplates(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["wa-templates"],
    enabled: enabled && !!token,
    retry: false,
    queryFn: () => api.get("whatsapp/templates", { headers: authHeaders(token) }).json<WaTemplateStatus[]>(),
  });
}

/** OWNER/ADMIN: send the configured templates to Meta for approval. */
export function useSubmitWaTemplates() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<{ key: string; name: string; result: string }[], Error, void>({
    mutationFn: () => api.post("whatsapp/templates/submit", { headers: authHeaders(token) }).json(),
    onSettled: () => qc.invalidateQueries({ queryKey: ["wa-templates"] }),
  });
}

/** One ID-card photo as an object URL (same access as the request: OWNER/ADMIN or its assignee). */
export function useWaIdPhotoOpener() {
  const token = useAuthStore((s) => s.token);
  return (id: string, party: string, kind: string) =>
    api
      .get(`whatsapp/requests/${id}/id-photo`, { headers: authHeaders(token), searchParams: { party, kind } })
      .blob()
      .then((b) => URL.createObjectURL(b));
}
