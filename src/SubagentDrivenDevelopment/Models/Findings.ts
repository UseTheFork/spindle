export type FindingSeverity = "high" | "medium" | "low";

export type FindingStatus = "open" | "confirmed" | "fixed" | "dismissed" | "deferred";

export interface FindingProvenance {
  report: string;
  headSha: string;
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
  commitSha: string;
  recordedAt: string;
}

export interface ReviewFinding {
  id: string;
  relatedTicket?: string;
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
    headSha: string;
    checkCommands: string[];
    verifiedAt: string;
    verifiedBy: string;
  };
}
