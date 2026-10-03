import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColonyDashboard, ColonyImportResult, ColonyPlot, ColonyProject, ColonyProjectInput, ColonySale, ColonySaleInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

const useToken = () => useAuthStore((s) => s.token);

export function useColonyProjects() {
  const token = useToken();
  return useQuery({
    queryKey: ["colony", "projects"],
    enabled: !!token,
    queryFn: () => api.get("colony/projects", { headers: authHeaders(token) }).json<ColonyProject[]>(),
  });
}

export function useColonyData(projectId: string | null) {
  const token = useToken();
  const h = { headers: authHeaders(token) };
  const enabled = !!token && !!projectId;
  return {
    dashboard: useQuery({ queryKey: ["colony", projectId, "dashboard"], enabled, queryFn: () => api.get(`colony/projects/${projectId}/dashboard`, h).json<ColonyDashboard>() }),
    plots: useQuery({ queryKey: ["colony", projectId, "plots"], enabled, queryFn: () => api.get(`colony/projects/${projectId}/plots`, h).json<ColonyPlot[]>() }),
    sales: useQuery({ queryKey: ["colony", projectId, "sales"], enabled, queryFn: () => api.get(`colony/projects/${projectId}/sales`, h).json<ColonySale[]>() }),
  };
}

export function useColonyActions(projectId: string | null) {
  const token = useToken();
  const qc = useQueryClient();
  const h = { headers: authHeaders(token) };
  const onSuccess = () => qc.invalidateQueries({ queryKey: ["colony"] });
  const upload = (path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(path, { ...h, body: fd }).json<ColonyImportResult>();
  };
  return {
    create: useMutation<ColonyProject, Error, ColonyProjectInput>({ mutationFn: (json) => api.post("colony/projects", { ...h, json }).json(), onSuccess }),
    save: useMutation<ColonyProject, Error, ColonyProjectInput>({ mutationFn: (json) => api.put(`colony/projects/${projectId}`, { ...h, json }).json(), onSuccess }),
    live: useMutation<ColonyProject, Error, boolean>({ mutationFn: (live) => api.put(`colony/projects/${projectId}/live`, { ...h, json: { live } }).json(), onSuccess }),
    suggest: useMutation<{ template: string; found: string[]; missing: string[] }, Error, string>({
      mutationFn: (deedId) => api.get(`colony/template-suggest/${deedId}`, h).json(),
    }),
    importPlots: useMutation<ColonyImportResult, Error, File>({ mutationFn: (f) => upload(`colony/projects/${projectId}/plots/import`, f), onSuccess }),
    importSales: useMutation<ColonyImportResult, Error, File>({ mutationFn: (f) => upload(`colony/projects/${projectId}/sales/import`, f), onSuccess }),
    createSale: useMutation<ColonySale, Error, ColonySaleInput>({ mutationFn: (json) => api.post(`colony/projects/${projectId}/sales`, { ...h, json }).json(), onSuccess }),
    updateSale: useMutation<ColonySale, Error, { id: string; input: ColonySaleInput }>({
      mutationFn: ({ id, input }) => api.put(`colony/projects/${projectId}/sales/${id}`, { ...h, json: input }).json(),
      onSuccess,
    }),
    cancelSale: useMutation<ColonySale, Error, string>({ mutationFn: (id) => api.post(`colony/projects/${projectId}/sales/${id}/cancel`, h).json(), onSuccess }),
    deed: useMutation<ColonySale, Error, string>({ mutationFn: (id) => api.post(`colony/projects/${projectId}/sales/${id}/deed`, h).json(), onSuccess }),
  };
}
