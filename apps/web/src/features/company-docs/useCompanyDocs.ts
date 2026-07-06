import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompanyDocCategory, CompanyDocItem, CreateSiteInput, SiteItem } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Admin: sites (properties/projects) to file documents under. */
export function useSites() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["sites"],
    enabled: !!token,
    queryFn: () => api.get("sites", { headers: authHeaders(token) }).json<SiteItem[]>(),
  });
}

export function useCreateSite() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<SiteItem, Error, CreateSiteInput>({
    mutationFn: (input) =>
      api.post("sites", { headers: authHeaders(token), json: input }).json<SiteItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

/** Admin: deletes a site and every document filed under it. */
export function useDeleteSite() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`sites/${id}`, { headers: authHeaders(token) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

/** Admin: documents filed under one site. */
export function useCompanyDocs(siteId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["company-docs", siteId],
    enabled: !!token && !!siteId,
    queryFn: () =>
      api
        .get("company-docs", { headers: authHeaders(token), searchParams: { siteId: siteId! } })
        .json<CompanyDocItem[]>(),
  });
}

export function useUploadCompanyDoc() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    CompanyDocItem,
    Error,
    { siteId: string; category: CompanyDocCategory; label: string; file: File }
  >({
    mutationFn: ({ siteId, category, label, file }) => {
      const body = new FormData();
      body.append("file", file);
      return api
        .post("company-docs/upload", {
          body,
          searchParams: { siteId, category, label },
          headers: authHeaders(token),
        })
        .json<CompanyDocItem>();
    },
    onSuccess: (_res, { siteId }) => {
      qc.invalidateQueries({ queryKey: ["company-docs", siteId] });
      qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
}

export function useDeleteCompanyDoc() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<void, Error, { siteId: string; id: string }>({
    mutationFn: async ({ siteId, id }) => {
      await api.delete(`company-docs/${siteId}/${id}`, { headers: authHeaders(token) });
    },
    onSuccess: (_res, { siteId }) => {
      qc.invalidateQueries({ queryKey: ["company-docs", siteId] });
      qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
}

/** These docs are admin-only, so viewing/downloading needs an authed fetch, not a plain <a href>. */
export function useOpenCompanyDoc() {
  const token = useAuthStore((s) => s.token);
  return async (url: string, fileName: string, mode: "view" | "download") => {
    const path = url.replace(/^\/api\/v1\//, "");
    const blob = await api.get(path, { headers: authHeaders(token) }).blob();
    const objUrl = URL.createObjectURL(blob);
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = fileName;
      a.click();
    } else {
      window.open(objUrl, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
  };
}
