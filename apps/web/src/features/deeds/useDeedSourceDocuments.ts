import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** One fact the model read out of an uploaded document. */
export interface ExtractedField {
  label: string;
  value: string;
  group: "party" | "property" | "other";
}

/** Whose paper it is: each has its own upload slot. */
export type DocumentRole = "seller" | "buyer" | "property";

export interface SourceDocumentItem {
  id: string;
  role: DocumentRole;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedByName: string | null;
  /** null means the file is stored but has not been read. */
  extracted: ExtractedField[] | null;
  extractError: string | null;
}

const keyFor = (deedId: string) => ["deed-source-documents", deedId] as const;

export function useSourceDocuments(deedId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keyFor(deedId),
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/source-documents`, { headers: authHeaders(token) }).json<SourceDocumentItem[]>(),
  });
}

export function useAddSourceDocument(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SourceDocumentItem, Error, { file: File; role: DocumentRole }>({
    mutationFn: ({ file, role }) => {
      const body = new FormData();
      body.append("role", role);
      body.append("file", file);
      return api
        .post(`deeds/${deedId}/source-documents`, {
          headers: authHeaders(token),
          body,
          // Reading a document goes out to the model, which is slower than the
          // client's default patience for a plain upload.
          timeout: 120_000,
        })
        .json<SourceDocumentItem>();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keyFor(deedId) }),
  });
}

/** Retry the read for a document already stored -- a bad scan, a timeout. */
export function useReadSourceDocument(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SourceDocumentItem, Error, string>({
    mutationFn: (id) =>
      api
        .post(`deeds/${deedId}/source-documents/${id}/read`, { headers: authHeaders(token), timeout: 120_000 })
        .json<SourceDocumentItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keyFor(deedId) }),
  });
}

export function useRemoveSourceDocument(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`deeds/${deedId}/source-documents/${id}`, { headers: authHeaders(token) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keyFor(deedId) }),
  });
}

/** One change the server suggests for the deed; nothing is written until applied. */
export interface ProposedFill {
  role: DocumentRole;
  find: string;
  replace: string;
  why: string;
}

export interface FillProposal {
  fills: ProposedFill[];
  /** What of the person being replaced would stay in the deed. */
  warnings: string[];
  skipped: { why: string; reason: string }[];
}

/** Saved people placed in the seller or buyer slot, by id. */
export interface PickedIds {
  seller: string[];
  buyer: string[];
}

/** Ask where the facts read off the documents belong in this deed. */
export function useProposeFill(deedId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation<
    FillProposal,
    Error,
    { kind: string | null; people: PickedIds; partyTypes: { seller: string; buyer: string } }
  >({
    mutationFn: ({ kind, people, partyTypes }) =>
      api
        .post(`deeds/${deedId}/source-documents/propose-fill`, {
          headers: authHeaders(token),
          json: { kind, people, partyTypes },
          // The model reads the whole deed and thinks before answering.
          timeout: 180_000,
        })
        .json<FillProposal>(),
  });
}

export interface NameWarning {
  level: "error" | "notice";
  message: string;
}

/**
 * Farmland: do the seller IDs match the owners on the land record?
 *
 * Sends the deed as it is on screen, a moment after typing stops -- the saved
 * copy lags behind, and a warning about text already fixed is noise. Keyed
 * under the document list, so every upload or removal refreshes it too.
 */
export function useNameCheck(deedId: string, enabled: boolean, content: string, sellerIds: string[]) {
  const token = useAuthStore((s) => s.token);
  const [settled, setSettled] = useState(content);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(content), 800);
    return () => window.clearTimeout(id);
  }, [content]);
  return useQuery({
    queryKey: [...keyFor(deedId), "name-check", settled, sellerIds.join(",")],
    enabled: !!token && !!deedId && enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      api
        .post(`deeds/${deedId}/source-documents/name-check`, { headers: authHeaders(token), json: { content: settled, people: { seller: sellerIds, buyer: [] } } })
        .json<{ owners: string[]; warnings: NameWarning[] }>(),
  });
}
