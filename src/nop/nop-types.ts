// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NOP Task Protocol — TypeScript Type Definitions
// NPS-5 Neural Orchestration Protocol, MVP subset
//
// NCP carries the envelope. NOP fills the payload.
// IntentFrame dispatches. ResultFrame reports back.

// -----------------------------------------------------------------------------
// NCP Envelope Types (NPS-1)
// -----------------------------------------------------------------------------

/** NCP protocol version marker */
type NcpVersion = 1;

/** Alternative approach considered but not taken */
export interface Alternative {
  value: string;
  probability: number;
}

// -----------------------------------------------------------------------------
// NOP Payload Types — Intent (Dispatch)
// -----------------------------------------------------------------------------

/** NOP protocol version marker */
type NopVersion = 1;

/** Task priority levels */
export type Priority = "urgent" | "normal" | "low";

/** Task category — what kind of work this is */
export type TaskCategory = "code" | "research" | "docs" | "test" | "refactor" | "ops";

/** Task mailbox paths — where files live during lifecycle */
export interface Mailbox {
  /** Base path for the task mailbox */
  base: string;
  /** Active directory name. Default: "active" */
  active?: string;
  /** Done directory name. Default: "done" */
  done?: string;
}

/** Context the worker needs to do its job */
export interface TaskContext {
  /** File paths relevant to the task */
  files?: string[];
  /** Key facts the worker needs to know */
  knowledge?: string[];
  /** Git branch to work on */
  branch?: string;
}

/** Boundaries the worker must operate within */
export interface TaskConstraints {
  /** Model to use: "sonnet", "haiku", "opus" */
  model?: string;
  /** Max seconds for task execution */
  time_limit?: number;
  /** Directories/files the worker may touch */
  scope?: string[];
  /** Whether changes need operator approval gate */
  proceed_gate?: boolean;
}

/** NOP payload for task dispatch (MVP subset of TaskFrame 0x40) */
export interface NopIntentPayload {
  _nop: NopVersion;
  /** Unique task ID: task-{source}-{YYYYMMDD}-{HHMMSS} */
  id: string;
  /** Who dispatched — NPS NID format: urn:nps:agent:{domain}:{name} */
  from: string;
  /** Target worker NID. Omit = any available worker picks up */
  to?: string;
  /** ISO 8601 timestamp when task was dispatched */
  created_at: string;
  /** Task priority. Default: "normal" */
  priority?: Priority;
  /** What kind of work this task involves */
  category?: TaskCategory;
  /** Where task files live during lifecycle */
  mailbox: Mailbox;
  /** Context for the worker */
  context?: TaskContext;
  /** Execution boundaries (NPS-5 §3.2 scope carving) */
  constraints?: TaskConstraints;
}

// -----------------------------------------------------------------------------
// NOP Payload Types — Result (Report Back)
// -----------------------------------------------------------------------------

/** Terminal task states (NPS-5 §4 state machine) */
export type TaskStatus = "completed" | "failed" | "timeout" | "blocked";

/** NOP payload for task result (AlignStream equivalent — NPS-5 §3.4) */
export interface NopResultPayload {
  _nop: NopVersion;
  /** Same task ID from the intent */
  id: string;
  /** Terminal state */
  status: TaskStatus;
  /** Which worker executed — NPS NID format */
  from: string;
  /** ISO 8601 timestamp when worker claimed the task */
  picked_up_at: string;
  /** ISO 8601 timestamp when worker finished */
  completed_at: string;
  /** Files that were modified */
  files_changed?: string[];
  /** Git commit hashes + messages */
  commits?: string[];
  /** New tasks discovered during execution */
  follow_up?: string[];
  /** Seconds the task took */
  duration?: number;
  /** Error message if failed/timeout */
  error?: string | null;
}

// -----------------------------------------------------------------------------
// Full NCP+NOP Messages
// -----------------------------------------------------------------------------

/** Complete intent message: NCP envelope + NOP payload */
export interface IntentMessage {
  _ncp: NcpVersion;
  type: "intent";
  /** Short verb phrase: "fix-bug", "write-test", "research", "refactor" */
  intent: string;
  /** Orchestrator's confidence this is the right task/worker. 0-1 */
  confidence: number;
  /** NOP task payload */
  payload: NopIntentPayload;
}

/** Complete result message: NCP envelope + NOP payload */
export interface ResultMessage {
  _ncp: NcpVersion;
  type: "result";
  /** Human-readable summary of what was done */
  value: string;
  /** Worker's confidence in the result quality. 0-1 */
  probability: number;
  /** Other approaches considered but not taken */
  alternatives: Alternative[];
  /** NOP result payload */
  payload: NopResultPayload;
}

/** Any NOP message */
export type NopMessage = IntentMessage | ResultMessage;

// -----------------------------------------------------------------------------
// Task Lifecycle (NPS-5 §4)
// -----------------------------------------------------------------------------

/** All possible task states */
export type TaskState =
  | "pending"    // inbox/ — waiting for pickup
  | "active"     // active/ — worker executing
  | "completed"  // done/ — success
  | "failed"     // done/ — error
  | "timeout"    // done/ — exceeded time_limit
  | "blocked"    // blocked/ — needs external input
  | "cancelled"; // done/ — orchestrator cancelled

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<string, TaskState[]> = {
  pending:   ["active", "cancelled"],
  active:    ["completed", "failed", "timeout", "blocked"],
  blocked:   ["active", "cancelled"],
  completed: [],
  failed:    [],
  timeout:   [],
  cancelled: [],
};

// -----------------------------------------------------------------------------
// File Naming Conventions
// -----------------------------------------------------------------------------

/** Directory where a task file lives based on its state */
export const STATE_DIRECTORY: Record<TaskState, string> = {
  pending:   "inbox",
  active:    "active",
  completed: "done",
  failed:    "done",
  timeout:   "done",
  blocked:   "blocked",
  cancelled: "done",
};

/** File extensions by message type */
export const FILE_EXTENSIONS = {
  intent: ".intent.json",
  result: ".result.json",
} as const;

/** Default mailbox directory names */
export const MAILBOX_DEFAULTS = {
  active: "active",
  done: "done",
  inbox: "inbox",
  blocked: "blocked",
} as const;
