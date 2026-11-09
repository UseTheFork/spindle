export interface CreateOptions {
  title: string;
  author: string;
  requireRetrospective?: boolean;
  withDesign?: boolean;
}

export interface StatusOptions {
  spec: string;
}

export interface IssueCreateOptions {
  spec: string;
  title: string;
  reporter: string;
  category: string;
  author: string;
}

export interface IssueSelection {
  spec: string;
  issue: string;
  author: string;
}

export interface ScopedSelection {
  spec: string;
  issue?: string;
  scope?: string;
  author: string;
}

export interface IssueUpdateOptions extends IssueSelection {
  title?: string;
  reporter?: string;
  category?: string;
  status?: string;
  blocker?: string;
  clearBlocker?: boolean;
  blockedBy?: string[];
  clearBlockedBy?: boolean;
}

export interface IssueCommentOptions extends IssueSelection {
  details: string;
}

export interface ReadyOptions {
  spec: string;
}

export type ClaimOptions = IssueSelection;

export type ImplementOptions = IssueSelection;

export interface CorrectOptions extends IssueSelection {
  scope?: string;
  findings?: string[];
  checkFailure?: string;
  details: string;
  assessment?: string;
  assessmentResult?: string;
  decision?: string;
  reason?: string;
}

export interface SubmitOptions extends IssueSelection {
  scope?: string;
  role: string;
  report?: string;
  assignment?: string;
  result?: string;
  noFindings?: boolean;
  findingIds?: string[];
  findings?: string[] | boolean;
  unavailable?: boolean;
  details?: string;
}

export interface FindingCreateOptions extends IssueSelection {
  scope?: string;
  relatedIssue?: string;
  source: string;
  snapshot: string;
  severity: string;
  blocking?: boolean;
  nonBlocking?: boolean;
  summary: string;
  details: string;
  link?: string;
}

export interface FindingUpdateOptions extends IssueSelection {
  scope?: string;
  finding: string;
  status: string;
  details?: string;
  followUp?: string;
  evidence?: string;
  requirementsDecision?: string;
}

export interface RequirementsDecideOptions extends ScopedSelection {
  finding: string;
  decision: string;
  details: string;
}

export interface ReviewOptions extends ScopedSelection {
  inventory: string;
}

export interface ReviewRequireOptions extends ScopedSelection {
  type?: string;
  agent?: string;
  details: string;
}

export type AcceptOptions = IssueSelection;

export interface IntegrateOptions extends IssueSelection {
  commit?: string;
}

export interface ResumeOptions extends IssueSelection {
  scope?: string;
  confirmHandoff?: boolean;
}

export interface FinishOptions {
  spec: string;
  author: string;
  report?: string;
}

export interface ChecksRequireOptions extends IssueSelection {
  scope?: string;
  command: string;
  remove?: boolean;
  details?: string;
}

export interface ChecksRecordOptions extends IssueSelection {
  scope?: string;
  snapshot: string;
  command: string;
  result: string;
  paths?: string[];
  details?: string;
}

export interface NextOptions {
  spec: string;
}
