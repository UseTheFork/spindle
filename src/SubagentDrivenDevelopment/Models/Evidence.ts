export interface AcceptedEvidence {
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  files: string[];
  contentDigest: string;
}

export interface IntegrationRecord {
  commitSha: string;
  mergeSha?: string;
  postMerge?: {
    status: "pending" | "passed";
    mergeSha: string;
    checks?: TicketChecks;
  };
  integratedAt: string;
  integratedBy: string;
  files: string[];
  contentDigest: string;
}

export interface CheckRequirement {
  command: string;
  addedAt: string;
  addedBy: string;
  removedAt?: string;
  removedBy?: string;
  removalDetails?: string;
}

export interface TicketChecks {
  required: CheckRequirement[];
  records: CheckRecord[];
}

export interface CheckRecord {
  command: string;
  result: "passed" | "failed" | "unavailable";
  author: string;
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
  recordedAt: string;
  coveredPaths?: string[];
  coverageSnapshot?: string;
  details?: string;
}

export interface ContentIdentity {
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
}
