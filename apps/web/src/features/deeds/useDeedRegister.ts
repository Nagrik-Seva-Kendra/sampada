import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDeedInput,
  CreatePartnerInput,
  DeedRecordItem,
  PartnerItem,
  PartnerSignupInput,
  UpdateDeedInput,
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

/** Admin: every partner's deeds combined (shown when no partner is selected). */
export function useAllPartnerDeeds(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["deeds", "all-partners"],
    enabled: enabled && !!token && isAdmin,
    queryFn: () =>
      api
        .get("deeds", { headers: authHeaders(token), searchParams: { creatorId: "all" } })
        .json<DeedRecordItem[]>(),
  });
}

/** EMPLOYEE (and ADMIN): literally every deed — admin's, every partner's, every employee's. */
export function useEveryoneDeeds() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["deeds", "everyone"],
    enabled: !!token,
    queryFn: () =>
      api
        .get("deeds", { headers: authHeaders(token), searchParams: { creatorId: "everyone" } })
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

export function useUpdateDeed() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<DeedRecordItem, Error, { id: string; input: UpdateDeedInput }>({
    mutationFn: ({ id, input }) =>
      api
        .patch(`deeds/${id}`, { headers: authHeaders(token), json: input })
        .json<DeedRecordItem>(),
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

/** Public: partner self-signup. Account stays PENDING until the admin approves it. */
export function usePartnerSignup() {
  return useMutation<PartnerItem, Error, PartnerSignupInput>({
    mutationFn: (input) =>
      api.post("partners/signup", { json: input }).json<PartnerItem>(),
  });
}

/** Admin: partner signups awaiting approval. */
export function usePendingPartners() {
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  return useQuery({
    queryKey: ["partners", "pending"],
    enabled: !!token && isAdmin,
    queryFn: () =>
      api.get("partners/pending", { headers: authHeaders(token) }).json<PartnerItem[]>(),
  });
}

export function useApprovePartner() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PartnerItem, Error, string>({
    mutationFn: (id) =>
      api.post(`partners/${id}/approve`, { headers: authHeaders(token) }).json<PartnerItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });
}

export function useRejectPartner() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => api.delete(`partners/${id}`, { headers: authHeaders(token) }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });
}
