/** Owner home: today's numbers, each linking to its page. Role-aware (staff see their own). */
export interface HomeCard {
  key:
    | "waNew"
    | "callbacks"
    | "registryToday"
    | "registryTomorrow"
    | "tasksToday"
    | "followUps"
    | "leavesPending"
    | "attendance"
    | "aiReview"
    | "colonyDrafts"
    | "copyRequests"
    | "lowRatings";
  value: number;
  /** e.g. attendance "present of total". */
  total?: number;
  /** Web route the card opens. */
  to: string;
  /** Needs attention (shown highlighted). */
  alert: boolean;
}

export interface HomeSummary {
  name: string;
  canManage: boolean;
  cards: HomeCard[];
}

export type SearchKind = "request" | "deed" | "task" | "callback" | "plot";
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** Web route to open. */
  to: string;
}
