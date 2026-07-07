import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDeedInput,
  CreatePartnerInput,
  DeedRecordItem,
  PartnerItem,
  PartnerSignupInput,
  UpdateDeedInput,
} from "@sampada/shared";
import { api, apiErrorMessage } from "../../lib/api";
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

/** Admin/Employee: partner list with deed counts. */
export function usePartners() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const canView = role === "ADMIN" || role === "EMPLOYEE";
  return useQuery({
    queryKey: ["partners"],
    enabled: !!token && canView,
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

/** Admin: reveal the password a partner set at signup (fetched on demand, not preloaded with the list). */
export function usePartnerPassword() {
  const token = useAuthStore((s) => s.token);
  return useMutation<{ password: string }, Error, string>({
    mutationFn: (id) =>
      api.get(`partners/${id}/password`, { headers: authHeaders(token) }).json<{ password: string }>(),
  });
}

/** Admin: discontinue a partner's services (blocks login, keeps the record). */
export function useDeactivatePartner() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PartnerItem, Error, string>({
    mutationFn: (id) =>
      api.post(`partners/${id}/deactivate`, { headers: authHeaders(token) }).json<PartnerItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });
}

/** Admin: restore a discontinued partner's access. */
export function useReactivatePartner() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<PartnerItem, Error, string>({
    mutationFn: (id) =>
      api.post(`partners/${id}/reactivate`, { headers: authHeaders(token) }).json<PartnerItem>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners"] }),
  });
}

/** Public: partner self-signup. Account stays PENDING until the admin approves it. */
export function usePartnerSignup() {
  return useMutation<PartnerItem, Error, PartnerSignupInput>({
    mutationFn: async (input) => {
      try {
        return await api.post("partners/signup", { json: input }).json<PartnerItem>();
      } catch (err) {
        throw new Error(await apiErrorMessage(err, "Registration failed — that email may already be registered."));
      }
    },
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
