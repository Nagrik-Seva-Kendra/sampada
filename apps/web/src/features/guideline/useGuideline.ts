import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuidelineDocItem, GuidelineYearInfo, Language } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Public: all years 2015→current with PDF counts. */
export function useGuidelineYears() {
  return useQuery({
    queryKey: ["guideline", "years"],
    queryFn: () => api.get("guideline-docs/years").json<GuidelineYearInfo[]>(),
  });
}

/** Public: the PDFs uploaded for one year. */
export function useGuidelineDocs(year: number) {
  return useQuery({
    queryKey: ["guideline", "docs", year],
    queryFn: () =>
      api
        .get("guideline-docs", { searchParams: { year } })
        .json<GuidelineDocItem[]>(),
  });
}

/** Admin: upload a PDF for a year + district + language. */
export function useUploadGuidelinePdf() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  return useMutation<
    GuidelineDocItem,
    Error,
    { year: number; district: string; language: Language; file: File }
  >({
    mutationFn: ({ year, district, language, file }) => {
      const form = new FormData();
      form.append("file", file);
      return api
        .post("guideline-docs/upload", {
          body: form,
          searchParams: { year, district, language },
          headers: authHeaders(token),
        })
        .json<GuidelineDocItem>();
    },
    onSuccess: (_res, { year }) => {
      qc.invalidateQueries({ queryKey: ["guideline", "years"] });
      qc.invalidateQueries({ queryKey: ["guideline", "docs", year] });
    },
  });
}

/** Admin: delete a PDF. */
export function useDeleteGuidelineDoc() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  return useMutation<void, Error, { year: number; id: string }>({
    mutationFn: async ({ year, id }) => {
      await api.delete(`guideline-docs/${year}/${id}`, { headers: authHeaders(token) });
    },
    onSuccess: (_res, { year }) => {
      qc.invalidateQueries({ queryKey: ["guideline", "years"] });
      qc.invalidateQueries({ queryKey: ["guideline", "docs", year] });
    },
  });
}
