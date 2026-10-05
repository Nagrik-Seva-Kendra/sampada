import { z } from "zod";

/**
 * Staff attendance ("हाज़िरी"), leave and (OWNER-only) salary. Days are IST
 * calendar days "YYYY-MM-DD"; times "HH:MM" IST.
 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AttendanceSettingsInput = z
  .object({
    officeLat: z.number().min(-90).max(90).nullable(),
    officeLng: z.number().min(-180).max(180).nullable(),
    radiusM: z.number().int().min(20).max(5000),
    startTime: hhmm,
    endTime: hhmm,
    /** 0 = Sunday … 6 = Saturday. */
    weeklyOff: z.array(z.number().int().min(0).max(6)).max(6),
    lateAfterMin: z.number().int().min(0).max(240),
    halfDayAfterMin: z.number().int().min(0).max(480),
    paidLeavePerMonth: z.number().min(0).max(10),
    /** Optional: each late arrival deducts this fraction of a day (0 = off). */
    lateDeductionDay: z.number().min(0).max(1),
    reportsEnabled: z.boolean(),
  })
  .strict();
export type AttendanceSettings = z.infer<typeof AttendanceSettingsInput>;

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  officeLat: null,
  officeLng: null,
  radiusM: 100,
  startTime: "10:00",
  endTime: "19:00",
  weeklyOff: [0],
  lateAfterMin: 15,
  halfDayAfterMin: 120,
  paidLeavePerMonth: 1,
  lateDeductionDay: 0,
  reportsEnabled: true,
};

export const HolidayInput = z.object({ date: ymd, name: z.string().trim().min(1).max(100) }).strict();
export type HolidayInput = z.infer<typeof HolidayInput>;
export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export const PunchInput = z
  .object({
    kind: z.enum(["IN", "OUT", "FIELD"]),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    // Any reading is accepted; a computer without GPS reports 100+ km (IP / Wi-Fi guess), refused as "lowAccuracy".
    accuracyM: z.number().min(0).finite().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type PunchInput = z.infer<typeof PunchInput>;

export type DayStatus = "present" | "late" | "halfDay" | "field" | "absent" | "leave" | "halfLeave" | "off" | "holiday" | "future";

export interface PunchRecord {
  id: string;
  userId: string;
  day: string;
  kind: "IN" | "OUT" | "FIELD";
  at: string;
  inside: boolean;
  distanceM: number | null;
  reason: string | null;
}

export interface PunchResult {
  ok: boolean;
  /** "haazir" | "late" | "halfDay" | "out" | "field" | "tooFar" | "already" | "tooSoon" | "noIn" | "noOffice" | "needReason" | "lowAccuracy" | "closed" */
  code: string;
  record?: PunchRecord;
  distanceM?: number;
  /** The reading's accuracy (metres) when it was too rough ("lowAccuracy"). */
  accuracyM?: number;
}

export interface MyAttendanceToday {
  day: string;
  in: PunchRecord | null;
  out: PunchRecord | null;
  field: PunchRecord[];
  status: DayStatus;
  officeConfigured: boolean;
  closedReason: string | null;
}

export const LeaveType = z.enum(["CASUAL", "SICK", "OTHER"]);
export type LeaveType = z.infer<typeof LeaveType>;
export const LeaveStatus = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type LeaveStatus = z.infer<typeof LeaveStatus>;

export const LeaveApplyInput = z
  .object({ fromDate: ymd, toDate: ymd, halfDay: z.boolean(), type: LeaveType, reason: z.string().trim().min(2).max(500) })
  .strict();
export type LeaveApplyInput = z.infer<typeof LeaveApplyInput>;

export interface LeaveRequestItem {
  id: string;
  number: number;
  userId: string;
  userName: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  createdAt: string;
}

/** One staff member's day in the owner panel / month grid. */
export interface StaffDay {
  userId: string;
  name: string;
  day: string;
  status: DayStatus;
  inAt: string | null;
  outAt: string | null;
  lateMin: number;
  field: { at: string; reason: string | null }[];
}

export interface AttendanceMonth {
  month: string;
  days: string[];
  staff: { userId: string; name: string; days: StaffDay[] }[];
}

// ---------- salary (OWNER only) ----------
export const SalarySetInput = z
  .object({ userId: z.string().min(1).max(64), monthly: z.number().int().min(0).max(10_000_000), effectiveFrom: ymd })
  .strict();
export type SalarySetInput = z.infer<typeof SalarySetInput>;

export interface SalaryHistoryItem {
  id: string;
  monthly: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface SalaryLine {
  userId: string;
  name: string;
  monthly: number;
  totalDays: number;
  offDays: number;
  workingDays: number;
  perDay: number;
  present: number;
  halfDays: number;
  lateCount: number;
  paidLeave: number;
  unpaidLeave: number;
  absent: number;
  unpaidDays: number;
  deduction: number;
  bonus: number;
  advance: number;
  otherDeduction: number;
  note: string | null;
  payable: number;
}

export interface SalarySheet {
  month: string;
  status: "DRAFT" | "FINAL";
  lines: SalaryLine[];
  sentTo: string[];
}

export const SalaryAdjustInput = z
  .object({
    userId: z.string().min(1).max(64),
    bonus: z.number().int().min(0).max(10_000_000),
    advance: z.number().int().min(0).max(10_000_000),
    otherDeduction: z.number().int().min(0).max(10_000_000),
    note: z.string().max(500).nullable(),
  })
  .strict();
export type SalaryAdjustInput = z.infer<typeof SalaryAdjustInput>;
