import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export type PartyRole = "buyer" | "seller";
export type PartyType = "individual" | "company";

export interface PartyMeta {
  id: string;
  name: string;
  partyType: string;
  dob: string | null;
  address: string | null;
  aadhaarNumber: string | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  aadhaarBackFileName: string | null;
  aadhaarBackMimeType: string | null;
  aadhaarBackSize: number | null;
  panNumber: string | null;
  panFileName: string | null;
  panMimeType: string | null;
  panSize: number | null;
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

/** People (buyers/sellers) attached to a deed, each with their reused Aadhaar/PAN card. */
export function useDeedParties(deedId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deed-parties", deedId],
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/parties`, { headers: authHeaders(token) }).json<DeedPartyItem[]>(),
  });
}

/**
 * Attach a buyer/seller: reuse an existing person (partyId) or add a new one.
 * A name is all that's strictly required — the Aadhaar/PAN number and card
 * file(s) can all be added later (see useUpdatePartyFiles).
 */
export function useAddDeedParty(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    DeedPartyItem,
    Error,
    {
      role: PartyRole;
      partyId?: string;
      name?: string;
      partyType?: PartyType;
      dob?: string;
      aadhaarNumber?: string;
      panNumber?: string;
      file?: File;
      aadhaarBackFile?: File;
      panFile?: File;
    }
  >({
    mutationFn: async (input) => {
      const fd = new FormData();
      fd.set("role", input.role);
      if (input.partyId) fd.set("partyId", input.partyId);
      if (input.name) fd.set("name", input.name);
      if (input.partyType) fd.set("partyType", input.partyType);
      if (input.dob) fd.set("dob", input.dob);
      if (input.aadhaarNumber) fd.set("aadhaarNumber", input.aadhaarNumber);
      if (input.panNumber) fd.set("panNumber", input.panNumber);
      if (input.file) fd.set("file", input.file);
      if (input.aadhaarBackFile) fd.set("aadhaarBackFile", input.aadhaarBackFile);
      if (input.panFile) fd.set("panFile", input.panFile);
      try {
        return await api
          .post(`deeds/${deedId}/parties`, { headers: authHeaders(token), body: fd })
          .json<DeedPartyItem>();
      } catch (e) {
        throw new Error(await apiErrorMessage(e, "Could not add this person."));
      }
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

/**
 * Attach/replace the Aadhaar (front/back) and/or PAN card image for a person
 * that was already saved (typically from just their name/number, auto-filled
 * from the deed text) — used when staff scans the physical card in afterwards.
 */
export function useUpdatePartyFiles(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    PartyMeta,
    Error,
    { id: string; file?: File; aadhaarBackFile?: File; panFile?: File }
  >({
    mutationFn: async ({ id, file, aadhaarBackFile, panFile }) => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      if (aadhaarBackFile) fd.set("aadhaarBackFile", aadhaarBackFile);
      if (panFile) fd.set("panFile", panFile);
      try {
        return await api
          .post(`parties/${id}/files`, { headers: authHeaders(token), body: fd })
          .json<PartyMeta>();
      } catch (e) {
        throw new Error(await apiErrorMessage(e, "Could not save the file."));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deed-parties", deedId] }),
  });
}

/** Search already-saved people (by name, Aadhaar, or PAN) to reuse them across deeds. */
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
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      try {
        return await api
          .post(`deeds/${deedId}/naxa`, { headers: authHeaders(token), body: fd })
          .json<NaxaMeta>();
      } catch (e) {
        throw new Error(await apiErrorMessage(e, "Could not upload the map."));
      }
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
 * Fetch a stored file (Aadhaar/PAN card or naxa) with the auth token and return a
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

/**
 * Server-side OCR (Google Vision) for a card image. Returns the detected text,
 * or "" on any failure so the caller can fall back to in-browser OCR. Only the
 * backend knows whether a Vision API key is configured; if not, it returns "".
 */
export function usePartyOcr() {
  const token = useAuthStore((s) => s.token);
  return async (file: File): Promise<string> => {
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await api
        .post("ocr", { headers: authHeaders(token), body: fd })
        .json<{ text: string }>();
      return r.text || "";
    } catch {
      return "";
    }
  };
}
