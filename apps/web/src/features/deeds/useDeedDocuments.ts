import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export type PartyRole = "buyer" | "seller";

export interface PartyMeta {
  id: string;
  name: string;
  aadhaarNumber: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface DeedPartyItem {
  linkId: string;
  role: PartyRole;
  party: PartyMeta;
}

export interface NaxaMeta {
  id: string;
  deedId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** People (buyers/sellers) attached to a deed, each with their reused Aadhaar card. */
export function useDeedParties(deedId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deed-parties", deedId],
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/parties`, { headers: authHeaders(token) }).json<DeedPartyItem[]>(),
  });
}

/** Attach a buyer/seller: reuse an existing person (partyId) or add a new one (name + aadhaar + file). */
export function useAddDeedParty(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    DeedPartyItem,
    Error,
    { role: PartyRole; partyId?: string; name?: string; aadhaarNumber?: string; file?: File }
  >({
    mutationFn: (input) => {
      const fd = new FormData();
      fd.set("role", input.role);
      if (input.partyId) fd.set("partyId", input.partyId);
      if (input.name) fd.set("name", input.name);
      if (input.aadhaarNumber) fd.set("aadhaarNumber", input.aadhaarNumber);
      if (input.file) fd.set("file", input.file);
      return api
        .post(`deeds/${deedId}/parties`, { headers: authHeaders(token), body: fd })
        .json<DeedPartyItem>();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deed-parties", deedId] }),
  });
}

export function useRemoveDeedParty(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (linkId) =>
      api.delete(`deeds/${deedId}/parties/${linkId}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deed-parties", deedId] }),
  });
}

/** Search already-saved people (by name or Aadhaar) to reuse them across deeds. */
export function useSearchParties(query: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["party-search", query],
    enabled: !!token && query.trim().length >= 2,
    queryFn: () =>
      api
        .get("parties", { headers: authHeaders(token), searchParams: { q: query.trim() } })
        .json<PartyMeta[]>(),
  });
}

export function useDeedNaxa(deedId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deed-naxa", deedId],
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/naxa`, { headers: authHeaders(token) }).json<NaxaMeta[]>(),
  });
}

export function useAddNaxa(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<NaxaMeta, Error, File>({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.set("file", file);
      return api
        .post(`deeds/${deedId}/naxa`, { headers: authHeaders(token), body: fd })
        .json<NaxaMeta>();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deed-naxa", deedId] }),
  });
}

export function useRemoveNaxa(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      api.delete(`deeds/${deedId}/naxa/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deed-naxa", deedId] }),
  });
}

/**
 * Fetch a stored file (Aadhaar card or naxa) with the auth token and return a
 * blob URL for preview/download. The file endpoints are guarded, so a plain
 * <img src> can't reach them — we fetch the bytes and objectURL them instead.
 */
export function useFileOpener() {
  const token = useAuthStore((s) => s.token);
  return (path: string) =>
    api
      .get(path, { headers: authHeaders(token) })
      .blob()
      .then((b) => URL.createObjectURL(b));
}
