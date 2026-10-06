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
  /** The text put in {{PARTNER}} (the whole seller block of that partner pair). */
  text: z.string().trim().min(5).max(4000),
});
export type ColonyPartner = z.infer<typeof ColonyPartner>;

/** PLOT: a plotted colony (block / plot). SHOP: a commercial building (unit no. / floor), e.g. "TF-16". */
export const ColonyProjectKind = z.enum(["PLOT", "SHOP"]);
export type ColonyProjectKind = z.infer<typeof ColonyProjectKind>;

export const ColonyProjectInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    kind: ColonyProjectKind.default("PLOT"),
    village: z.string().trim().max(100),
    ward: z.string().trim().max(40).default(""),
    /** Survey / khasra numbers of the project land ("123, 124/2"). */
    surveyNos: z.string().trim().max(400).default(""),
    /** Other names to find the old deeds / the project in a message ("फ्लोरा सिटी, phlora siti"). */
    aliases: z.string().trim().max(300).default(""),
    /** Guideline row (office calculator) the project lies in -- the guideline value comes from the calculator. */
    guidelineSno: z.number().int().min(1).max(100_000).nullable().default(null),
    developer: z.string().trim().max(200),
    partners: z.array(ColonyPartner).max(6),
    /** Two development-permission references (T&CP / colony permission ...). */
    devPermissions: z.array(z.string().trim().max(3000)).max(2),
    /** Two maintenance clauses. */
    maintenanceClauses: z.array(z.string().trim().max(3000)).max(2),
    /** Fallback only, when no guideline row is chosen: ₹ per square metre. */
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
  kind: "PLOT",
  village: "डोंगरपुर",
  ward: "",
  surveyNos: "",
  aliases: "फ्लोरा सिटी",
  guidelineSno: null,
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
  /** Corner plot: the calculator's +10%. */
  corner: boolean;
  /** SHOP projects: the floor ("तृतीय तल"). */
  floor: string | null;
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
  code:
    | "doubleSale"
    | "belowGuideline"
    | "areaMismatch"
    | "sampadaFields"
    | "paymentTotal"
    | "cashLimit"
    | "notLive"
    | "partner"
    | "boundarySelf"
    | "duplicateClause";
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

// ---------- Setup from the old deeds of the project ----------
/** Which old deed(s) a suggested value came from (shown next to every field). */
export interface ColonySource {
  deedId: string;
  title: string;
}
export interface ColonySourced<T> {
  value: T;
  from: ColonySource[];
}

export interface ColonySetupSuggestion {
  /** The old deeds that were read (most recent first). */
  deeds: ColonySource[];
  kind: ColonySourced<ColonyProjectKind> | null;
  developer: ColonySourced<string> | null;
  village: ColonySourced<string> | null;
  ward: ColonySourced<string> | null;
  surveyNos: ColonySourced<string> | null;
  /** One variant per distinct partner pair; label = the partner who changes. */
  partners: (ColonyPartner & { from: ColonySource[] })[];
  devPermissions: ColonySourced<string>[];
  maintenanceClauses: ColonySourced<string>[];
  /**
   * When the deeds carry the same maintenance clause in two forms, which one
   * was kept: the owner's final form is "रजिस्ट्री दिनांक से देय".
   */
  maintenanceChoices: { chosenStart: string | null; droppedStarts: string[] }[];
  /** Standard text with the markers; no party Aadhaar / PAN / mobile. */
  template: (ColonySourced<string> & { found: string[]; missing: string[] }) | null;
  /** Sold plots / units read from the deeds (import as SOLD). */
  plots: (Omit<ColonyPlot, "id" | "status"> & { from: ColonySource })[];
  /** Guideline rows matching the project name (office calculator). */
  guideline: ColonyGuidelineRow[];
  /** Things the owner should look at (Hindi). */
  warnings: string[];
}

export interface ColonyGuidelineRow {
  sno: number;
  hi: string;
  en: string;
  ward: string;
  /** ₹ / sqm: residential plot, commercial plot, multi-storey commercial (shops). */
  plotRes: number;
  plotCom: number;
  multiCom: number;
}

export const ColonySoldPlotsInput = z
  .object({
    plots: z
      .array(
        z.object({
          block: z.string().trim().max(20),
          plotNo: z.string().trim().min(1).max(20),
          ewFt: z.number().positive().nullable(),
          nsFt: z.number().positive().nullable(),
          areaSqft: z.number().positive().nullable(),
          east: z.string().trim().max(300).nullable(),
          west: z.string().trim().max(300).nullable(),
          north: z.string().trim().max(300).nullable(),
          south: z.string().trim().max(300).nullable(),
          corner: z.boolean(),
          floor: z.string().trim().max(60).nullable(),
        }),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export type ColonySoldPlotsInput = z.infer<typeof ColonySoldPlotsInput>;
