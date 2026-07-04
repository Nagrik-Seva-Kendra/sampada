import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDeedInput,
  CreatePartnerInput,
  DeedRecordItem,
  PartnerItem,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Own deeds (partner: theirs; admin: admin's own — partner deeds are separate). */
export function useMyDeeds() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deeds", "mine"],
    enabled: !!token,
    queryFn: () =>
      api.get("deeds", { headers: authHeaders(token) }).json<DeedRecordItem[]>(),
  });
}

/** Admin: one partner's deeds. */
export function usePartnerDeeds(creatorId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deeds", "by", creatorId],
    enabled: !!token && !!creatorId,
    queryFn: () =>
      api
        .get("deeds", { headers: authHeaders(token), searchParams: { creatorId: creatorId! } })
        .json<DeedRecordItem[]>(),
  });
}

export function useCreateDeed() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<DeedRecordItem, Error, CreateDeedInput>({
    mutationFn: (input) =>
      api.post("deeds", { headers: authHeaders(token), json: input }).json<DeedRecordItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deeds"] }),
  });
}

export function useDeleteDeed() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`deeds/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deeds"] });
      qc.invalidateQueries({ queryKey: ["partners"] });
    },
  });
}

/** Admin: partner list with deed counts. */
export function usePartners() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["partners"],
    enabled: !!token && isAdmin,
    queryFn: () =>
      api.get("partners", { headers: authHeaders(token) }).json<PartnerItem[]>(),
  });
}

export function useCreatePartner() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PartnerItem, Error, CreatePartnerInput>({
    mutationFn: (input) =>
      api.post("partners", { headers: authHeaders(token), json: input }).json<PartnerItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });
}
