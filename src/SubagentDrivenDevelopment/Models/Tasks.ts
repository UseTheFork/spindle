export const TASK_ID = /^TASK-(\d{4,})$/;

export const TASK_STATUSES = [
  "unassigned",
  "assigned",
  "submitted",
  "accepted",
  "changes-requested",
] as const;

export interface TaskAssignment {
  id: string;
  controller: string;
  worker: string;
  /** Absent only for submitted assignments relocated by finish. */
  worktree?: string;
  report: string;
  assignedAt: string;
  submittedAt?: string;
  submittedBy?: string;
  reportSha256?: string;
}

export interface TaskReview {
  assignment: string;
  result: "accepted" | "changes-requested";
  details: string;
  controller: string;
  recordedAt: string;
}

export interface TaskDefinition {
  id: string;
  title: string;
  instructions: string;
  acceptanceCriteria: string[];
  editPaths: string[];
  createPaths: string[];
  referencePaths: string[];
  dependencies: string[];
  status: (typeof TASK_STATUSES)[number];
  assignment?: TaskAssignment;
  assignmentHistory?: TaskAssignment[];
  review?: TaskReview;
  reviewHistory?: TaskReview[];
}

export interface TaskHandoff {
  ticket: string;
  ticketTitle: string;
  task: string;
  taskTitle: string;
  objective: string;
  acceptanceCriteria: string[];
  parentTicket: {
    requirements: string;
    acceptanceCriteria: string;
  };
  editPaths: string[];
  createPaths: string[];
  referencePaths: string[];
  sharedTicketWorktree: string;
  reportDestination: string;
  assignment: TaskAssignment;
}
