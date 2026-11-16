export const TASK_ID = /^TASK-(\d{4,})$/;

export const TASK_STATUSES = [
  "unassigned",
  "assigned",
  "submitted",
  "accepted",
  "changes-requested",
] as const;

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
}
