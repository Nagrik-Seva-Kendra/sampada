/** Archive risk check for a property: warnings from the office's own older deeds. */
export interface RiskWarningItem {
  code: "doubleSale" | "chain" | "mortgage";
  message: string;
  deedId: string;
  deedTitle: string;
  deedType: string;
  date: string;
}

export interface ArchiveRiskResult {
  /** false: the request has no property number / place to compare. */
  checked: boolean;
  warnings: RiskWarningItem[];
  /** Older deeds of the same property found in the archive. */
  sameProperty: number;
  index: { indexed: number; total: number; lastRunAt: string | null };
}
