import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttendanceMonth,
  AttendanceSettings,
  Holiday,
  HolidayInput,
  LeaveApplyInput,
  LeaveRequestItem,
  MyAttendanceToday,
  PunchInput,
  PunchResult,
  SalaryAdjustInput,
  SalaryHistoryItem,
  SalarySetInput,
  SalarySheet,
} from "@sampada/shared";
import { api } from "../../lib/api";
import { authHeaders, useAuthStore } from "../../stores/authStore";

type SettingsResponse = { settings: AttendanceSettings; holidays: Holiday[]; canManage: boolean };

function useToken() {
  return useAuthStore((s) => s.token);
}

export function useAttendanceSettings() {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "settings"],
    enabled: !!token,
    queryFn: () => api.get("attendance/settings", { headers: authHeaders(token) }).json<SettingsResponse>(),
  });
}

export function useMyToday() {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "today"],
    enabled: !!token,
    refetchInterval: 60_000,
    queryFn: () => api.get("attendance/me/today", { headers: authHeaders(token) }).json<MyAttendanceToday>(),
  });
}

export function useAttendanceMonth(month: string, userId: string, enabled = true) {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "month", month, userId],
    enabled: !!token && enabled,
    queryFn: () =>
      api.get("attendance/month", { headers: authHeaders(token), searchParams: { month, ...(userId ? { userId } : {}) } }).json<AttendanceMonth>(),
  });
}

export function useLeaves() {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "leaves"],
    enabled: !!token,
    queryFn: () => api.get("attendance/leaves", { headers: authHeaders(token) }).json<LeaveRequestItem[]>(),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["attendance"] });
}

export function usePunch() {
  const token = useToken();
  const invalidate = useInvalidate();
  return useMutation<PunchResult, Error, PunchInput>({
    mutationFn: (input) => api.post("attendance/punch", { headers: authHeaders(token), json: input }).json<PunchResult>(),
    onSuccess: invalidate,
  });
}

export function useApplyLeave() {
  const token = useToken();
  const invalidate = useInvalidate();
  return useMutation<LeaveRequestItem, Error, LeaveApplyInput>({
    mutationFn: (input) => api.post("attendance/leaves", { headers: authHeaders(token), json: input }).json<LeaveRequestItem>(),
    onSuccess: invalidate,
  });
}

export function useDecideLeave() {
  const token = useToken();
  const invalidate = useInvalidate();
  return useMutation<LeaveRequestItem, Error, { id: string; approve: boolean }>({
    mutationFn: ({ id, approve }) => api.post(`attendance/leaves/${id}/${approve ? "approve" : "reject"}`, { headers: authHeaders(token) }).json<LeaveRequestItem>(),
    onSuccess: invalidate,
  });
}

export function useSaveSettings() {
  const token = useToken();
  const invalidate = useInvalidate();
  return useMutation<SettingsResponse, Error, AttendanceSettings>({
    mutationFn: (input) => api.put("attendance/settings", { headers: authHeaders(token), json: input }).json<SettingsResponse>(),
    onSuccess: invalidate,
  });
}

export function useHolidayMutations() {
  const token = useToken();
  const invalidate = useInvalidate();
  const add = useMutation<Holiday[], Error, HolidayInput>({
    mutationFn: (input) => api.post("attendance/holidays", { headers: authHeaders(token), json: input }).json<Holiday[]>(),
    onSuccess: invalidate,
  });
  const remove = useMutation<Holiday[], Error, string>({
    mutationFn: (id) => api.delete(`attendance/holidays/${id}`, { headers: authHeaders(token) }).json<Holiday[]>(),
    onSuccess: invalidate,
  });
  return { add, remove };
}

// ---------- salary (OWNER only; the server returns 403 to everyone else) ----------
export function useSalarySheet(month: string, enabled: boolean) {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "salary", month],
    enabled: !!token && enabled,
    retry: false,
    queryFn: () => api.get("attendance/salary/sheet", { headers: authHeaders(token), searchParams: { month } }).json<SalarySheet>(),
  });
}

export function useSalaryHistory(userId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ["attendance", "salary-history", userId],
    enabled: !!token && !!userId,
    retry: false,
    queryFn: () => api.get(`attendance/salary/history/${userId}`, { headers: authHeaders(token) }).json<SalaryHistoryItem[]>(),
  });
}

export function useSalaryMutations(month: string) {
  const token = useToken();
  const invalidate = useInvalidate();
  const h = { headers: authHeaders(token) };
  return {
    setRate: useMutation<SalaryHistoryItem[], Error, SalarySetInput>({
      mutationFn: (input) => api.post("attendance/salary/rate", { ...h, json: input }).json<SalaryHistoryItem[]>(),
      onSuccess: invalidate,
    }),
    adjust: useMutation<SalarySheet, Error, SalaryAdjustInput>({
      mutationFn: (input) => api.post(`attendance/salary/sheet/${month}/adjust`, { ...h, json: input }).json<SalarySheet>(),
      onSuccess: invalidate,
    }),
    finalize: useMutation<SalarySheet, Error, void>({
      mutationFn: () => api.post(`attendance/salary/sheet/${month}/final`, h).json<SalarySheet>(),
      onSuccess: invalidate,
    }),
    send: useMutation<{ sent: boolean; reason: string | null }, Error, string>({
      mutationFn: (userId) => api.post(`attendance/salary/sheet/${month}/send/${userId}`, h).json<{ sent: boolean; reason: string | null }>(),
      onSuccess: invalidate,
    }),
  };
}

/** Downloads an authenticated .xlsx (the export routes are staff-only, so a plain link can't reach them). */
export function useDownload() {
  const token = useToken();
  return async (path: string, searchParams: Record<string, string>, filename: string) => {
    const blob = await api.get(path, { headers: authHeaders(token), searchParams }).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
}

/** One GPS reading, only when the button is pressed. */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("noGps"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => reject(new Error("noGps")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
