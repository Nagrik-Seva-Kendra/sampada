import { z } from "zod";

/**
 * Office to-do items ("मेरे काम"): from the owner's WhatsApp voice notes /
 * texts, or the web. Times are stored UTC; the office is in India (IST).
 */
export const TaskWorkType = z.enum([
  "sale", // विक्रय पत्र
  "mortgage", // बंधक
  "agreement", // अनुबंध
  "patta", // पट्टा
  "mutation", // नामांतरण
  "copy", // नकल
  "call", // कॉल करना
  "collect_papers", // कागज़ लेना
  "other",
]);
export type TaskWorkType = z.infer<typeof TaskWorkType>;

export const TASK_WORK_LABEL_HI: Record<TaskWorkType, string> = {
  sale: "विक्रय पत्र",
  mortgage: "बंधक",
  agreement: "अनुबंध",
  patta: "पट्टा",
  mutation: "नामांतरण",
  copy: "नकल",
  call: "कॉल करना",
  collect_papers: "कागज़ लेना",
  other: "अन्य",
};

/** Work types that are a document the WhatsApp draft flow can start collecting papers for. */
export const DEED_TASK_TYPES: readonly TaskWorkType[] = ["sale", "mortgage", "agreement", "patta", "mutation"];

export const TaskStatus = z.enum(["OPEN", "DONE", "CANCELLED"]);
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskSource = "voice" | "text" | "web" | "broadcast";

export interface TaskItem {
  id: string;
  /** Short per-office number used on WhatsApp ("3 हो गया"). */
  number: number;
  title: string;
  partyName: string | null;
  partyPhone: string | null;
  workType: TaskWorkType;
  place: string | null;
  dueAt: string | null;
  note: string | null;
  source: TaskSource;
  transcript: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  linkedRequestId: string | null;
  createdAt: string;
  doneAt: string | null;
}

export interface TaskList {
  data: TaskItem[];
  /** OWNER/ADMIN: may see all, assign. */
  canManage: boolean;
}

export const TaskCreateInput = z
  .object({
    title: z.string().trim().min(1).max(300),
    partyName: z.string().trim().max(120).nullable().optional(),
    partyPhone: z.string().trim().max(20).nullable().optional(),
    workType: TaskWorkType.default("other"),
    place: z.string().trim().max(200).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    assigneeId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;

export const TaskUpdateInput = TaskCreateInput.partial().extend({ status: TaskStatus.optional() }).strict();
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;
