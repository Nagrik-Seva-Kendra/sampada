import { z } from "zod";

/**
 * Colony auto-draft: a developer's project (first: FLORA CITY, ग्राम डोंगरपुर,
 * मेसर्स ग्रीन इन्फ्राटेक), its plot master, and plot sales whose deed is the
 * colony's standard text with only 4 blocks changed: buyer, plot, boundary,
 * payment. The owner sets a project "live" himself.
 */
export const COLONY_MARKERS = ["{{BUYER}}", "{{PLOT}}", "{{BOUNDARY}}", "{{PAYMENT}}"] as const;
/** Optional markers filled from the project master. */
export const COLONY_OPTIONAL_MARKERS = ["{{PARTNER}}", "{{DEV_PERMISSION}}", "{{MAINTENANCE}}"] as const;

export const ColonyPartner = z.object({
  key: z.string().trim().min(1).max(30),
  /** Shown in the sale form ("महेश"). */
  label: z.string().trim().min(1).max(60),
  /** The text put in {{PARTNER}} ("द्वारा भागीदार श्री महेश ... पुत्र श्री ..."). */
  text: z.string().trim().min(5).max(600),
});
export type ColonyPartner = z.infer<typeof ColonyPartner>;

export const ColonyProjectInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    village: z.string().trim().max(100),
    developer: z.string().trim().max(200),
    partners: z.array(ColonyPartner).max(6),
    /** Two development-permission references (T&CP / colony permission ...). */
    devPermissions: z.array(z.string().trim().max(400)).max(2),
    /** Two maintenance clauses. */
    maintenanceClauses: z.array(z.string().trim().max(1500)).max(2),
    /** Guideline rate ₹ per square metre (for the "less than guideline" check). */
    guidelineRatePerSqm: z.number().min(0).max(10_000_000).nullable(),
    /** Colony standard text with {{BUYER}} {{PLOT}} {{BOUNDARY}} {{PAYMENT}}. */
    template: z.string().max(60_000),
    templateDeedId: z.string().max(64).nullable(),
    /** WhatsApp numbers of the company's people (company mode); 10 digits or with 91. */
    companyNumbers: z.array(z.string().trim().max(20)).max(10),
  })
  .strict();
export type ColonyProjectInput = z.infer<typeof ColonyProjectInput>;

/** FLORA CITY, prefilled for the first project (partners' full text is the owner's to fill). */
export const FLORA_CITY_DEFAULTS: ColonyProjectInput = {
  name: "FLORA CITY",
  village: "डोंगरपुर",
  developer: "मेसर्स ग्रीन इन्फ्राटेक",
  partners: [
    { key: "mahesh", label: "महेश", text: "मेसर्स ग्रीन इन्फ्राटेक द्वारा भागीदार श्री महेश ____ पुत्र श्री ____" },
    { key: "rohit", label: "रोहित", text: "मेसर्स ग्रीन इन्फ्राटेक द्वारा भागीदार श्री रोहित ____ पुत्र श्री ____" },
  ],
  devPermissions: ["", ""],
  maintenanceClauses: ["", ""],
  guidelineRatePerSqm: null,
  template: "",
  templateDeedId: null,
  companyNumbers: [],
};

export interface ColonyProject extends ColonyProjectInput {
  id: string;
  live: boolean;
  /** What is still missing before it may go live (Hindi). */
  readiness: string[];
  createdAt: string;
}

export const ColonyPlotStatus = z.enum(["AVAILABLE", "DRAFTED", "SOLD"]);
export type ColonyPlotStatus = z.infer<typeof ColonyPlotStatus>;

export interface ColonyPlot {
  id: string;
  block: string;
  plotNo: string;
  ewFt: number | null;
  nsFt: number | null;
  areaSqft: number | null;
  east: string | null;
  west: string | null;
  north: string | null;
  south: string | null;
  status: ColonyPlotStatus;
}

export interface ColonyImportResult {
  added: number;
  updated: number;
  /** Row number (1-based, header = 1) + Hindi reason. */
  errors: { row: number; reason: string }[];
}

export const PaymentMode = z.enum(["cash", "cheque", "upi", "rtgs", "dd", "loan"]);
export type PaymentMode = z.infer<typeof PaymentMode>;

export const Instalment = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().min(1).max(1_000_000_000),
  mode: PaymentMode,
  ref: z.string().trim().max(120).default(""),
});
export type Instalment = z.infer<typeof Instalment>;

export const ColonyBuyer = z.object({
  name: z.string().trim().min(2).max(120),
  relation: z.enum(["पुत्र", "पुत्री", "पत्नी"]),
  guardian: z.string().trim().max(120),
  motherName: z.string().trim().max(120).default(""),
  address: z.string().trim().max(400).default(""),
  mobile: z.string().trim().max(20).default(""),
  email: z.string().trim().max(120).default(""),
  /** Sent in full once; stored encrypted, shown masked. */
  aadhaar: z.string().trim().max(20).default(""),
  pan: z.string().trim().max(12).default(""),
});
export type ColonyBuyer = z.infer<typeof ColonyBuyer>;

export const ColonySaleInput = z
  .object({
    plotId: z.string().min(1).max(64),
    partnerKey: z.string().max(30),
    buyers: z.array(ColonyBuyer).min(1).max(4),
    consideration: z.number().int().min(1).max(1_000_000_000),
    instalments: z.array(Instalment).min(1).max(20),
  })
  .strict();
export type ColonySaleInput = z.infer<typeof ColonySaleInput>;

export type ColonyCheckLevel = "error" | "warning";
export interface ColonyCheck {
  level: ColonyCheckLevel;
  code: "doubleSale" | "belowGuideline" | "areaMismatch" | "sampadaFields" | "paymentTotal" | "cashLimit" | "notLive" | "partner";
  message: string;
}

export interface ColonySale {
  id: string;
  number: number;
  plotId: string;
  plotLabel: string;
  partnerKey: string;
  buyers: (Omit<ColonyBuyer, "aadhaar" | "pan"> & { aadhaarMasked: string | null; panMasked: string | null })[];
  consideration: number;
  instalments: Instalment[];
  /** whatsapp | web | excel */
  source: string;
  status: "DRAFT" | "DEED_CREATED" | "CANCELLED";
  deedId: string | null;
  deedType: string | null;
  title: string;
  checks: ColonyCheck[];
  createdAt: string;
}

export interface ColonyDashboard {
  project: ColonyProject;
  plots: { total: number; available: number; drafted: number; sold: number; byBlock: { block: string; total: number; available: number }[] };
  sales: { total: number; deeds: number; consideration: number; withErrors: number; withWarnings: number };
}
