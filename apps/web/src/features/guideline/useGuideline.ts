import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

export interface GuidelineDoc {
  id: string;
  title: string;
  district: string;
  session: number;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: string;
}

/** All 52 Madhya Pradesh districts, matching the official Sampada 2.0 portal list. */
export const MP_DISTRICTS: string[] = [
  "Agar Malwa",
  "Alirajpur",
  "Anuppur",
  "Ashok Nagar",
  "Balaghat",
  "Barwani",
  "Betul",
  "Bhind",
  "Bhopal",
  "Burhanpur",
  "Chhatarpur",
  "Chhindwara",
  "Damoh",
  "Datia",
  "Dewas",
  "Dhar",
  "Dindori",
  "Guna",
  "Gwalior",
  "Harda",
  "Indore",
  "Jabalpur",
  "Jhabua",
  "Katni",
  "Khandwa",
  "Khargone",
  "Mandla",
  "Mandsaur",
  "Morena",
  "Narmadapuram",
  "Narsinghpur",
  "Neemuch",
  "Niwari",
  "Panna",
  "Raisen",
  "Rajgarh",
  "Ratlam",
  "Rewa",
  "Sagar",
  "Satna",
  "Sehore",
  "Seoni",
  "Shahdol",
  "Shajapur",
  "Sheopur",
  "Shivpuri",
  "Sidhi",
  "Singroli",
  "Tikamgarh",
  "Ujjain",
  "Umaria",
  "Vidisha",
];

/** Guideline (collector) rate PDFs start with the 2015-2016 registration session. */
export const GUIDELINE_START_YEAR = 2015;

/**
 * Registration sessions run 1 April → 31 March (not the calendar year), so a
 * session is identified by its starting year: 2015 means "2015-2016". Before
 * April 1st the current session is still last year's.
 */
export function currentSessionStartYear(now: Date = new Date()): number {
  const isBeforeApril = now.getMonth() < 3; // Jan(0)-Mar(2)
  return now.getFullYear() - (isBeforeApril ? 1 : 0);
}

/** All valid session-start years, 2015 → current session (inclusive), descending. */
export function guidelineSessions(now: Date = new Date()): number[] {
  const current = currentSessionStartYear(now);
  const years: number[] = [];
  for (let y = current; y >= GUIDELINE_START_YEAR; y--) years.push(y);
  return years;
}

/** Display label for a session-start year, e.g. 2015 → "2015-2016". */
export function formatSession(year: number): string {
  return `${year}-${year + 1}`;
}

/** Direct download URL for a guideline document — public, no auth needed. */
export function guidelineFileUrl(id: string): string {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1/guideline-documents/${id}/file`;
}

/** Inline-preview URL (opens in the browser tab instead of forcing a download). */
export function guidelineViewUrl(id: string): string {
  return `${guidelineFileUrl(id)}?view=1`;
}

/** Public: list of guideline documents, optionally filtered by district and/or session. Visible to everyone (no login needed). */
export function useGuidelineList(filters?: { district?: string; session?: number }) {
  const district = filters?.district;
  const session = filters?.session;
  return useQuery({
    queryKey: ["guideline-documents", district ?? null, session ?? null],
    queryFn: () =>
      api
        .get("guideline-documents", {
          searchParams: {
            ...(district ? { district } : {}),
            ...(session ? { session } : {}),
          },
        })
        .json<GuidelineDoc[]>(),
  });
}

/** Admin: upload a new guideline PDF for a district + session. */
export function useUploadGuideline() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation<
    GuidelineDoc,
    Error,
    { title: string; district: string; session: number; file: File }
  >({
    mutationFn: async ({ title, district, session, file }) => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("district", district);
      fd.set("session", String(session));
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
