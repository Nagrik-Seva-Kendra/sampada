import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export interface GuidelineDoc {
    id: string;
    title: string;
    fileName: string;
    mimeType: string;
    size: number;
    uploadedByName: string | null;
    createdAt: string;
}

/** Direct download URL for a guideline document — public, no auth needed. */
export function guidelineFileUrl(id: string): string {
    return `${import.meta.env.VITE_API_URL ?? ""}/api/v1/guideline-documents/${id}/file`;
}

/** Public: list of all guideline documents, visible to everyone (no login needed). */
export function useGuidelineList() {
    return useQuery({
          queryKey: ["guideline-documents"],
          queryFn: () => api.get("guideline-documents").json<GuidelineDoc[]>(),
    });
}

/** Admin: upload a new guideline PDF. */
export function useUploadGuideline() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<GuidelineDoc, Error, { title: string; file: File }>({
          mutationFn: async ({ title, file }) => {
                  const fd = new FormData();
                  fd.set("title", title);
                  fd.set("file", file);
                  try {
                            return await api
                              .post("guideline-documents", { headers: authHeaders(token), body: fd })
                              .json<GuidelineDoc>();
                  } catch (e) {
                            throw new Error(await apiErrorMessage(e, "Could not upload this document."));
                  }
          },
          onSuccess: () => qc.invalidateQueries({ queryKey: ["guideline-documents"] }),
    });
}

/** Admin: delete a guideline document. */
export function useDeleteGuideline() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<unknown, Error, string>({
          mutationFn: (id) =>
                  api.delete(`guideline-documents/${id}`, { headers: authHeaders(token) }).json(),
          onSuccess: () => qc.invalidateQueries({ queryKey: ["guideline-documents"] }),
    });
}
