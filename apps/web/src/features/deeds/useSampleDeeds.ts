import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    CreateCorrectionInput,
    CreateSampleDeedInput,
    DeedCorrectionItem,
    DeedCreator,
    DeedRevisionItem,
    DeedType,
    ListDeedsQuery,
    PendingCorrectionSummary,
    PublicDeedItem,
    ResolveCorrectionInput,
    SampleDeedItem,
    SampleDeedListItem,
    UpdateSampleDeedInput,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

/** Own sample deeds for one deed type (ADMIN: everyone's). Metadata only, no `content`. */
export function useSampleDeeds(type: DeedType) {
    const token = useAuthStore((s) => s.token);
    return useQuery({
          queryKey: ["sample-deeds", type],
          enabled: !!token,
          queryFn: () =>
                  api
              .get("sample-deeds", { headers: authHeaders(token), searchParams: { type } })
              .json<SampleDeedListItem[]>(),
    });
}

/** Admin/Employee: every sample deed across every type (all creators) — the "All Deeds" page. Light rows (no content). */
export function useAllDeeds(filters: ListDeedsQuery = {}) {
    const token = useAuthStore((s) => s.token);
    const role = useAuthStore((s) => s.user?.role);
    const canView = role === "ADMIN" || role === "EMPLOYEE";
    return useQuery({
          queryKey: ["sample-deeds", "all", filters],
          enabled: !!token && canView,
          queryFn: () =>
                  api
              .get("sample-deeds/all", {
                          headers: authHeaders(token),
                          searchParams: toSearchParams(filters),
              })
              .json<SampleDeedListItem[]>(),
    });
}

function toSearchParams(filters: ListDeedsQuery): Record<string, string> {
    const params: Record<string, string> = {};
    if (filters.types?.length) params.types = filters.types.join(",");
    if (filters.status) params.status = filters.status;
    if (filters.createdById) params.createdById = filters.createdById;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    return params;
}

/** Every admin/employee account, for the "All Deeds" creator filter dropdown. */
export function useDeedCreators() {
    const token = useAuthStore((s) => s.token);
    const role = useAuthStore((s) => s.user?.role);
    const canView = role === "ADMIN" || role === "EMPLOYEE";
    return useQuery({
          queryKey: ["sample-deeds", "creators"],
          enabled: !!token && canView,
          queryFn: () =>
                  api.get("sample-deeds/creators", { headers: authHeaders(token) }).json<DeedCreator[]>(),
    });
}

/** Fetch one sample deed with its full content (for view/print/edit). */
export function useSampleDeed(id: string | null) {
    const token = useAuthStore((s) => s.token);
    return useQuery({
          queryKey: ["sample-deeds", "one", id],
          enabled: !!token && !!id,
          queryFn: () =>
                  api.get(`sample-deeds/${id}`, { headers: authHeaders(token) }).json<SampleDeedItem>(),
    });
}

/**
 * Imperative counterpart to useSampleDeed, for actions that need the body but
 * don't render it (print, duplicate). Shares useSampleDeed's cache entry.
 */
export function useFetchSampleDeed() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return (id: string) =>
          qc.fetchQuery({
                  queryKey: ["sample-deeds", "one", id],
                  queryFn: () =>
                            api.get(`sample-deeds/${id}`, { headers: authHeaders(token) }).json<SampleDeedItem>(),
          });
}

export function useCreateSampleDeed() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<SampleDeedItem, Error, CreateSampleDeedInput>({
          mutationFn: (input) =>
                  api
              .post("sample-deeds", { headers: authHeaders(token), json: input })
              .json<SampleDeedItem>(),
          onSuccess: (_, input) => {
                  qc.invalidateQueries({ queryKey: ["sample-deeds", input.type] });
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "all"] });
          },
    });
}

/**
 * Save one deed's edits. The editor auto-saves while the author types, so the
 * saved deed is written straight into its cache entry rather than invalidating
 * it: invalidating would refetch mid-keystroke and the editor would snap back
 * to the server's copy, eating whatever was typed during the request. Lists
 * carry the title, so they're staled — they're inactive while the editor is
 * open, so this costs no request until one is next viewed.
 */
/**
 * Platform staff: mark a deed as a starter copied into every new workspace.
 * Only the "all deeds" list shows the flag, so that is the only cache that
 * needs refreshing.
 */
export function useSetDeedStarter() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<SampleDeedItem, Error, { id: string; isStarter: boolean }>({
          mutationFn: ({ id, isStarter }) =>
                  api
              .patch(`sample-deeds/${id}/starter`, { headers: authHeaders(token), json: { isStarter } })
              .json<SampleDeedItem>(),
          retry: false,
          onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: ["sample-deeds", "all"] });
          },
    });
}

export function useSaveSampleDeed(type: DeedType) {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<SampleDeedItem, Error, { id: string; input: UpdateSampleDeedInput }>({
          mutationFn: ({ id, input }) =>
                  api
              .patch(`sample-deeds/${id}`, { headers: authHeaders(token), json: input })
              .json<SampleDeedItem>(),
          retry: false,
          onSuccess: (item) => {
                  qc.setQueryData(["sample-deeds", "one", item.id], item);
                  qc.invalidateQueries({ queryKey: ["sample-deeds", type] });
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "all"] });
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "revisions", item.id] });
          },
    });
}

function dropDeedFromLists(qc: ReturnType<typeof useQueryClient>, id: string) {
    qc.setQueriesData<SampleDeedListItem[]>(
      {
              predicate: (q) =>
                        q.queryKey[0] === "sample-deeds" &&
                        q.queryKey[1] !== "one" &&
                        q.queryKey[1] !== "creators",
      },
          (old) => (Array.isArray(old) ? old.filter((d) => d.id !== id) : old),
        );
}

export function useDeleteSampleDeed(type: DeedType) {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<unknown, Error, string>({
          mutationFn: (id) =>
                  api.delete(`sample-deeds/${id}`, { headers: authHeaders(token) }).json(),
          onSuccess: (_, id) => {
                  dropDeedFromLists(qc, id);
                  qc.invalidateQueries({ queryKey: ["sample-deeds", type] });
                  qc.removeQueries({ queryKey: ["sample-deeds", "one", id] });
          },
    });
}

/** Delete variant for the "All Deeds" table, where each row can be a different type. */
export function useDeleteAnyDeed() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<unknown, Error, { id: string; type: DeedType }>({
          mutationFn: ({ id }) =>
                  api.delete(`sample-deeds/${id}`, { headers: authHeaders(token) }).json(),
          onSuccess: (_, { id, type }) => {
                  dropDeedFromLists(qc, id);
                  qc.invalidateQueries({ queryKey: ["sample-deeds", type] });
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "all"] });
                  qc.removeQueries({ queryKey: ["sample-deeds", "one", id] });
          },
    });
}

/**
 * AI-assisted drafting: sends free-text instructions (and the deed's
 * current content, already known server-side) to Claude, which generates a
 * fresh draft or corrects/completes the existing one. The server saves the
 * result immediately, so the response is the updated deed — same cache
 * write as useSaveSampleDeed, to avoid a mid-edit snap-back.
 */
export function useAiDraftDeed() {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<SampleDeedItem, Error, { id: string; instructions: string; deedTypeName?: string }>({
          mutationFn: ({ id, instructions, deedTypeName }) =>
                  api
              .post(`sample-deeds/${id}/ai-draft`, {
                          headers: authHeaders(token),
                          json: { instructions, deedTypeName },
                          timeout: 60000,
              })
              .json<SampleDeedItem>(),
          onSuccess: (item) => {
                  qc.setQueryData(["sample-deeds", "one", item.id], item);
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "revisions", item.id] });
          },
    });
}

/**
 * Version history for one deed (staff-only), newest first. Disabled by
 * default -- the caller (a "History" panel) turns it on only once opened,
 * since most edit sessions never look at it.
 */
export function useDeedRevisions(id: string | null, enabled: boolean) {
    const token = useAuthStore((s) => s.token);
    return useQuery({
          queryKey: ["sample-deeds", "revisions", id],
          enabled: !!token && !!id && enabled,
          queryFn: () =>
                  api.get(`sample-deeds/${id}/revisions`, { headers: authHeaders(token) }).json<DeedRevisionItem[]>(),
    });
}

/**
 * The party-facing share link: no auth token sent, keyed by the deed's own
 * id. Backs the public "/d/:id" page -- always resolves to whatever staff
 * most recently saved.
 */
export function usePublicDeed(id: string | undefined) {
    return useQuery({
          queryKey: ["public-deed", id],
          enabled: !!id,
          queryFn: () => api.get(`public/deeds/${id}`).json<PublicDeedItem>(),
    });
}

/**
 * Corrections the party (or an earlier visitor on this same link) has
 * flagged on this deed. Polls while the tab stays open so a resolution
 * staff applies shows up without the party needing to reload -- there's no
 * other way to reach an anonymous visitor once they've left the page.
 */
export function usePublicDeedCorrections(id: string | undefined) {
    return useQuery({
          queryKey: ["public-deed", id, "corrections"],
          enabled: !!id,
          refetchInterval: 20000,
          queryFn: () => api.get(`public/deeds/${id}/corrections`).json<DeedCorrectionItem[]>(),
    });
}

/** Party-facing: flags something wrong with the deed from the public share link. */
export function useCreateCorrection(id: string | undefined) {
    const qc = useQueryClient();
    return useMutation<DeedCorrectionItem, Error, CreateCorrectionInput>({
          mutationFn: (input) => api.post(`public/deeds/${id}/corrections`, { json: input }).json<DeedCorrectionItem>(),
          onSuccess: () => qc.invalidateQueries({ queryKey: ["public-deed", id, "corrections"] }),
    });
}

/** Staff: corrections flagged on this deed (shown in the editor). */
export function useDeedCorrections(id: string | null, enabled: boolean) {
    const token = useAuthStore((s) => s.token);
    return useQuery({
          queryKey: ["sample-deeds", "corrections", id],
          enabled: !!token && !!id && enabled,
          queryFn: () =>
                  api.get(`sample-deeds/${id}/corrections`, { headers: authHeaders(token) }).json<DeedCorrectionItem[]>(),
    });
}

/** Staff: marks a party-flagged correction resolved. */
export function useResolveCorrection(deedId: string) {
    const token = useAuthStore((s) => s.token);
    const qc = useQueryClient();
    return useMutation<DeedCorrectionItem, Error, { correctionId: string; input: ResolveCorrectionInput }>({
          mutationFn: ({ correctionId, input }) =>
                  api
              .patch(`sample-deeds/${deedId}/corrections/${correctionId}/resolve`, {
                          headers: authHeaders(token),
                          json: input,
              })
              .json<DeedCorrectionItem>(),
          onSuccess: () => {
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "corrections", deedId] });
                  qc.invalidateQueries({ queryKey: ["sample-deeds", "corrections", "pending-ids"] });
          },
    });
}

/** Admin/Employee: deed ids with an unresolved correction, for the All Deeds "flagged" badge. */
export function usePendingCorrectionIds() {
    const token = useAuthStore((s) => s.token);
    const role = useAuthStore((s) => s.user?.role);
    const canView = role === "ADMIN" || role === "EMPLOYEE";
    return useQuery({
          queryKey: ["sample-deeds", "corrections", "pending-ids"],
          enabled: !!token && canView,
          queryFn: () =>
                  api.get("sample-deeds/corrections/pending-ids", { headers: authHeaders(token) }).json<string[]>(),
    });
}

/**
 * Admin/Employee: every pending correction org-wide, with deed context —
 * powers the sidebar notification bell. Polls so a new party-flagged
 * correction shows up without the dashboard needing a reload.
 */
export function usePendingCorrections() {
    const token = useAuthStore((s) => s.token);
    const role = useAuthStore((s) => s.user?.role);
    const canView = role === "ADMIN" || role === "EMPLOYEE";
    return useQuery({
          queryKey: ["sample-deeds", "corrections", "pending"],
          enabled: !!token && canView,
          refetchInterval: 30000,
          queryFn: () =>
                  api
              .get("sample-deeds/corrections/pending", { headers: authHeaders(token) })
              .json<PendingCorrectionSummary[]>(),
    });
}
