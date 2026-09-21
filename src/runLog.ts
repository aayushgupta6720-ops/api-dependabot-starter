import { appendFileSync } from "node:fs";

const LOG_PATH = "./run-log.jsonl";

export interface PatchLogEntry {
  filePath: string;
  status: "pr_opened" | "no_change_needed" | "error";
  prUrl?: string;
  explanation?: string;
  error?: string;
}

export interface ChangeLogEntry {
  version: string;
  entry: string;
  methodName: string;
  usagesFound: number;
  patches: PatchLogEntry[];
  error?: string;
}

export interface RunLogEntry {
  runId: string;
  startedAt: string;
  durationMs: number;
  targetPackageRepo: string;
  changesFound: number;
  changes: ChangeLogEntry[];
  error?: string;
}

/** Appends one run as a single line of JSON to run-log.jsonl. */
export function appendRunLog(entry: RunLogEntry): void {
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
}
