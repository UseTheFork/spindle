import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
  ReviewAssignment,
  SpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import type {
  AcceptedEvidence,
  IntegrationRecord,
  TicketChecks,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  RequirementsDecision,
  ReviewFinding,
} from "@/SubagentDrivenDevelopment/Models/Findings";

export const FEATURE_DIRECTORY = /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const HISTORICAL_DATE_DIRECTORY = /^\d{4}-\d{2}-\d{2}-/;

export const TICKET_ID = /^T-(\d{4,})$/;

export const TICKET_CATEGORIES = ["bug", "enhancement"] as const;

export const TRACKER_STATUSES = ["open", "in-progress", "closed"] as const;

export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const EXECUTION_STATES = [
  "unstarted",
  "claimed",
  "implementing",
  "reviewing",
  "changes-requested",
  "accepted",
  "integrated",
  "complete",
  "blocked",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export interface TicketProgress {
  id: string;
  title: string;
  reporter: string;
  category: (typeof TICKET_CATEGORIES)[number];
  status: TrackerStatus;
  blockedBy: string[];
  blocker?: string;
  execution: ExecutionState;
  owner?: string;
  baseSha?: string;
  worktree?: {
    workspace: string;
    branch: string;
    baseSha: string;
  };
  acceptedEvidence?: AcceptedEvidence;
  integration?: IntegrationRecord;
  assignment?: ImplementationAssignment;
  correctionAttempts?: CorrectionAttempt[];
  adjudication?: CorrectionAdjudication;
  reviewRequirements?: SpecialistReviewRequirement[];
  reviewAssignments?: ReviewAssignment[];
  reviewHistory?: ReviewAssignment[];
  requirementsDecisions?: RequirementsDecision[];
  checks?: TicketChecks;
  findings?: ReviewFinding[];
}

export interface FeatureLedger {
  schemaVersion: 3;
  featureId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  retrospectiveRequired: boolean;
  reviewPolicy: {
    version: number;
    ticket: string[];
    delivery: string[];
  };
  tickets: TicketProgress[];
  delivery: DeliveryProgress;
}

export interface DeliveryProgress {
  status?: "active" | "complete";
  execution: ExecutionState;
  history: DeliveryHistoryEntry[];
  baseSha?: string;
  owner?: string;
  reviewRequirements?: SpecialistReviewRequirement[];
  reviewAssignments?: ReviewAssignment[];
  reviewHistory?: ReviewAssignment[];
  assignment?: ImplementationAssignment;
  requirementsDecisions?: RequirementsDecision[];
  checks?: TicketChecks;
  findings?: ReviewFinding[];
  correctionAttempts?: CorrectionAttempt[];
  adjudication?: CorrectionAdjudication;
  acceptedEvidence?: AcceptedEvidence;
  finished?: {
    at: string;
    author: string;
    report?: string;
    reportSha256?: string;
  };
}

export interface DeliveryHistoryEntry {
  at: string;
  author: string;
  action: string;
}

export interface FeaturePaths {
  feature: string;
  workspace: string;
  spec: string;
  ledger: string;
}

export interface TicketDocument {
  metadata: Record<string, unknown>;
  id: string;
  title: string;
  reporter: string;
  category: (typeof TICKET_CATEGORIES)[number];
  status: TrackerStatus;
  blocked_by: string[];
  blocker?: string;
  body: string;
  path: string;
  raw: string;
}

export interface RecoveryWrite {
  path: string;
  before: string | null;
  after: string;
}
