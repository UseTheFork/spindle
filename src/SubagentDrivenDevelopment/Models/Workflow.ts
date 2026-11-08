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
  IssueChecks,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  RequirementsDecision,
  ReviewFinding,
} from "@/SubagentDrivenDevelopment/Models/Findings";

export const FEATURE_DIRECTORY = /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const HISTORICAL_DATE_DIRECTORY = /^\d{4}-\d{2}-\d{2}-/;

export const ISSUE_ID = /^I-(\d{4,})$/;

export const ISSUE_CATEGORIES = ["bug", "enhancement"] as const;

export const TRIAGE_STATUSES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;

export const EXECUTION_STATES = [
  "unstarted",
  "claimed",
  "implementing",
  "reviewing",
  "changes-requested",
  "accepted",
  "integrated",
  "blocked",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export interface IssueProgress {
  id: string;
  execution: ExecutionState;
  owner?: string;
  baseSha?: string;
  acceptedEvidence?: AcceptedEvidence;
  integration?: IntegrationRecord;
  assignment?: ImplementationAssignment;
  correctionAttempts?: CorrectionAttempt[];
  adjudication?: CorrectionAdjudication;
  reviewRequirements?: SpecialistReviewRequirement[];
  reviewAssignments?: ReviewAssignment[];
  reviewHistory?: ReviewAssignment[];
  requirementsDecisions?: RequirementsDecision[];
  checks?: IssueChecks;
  findings?: ReviewFinding[];
}

export interface FeatureLedger {
  schemaVersion: number;
  featureId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  retrospectiveRequired: boolean;
  reviewPolicy: {
    version: number;
    issue: string[];
    delivery: string[];
  };
  issues: IssueProgress[];
  delivery: DeliveryProgress;
}

export interface DeliveryProgress {
  execution: ExecutionState;
  history: DeliveryHistoryEntry[];
  baseSha?: string;
  owner?: string;
  reviewRequirements?: SpecialistReviewRequirement[];
  reviewAssignments?: ReviewAssignment[];
  reviewHistory?: ReviewAssignment[];
  assignment?: ImplementationAssignment;
  requirementsDecisions?: RequirementsDecision[];
  checks?: IssueChecks;
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

export interface IssueDocument {
  metadata: Record<string, unknown>;
  id: string;
  title: string;
  reporter: string;
  category: (typeof ISSUE_CATEGORIES)[number];
  status: (typeof TRIAGE_STATUSES)[number];
  blocked_by: string[];
  body: string;
  path: string;
  raw: string;
}

export interface RecoveryWrite {
  path: string;
  before: string | null;
  after: string;
}
