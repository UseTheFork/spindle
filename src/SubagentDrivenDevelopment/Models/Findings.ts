export type FindingSeverity = "high" | "medium" | "low";

export type FindingStatus = "open" | "confirmed" | "fixed" | "dismissed" | "deferred";

export interface FindingProvenance {
  report: string;
  snapshot: string;
  author: string;
  summary: string;
  details: string;
}

export interface FindingHistoryEntry {
  at: string;
  author: string;
  action: string;
  details: string;
}

export interface RequirementsDecision {
  id: string;
  finding: string;
  status: "approved" | "rejected";
  details: string;
  author: string;
  requirementsSnapshot: string;
  recordedAt: string;
}

export interface ReviewFinding {
  id: string;
  relatedIssue?: string;
  severity: FindingSeverity;
  blocking: boolean;
  status: FindingStatus;
  summary: string;
  details: string;
  author: string;
  createdAt: string;
  provenance: FindingProvenance[];
  history: FindingHistoryEntry[];
  rulingDetails?: string;
  followUp?: string;
  requirementsDecision?: string;
  verification?: {
    snapshot: string;
    checkCommands: string[];
    verifiedAt: string;
    verifiedBy: string;
  };
}
