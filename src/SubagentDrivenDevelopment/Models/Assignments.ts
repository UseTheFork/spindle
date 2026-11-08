import type { CheckRecord } from "@/SubagentDrivenDevelopment/Models/Evidence";

export interface ImplementationAssignment {
  id: string;
  role: "implementation";
  action: "implement" | "correct";
  controller: string;
  report: string;
  requestedAt: string;
  status: "pending" | "submitted" | "unavailable";
  attempt?: number;
  findingIds?: string[];
  checkFailure?: string;
  objective?: string;
  reportSha256?: string;
  submittedAt?: string;
  submittedBy?: string;
  unavailableDetails?: string;
  handoffs: { at: string; from: string; to: string; confirmedStopped: boolean }[];
}

export interface CorrectionAttempt {
  number: number;
  findingIds: string[];
  checkFailure?: string;
  objective: string;
  startedAt: string;
  startedBy: string;
  assignmentId: string;
  assignment: ImplementationAssignment;
  priorAssignment?: ImplementationAssignment;
  checks?: CheckRecord[];
  reviewAssignments?: ReviewAssignment[];
  progressAssessment?: {
    decision: "continue";
    result: "productive";
    details: string;
    recordedAt: string;
    recordedBy: string;
  };
  outcome?: {
    result: "productive" | "unproductive";
    details: string;
    recordedAt: string;
    recordedBy: string;
    snapshot?: string;
  };
}

export interface CorrectionAdjudication {
  status: "pending" | "resolved";
  reason: string;
  details: string;
  recordedAt: string;
  recordedBy: string;
  resolution?: {
    details: string;
    recordedAt: string;
    recordedBy: string;
  };
}

export type ReviewResult = "passed" | "failed" | "unavailable";

export interface ReviewAssignment {
  id: string;
  agent: string;
  role: "review";
  scope: "initial" | "corrective" | "delivery";
  attempt?: number;
  objective?: string;
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
  inventory: string[];
  report: string;
  requestedAt: string;
  status: "pending" | "submitted";
  result?: ReviewResult;
  noFindings?: true;
  findingIds?: string[];
  reportSha256?: string;
  submittedAt?: string;
  submittedBy?: string;
  details?: string;
}

export interface SpecialistReviewRequirement {
  agent: string;
  details: string;
  author: string;
  requestedAt: string;
}
