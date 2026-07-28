import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyCreateInput, PropertyDetail, PropertySummary, PropertyUpdateInput } from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

interface Page {
  data: PropertySummary[];
  nextCursor: string | null;
}

/** Staff: every property listing regardless of status — the "Property upload" app's home page. */
export function useAdminProperties() {
  const token = useAuthStore((s) => s.token);
  return useInfiniteQuery({
    queryKey: ["properties", "admin"],
    enabled: !!token,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api
        .get("properties/admin", { headers: authHeaders(token), searchParams: pageParam ? { cursor: pageParam } : {} })
        .json<Page>(),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAdminProperty(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["properties", "admin", id],
    enabled: !!token && !!id,
    queryFn: () => api.get(`properties/admin/${id}`, { headers: authHeaders(token) }).json<PropertyDetail>(),
  });
}

export function useCreateProperty() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PropertyDetail, Error, PropertyCreateInput>({
    mutationFn: (input) => api.post("properties", { headers: authHeaders(token), json: input }).json<PropertyDetail>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });
}

export function useUpdateProperty() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PropertyDetail, Error, { id: string; input: PropertyUpdateInput }>({
    mutationFn: ({ id, input }) =>
      api.patch(`properties/${id}`, { headers: authHeaders(token), json: input }).json<PropertyDetail>(),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["properties", "admin", id] });
    },
  });
}

export function useDeleteProperty() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`properties/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });
}

export function useAddPropertyImages() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PropertyDetail, Error, { id: string; files: File[] }>({
    mutationFn: ({ id, files }) => {
      const form = new FormData();
      for (const f of files) form.append("images", f);
      return api.post(`properties/${id}/images`, { headers: authHeaders(token), body: form }).json<PropertyDetail>();
    },
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ["properties", "admin", id] }),
  });
}

export function useRemovePropertyImage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; imageId: string }>({
    mutationFn: ({ id, imageId }) =>
      api.delete(`properties/${id}/images/${imageId}`, { headers: authHeaders(token) }).json(),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ["properties", "admin", id] }),
  });
}

export function propertyImageUrl(propertyId: string, imageId: string): string {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1/properties/${propertyId}/images/${imageId}`;
}
