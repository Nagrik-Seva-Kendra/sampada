import { z } from "zod";

/**
 * A customer asks on WhatsApp for a copy of a registry the office drafted for
 * them. OFF by default; only deeds that match the WhatsApp number exactly;
 * a 6-digit code confirms; staff send a watermarked PDF; at most N a day.
 */
export interface ArchiveCopySettings {
  enabled: boolean;
  dailyLimit: number;
  canManage: boolean;
}
export const ArchiveCopySettingsInput = z.object({ enabled: z.boolean(), dailyLimit: z.number().int().min(1).max(10) }).strict();

export interface ArchiveCopyItem {
  id: string;
  number: number;
  phoneMasked: string;
  deedId: string;
  deedTitle: string;
  status: "REQUESTED" | "SENT" | "REJECTED";
  createdAt: string;
  sentAt: string | null;
  /** Why it is not sent yet (window closed ...). */
  reason: string | null;
}

/** Deed text for the browser to render the watermarked PDF (Aadhaar/PAN cut to the last 4). */
export interface ArchiveCopyDeed {
  title: string;
  content: string;
  fileName: string;
  watermark: string;
}

export const ArchiveCopySendInput = z.object({ pdfBase64: z.string().min(10).max(14_000_000) }).strict();
