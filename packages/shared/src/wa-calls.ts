import { z } from "zod";

/**
 * Call-back requests ("कॉल बैक चाहिए" on WhatsApp, or a "हाँ करवाना है"
 * reply to a follow-up) and follow-up reminders sent after a registry is
 * done (agreement / mortgage / patta end, mutation after a sale).
 */

export type CallbackStatus = "NEW" | "DONE";
export type CallbackSource = "whatsapp" | "followup";

export interface CallbackItem {
  id: string;
  number: number;
  /** Full number -- staff call it (click-to-call). */
  phone: string;
  customerName: string | null;
  /** When the customer would like the call (null: as soon as possible). */
  preferredAt: string | null;
  /** What the customer wrote for the time ("कल सुबह"). */
  preferredText: string | null;
  purpose: string;
  status: CallbackStatus;
  source: CallbackSource;
  assigneeId: string | null;
  assigneeName: string | null;
  /** The customer's latest WhatsApp request, when there is one. */
  requestId: string | null;
  requestRef: string | null;
  doneNote: string | null;
  doneAt: string | null;
  doneByName: string | null;
  createdAt: string;
}

export interface CallbackList {
  data: CallbackItem[];
  /** NEW call-backs the caller sees (badge). */
  newCount: number;
  canManage: boolean;
}

export const CallbackDoneInput = z.object({ note: z.string().trim().max(1000).nullable() }).strict();
export type CallbackDoneInput = z.infer<typeof CallbackDoneInput>;

export const CallbackAssignInput = z.object({ assigneeId: z.string().trim().min(1).max(64).nullable() }).strict();
export type CallbackAssignInput = z.infer<typeof CallbackAssignInput>;

// ---------- follow-ups ----------
export const FOLLOW_UP_KINDS = ["agreement", "mortgage", "patta", "sale"] as const;
export const FollowUpKind = z.enum(FOLLOW_UP_KINDS);
export type FollowUpKind = z.infer<typeof FollowUpKind>;

/**
 * One rule per kind. `offsetDays`: days BEFORE the term end (agreement,
 * mortgage, patta) or AFTER the registry (sale). Text placeholders:
 * {name} {ref} {date} (term end / registry day).
 */
export const FollowUpRuleInput = z
  .object({
    kind: FollowUpKind,
    enabled: z.boolean(),
    offsetDays: z.number().int().min(0).max(365),
    text: z.string().trim().min(10).max(600),
  })
  .strict();
export type FollowUpRule = z.infer<typeof FollowUpRuleInput>;
export const FollowUpRulesInput = z.object({ rules: z.array(FollowUpRuleInput).min(1).max(4) }).strict();

export const DEFAULT_FOLLOW_UP_RULES: FollowUpRule[] = [
  {
    kind: "agreement",
    enabled: true,
    offsetDays: 15,
    text: "नमस्ते {name}, नागरिक सेवा केंद्र से: आपके अनुबंध (अनुरोध {ref}) की अवधि {date} को पूरी हो रही है। नया अनुबंध बनवाना हो तो \"हाँ करवाना है\" लिखें।",
  },
  {
    kind: "mortgage",
    enabled: true,
    offsetDays: 30,
    text: "नमस्ते {name}, नागरिक सेवा केंद्र से: आपके बंधक (अनुरोध {ref}) का लोन {date} तक पूरा होना है। लोन चुकने के बाद बंधक मुक्ति (री-कन्वेयन्स) का दस्तावेज़ बनवाना हो तो \"हाँ करवाना है\" लिखें।",
  },
  {
    kind: "patta",
    enabled: true,
    offsetDays: 30,
    text: "नमस्ते {name}, नागरिक सेवा केंद्र से: आपके पट्टे (अनुरोध {ref}) की अवधि {date} को पूरी हो रही है। नवीनीकरण करवाना हो तो \"हाँ करवाना है\" लिखें।",
  },
  {
    kind: "sale",
    enabled: true,
    offsetDays: 30,
    text: "नमस्ते {name}, नागरिक सेवा केंद्र से: आपकी रजिस्ट्री (अनुरोध {ref}, {date}) को 30 दिन हो गए। क्या नामांतरण (mutation) हो गया? मदद चाहिए तो \"हाँ करवाना है\" लिखें।",
  },
];

/** PENDING: waiting for its day; SENT: sent; YES: customer wants it; OPTED_OUT / CANCELLED: will not go. */
export type FollowUpStatus = "PENDING" | "SENT" | "YES" | "OPTED_OUT" | "CANCELLED";

export interface FollowUpItem {
  id: string;
  kind: FollowUpKind;
  dueDate: string;
  status: FollowUpStatus;
  /** Mortgage without a known loan period: asked every year. */
  recurring: boolean;
  requestId: string;
  requestRef: string;
  customerName: string | null;
  phoneMasked: string;
  sentAt: string | null;
  repliedAt: string | null;
}

export interface FollowUpList {
  rules: FollowUpRule[];
  data: FollowUpItem[];
  canManage: boolean;
}

/** On a request: which follow-up applies, and the agreement / loan / patta end date. */
export const WaFollowUpKindChoice = z.enum(["auto", "none", "agreement", "patta"]);
export type WaFollowUpKindChoice = z.infer<typeof WaFollowUpKindChoice>;
