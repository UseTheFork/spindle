export interface AcceptedEvidence {
  commitSha: string;
  files: string[];
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
  headSha: string;
  recordedAt: string;
  coveredPaths?: string[];
  details?: string;
}

export interface CommitIdentity {
  headSha: string;
}
