import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HTTPError } from "ky";
import { api, apiErrorMessage } from "../../lib/api";
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

/**
 * Still being read. A long registry takes minutes, so the upload answers at
 * once and the reading lands later; neither mark is set in between.
 */
export const isReading = (d: SourceDocumentItem) => d.extracted === null && !d.extractError;

export function useSourceDocuments(deedId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keyFor(deedId),
    enabled: !!token && !!deedId,
    queryFn: () =>
      api.get(`deeds/${deedId}/source-documents`, { headers: authHeaders(token) }).json<SourceDocumentItem[]>(),
    // Ask again while something is being read, and stop once nothing is.
    refetchInterval: (query) => (query.state.data?.some(isReading) ? 4000 : false),
  });
}

/** Sent to the panel for a file the server would refuse for its size. */
export const FILE_TOO_LARGE = "file-too-large";

/** Over this, a phone photo is scaled down before it is sent. */
const SHRINK_OVER = 4 * 1024 * 1024;
const MAX_SIDE = 2600;

/**
 * A phone camera writes 10-25 MB photos of a page that reads perfectly at a
 * quarter of that. Scaling one down here keeps the upload inside the server's
 * limit and off a slow connection; anything that is not an image, or that
 * cannot be decoded, is sent exactly as it is.
 */
async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_OVER) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function useAddSourceDocument(deedId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SourceDocumentItem, Error, { file: File; role: DocumentRole }>({
    mutationFn: async ({ file, role }) => {
      const body = new FormData();
      body.append("role", role);
      body.append("file", await shrinkPhoto(file));
      try {
        return await api
          .post(`deeds/${deedId}/source-documents`, {
            headers: authHeaders(token),
            body,
            // Reading a document goes out to the model, which is slower than the
            // client's default patience for a plain upload.
            timeout: 120_000,
          })
          .json<SourceDocumentItem>();
      } catch (e) {
        if (e instanceof HTTPError && e.response.status === 413) throw new Error(FILE_TOO_LARGE);
        throw new Error(await apiErrorMessage(e, "Could not upload this file."));
      }
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
  /** For a picked firm: the partners who sign this deed, in order. */
  signers?: Record<string, string[]>;
}

/** Ask where the facts read off the documents belong in this deed. */
export function useProposeFill(deedId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation<
    FillProposal,
    Error,
    {
      kind: string | null;
      people: PickedIds;
      partyTypes: { seller: string; buyer: string };
      /** Place just this one fact; the rest only say whose it is. */
      only?: { role: DocumentRole; label: string; value: string };
      /** What the drafter typed: more facts, or changes to make. */
      message?: string;
    }
  >({
    mutationFn: ({ kind, people, partyTypes, only, message }) =>
      api
        .post(`deeds/${deedId}/source-documents/propose-fill`, {
          headers: authHeaders(token),
          json: { kind, people, partyTypes, only, message },
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
