import type {
  AcceptedEvidence,
  CheckRecord,
  IntegrationRecord,
} from "@spindle/SubagentDrivenDevelopment/Models/Evidence";

export const APPROVED_TASK_PLAN_EXCEPTION = {
  feature: "0001-ticket-task-dispatch",
  ticket: "T-0004",
  recoveryTicket: "T-0005",
  scope: "one-corrective-cycle",
  approvalAuthor: "User",
  approvalDate: "2026-11-16",
  approvalCommentAt: "2026-11-16T20:09:41.685Z",
  approvalQuote:
    "extend the SDD workflow with an auditable way to record this approved exception and reopen the already-integrated T-0004 for the necessary corrective change, while preserving its existing evidence and all remaining gates.",
  approvalRemainder:
    "Scope is limited to this feature and T-0004; do not fabricate findings or tasks, and preserve every remaining gate.",
  approvalComment:
    'User approval (2026-11-16): "extend the SDD workflow with an auditable way to record this approved exception and reopen the already-integrated T-0004 for the necessary corrective change, while preserving its existing evidence and all remaining gates." Scope is limited to this feature and T-0004; do not fabricate findings or tasks, and preserve every remaining gate.',
  approvalSource: "tickets/T-0005.md",
} as const;

export interface ImplementationAssignment {
  id: string;
  role: "implementation";
  action: "implement" | "correct";
  controller: string;
  report: string;
  workspace?: string;
  branch?: string;
  startingHeadSha?: string;
  requestedAt: string;
  status: "pending" | "submitted" | "unavailable";
  attempt?: number;
  findingIds?: string[];
  checkFailure?: string;
  objective?: string;
  approvedExceptionId?: string;
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
  approvedExceptionId?: string;
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
  };
}

export interface ApprovedTaskPlanException {
  id: string;
  feature: typeof APPROVED_TASK_PLAN_EXCEPTION.feature;
  ticket: typeof APPROVED_TASK_PLAN_EXCEPTION.ticket;
  recoveryTicket: typeof APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket;
  scope: typeof APPROVED_TASK_PLAN_EXCEPTION.scope;
  approval: {
    author: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalAuthor;
    date: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalDate;
    commentAt: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalCommentAt;
    quote: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalQuote;
    comment: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalComment;
    source: typeof APPROVED_TASK_PLAN_EXCEPTION.approvalSource;
  };
  controller: string;
  recordedAt: string;
  objective: string;
  assignmentId: string;
  attempt: number;
  priorIntegration: IntegrationRecord;
  priorAcceptedEvidence: AcceptedEvidence;
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
  headSha: string;
  reworkBaseSha?: string;
  workspace?: string;
  branch?: string;
  inventory: string[];
  report: string;
  requestedAt: string;
  status: "pending" | "submitted";
  result?: ReviewResult;
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
