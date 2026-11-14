export interface CreateOptions {
  title: string;
  author: string;
  requireRetrospective?: boolean;
  withDesign?: boolean;
}

export interface StatusOptions {
  spec: string;
}

export interface StartOptions {
  spec: string;
  workspace: string;
  confirmRecords: boolean;
}

export interface TicketCreateOptions {
  spec: string;
  title: string;
  reporter: string;
  category: string;
  author: string;
}

export interface TicketSelection {
  spec: string;
  ticket: string;
  author: string;
}

export interface ScopedSelection {
  spec: string;
  ticket?: string;
  scope?: string;
  author: string;
}

export interface TicketUpdateOptions extends TicketSelection {
  title?: string;
  reporter?: string;
  category?: string;
  blocker?: string;
  clearBlocker?: boolean;
  blockedBy?: string[];
  clearBlockedBy?: boolean;
}

export interface TicketCommentOptions extends TicketSelection {
  details: string;
}

export interface ReadyOptions {
  spec: string;
}

export interface ImplementOptions extends TicketSelection {
  workspace: string;
}

export interface CorrectOptions extends TicketSelection {
  scope?: string;
  findings?: string[];
  checkFailure?: string;
  details: string;
  assessment?: string;
  decision?: string;
  reason?: string;
}

export interface SubmitOptions extends ScopedSelection {
  scope?: string;
  assignment: string;
  result?: string;
  details?: string;
}

export interface FindingCreateOptions extends ScopedSelection {
  scope?: string;
  relatedTicket?: string;
  assignment: string;
  blocking?: boolean;
  nonBlocking?: boolean;
  summary: string;
  details: string;
  link?: string;
}

export interface FindingUpdateOptions extends TicketSelection {
  scope?: string;
  finding: string;
  status: string;
  details?: string;
  followUp?: string;
  requirementsDecision?: string;
}

export interface RequirementsDecideOptions extends ScopedSelection {
  finding: string;
  decision: string;
  details: string;
}

export type ReviewOptions = ScopedSelection;

export interface ReviewRequireOptions extends ScopedSelection {
  type?: string;
  agent?: string;
  details: string;
}

export interface ResumeOptions extends TicketSelection {
  scope?: string;
  confirmHandoff?: boolean;
}

export interface ClaimOptions {
  spec: string;
  scope: string;
  author: string;
}

export type IntegrateOptions = TicketSelection;

export interface FinishOptions {
  spec: string;
  author: string;
  report?: string;
}

export interface ChecksRequireOptions extends TicketSelection {
  scope?: string;
  command: string;
  rebaseBaseline?: boolean;
  remove?: boolean;
  details?: string;
}

export interface ChecksRecordOptions extends TicketSelection {
  scope?: string;
  command: string;
  result: string;
  paths?: string[];
  details?: string;
}

export interface NextOptions {
  spec: string;
}
