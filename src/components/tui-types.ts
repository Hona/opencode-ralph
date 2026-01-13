export type RalphStatus = "starting" | "ready" | "running" | "paused" | "complete" | "error";

export type TaskStatus = "done" | "actionable" | "pending";

export type DetailsViewMode = "details" | "output";

export type UiTask = {
  id: string;
  title: string;
  status: TaskStatus;
  line?: number;
  description?: string;
};
