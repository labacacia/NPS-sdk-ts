// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

export enum TaskState {
  PENDING       = "pending",
  PREFLIGHT     = "preflight",
  RUNNING       = "running",
  WAITING_SYNC  = "waiting_sync",
  COMPLETED     = "completed",
  FAILED        = "failed",
  CANCELLED     = "cancelled",
  SKIPPED       = "skipped",
}

export enum TaskPriority {
  LOW    = "low",
  NORMAL = "normal",
  HIGH   = "high",
}

export enum BackoffStrategy {
  FIXED       = "fixed",
  LINEAR      = "linear",
  EXPONENTIAL = "exponential",
}

export enum AggregateStrategy {
  MERGE      = "merge",
  FIRST      = "first",
  FASTEST_K  = "fastest_k",
  ALL        = "all",
}

export interface RetryPolicy {
  maxRetries:   number;
  backoff:      BackoffStrategy;
  baseDelayMs?: number;
  maxDelayMs?:  number;
}

export function computeDelayMs(policy: RetryPolicy, attempt: number): number {
  const base = policy.baseDelayMs ?? 1000;
  const cap  = policy.maxDelayMs  ?? 30_000;
  let delay: number;
  switch (policy.backoff) {
    case BackoffStrategy.FIXED:       delay = base; break;
    case BackoffStrategy.LINEAR:      delay = base * (attempt + 1); break;
    case BackoffStrategy.EXPONENTIAL: delay = base * Math.pow(2, attempt); break;
  }
  return Math.min(delay, cap);
}

export interface TaskContext {
  sessionKey?:    string;
  requesterNid?:  string;
  traceId?:       string;
}

export interface DagNode {
  id:             string;
  action:         string;
  agent:          string;
  inputFrom?:     readonly string[];
  inputMapping?:  Record<string, string>;
  timeoutMs?:     number;
  retryPolicy?:   RetryPolicy;
  condition?:     string;
  minRequired?:   number;
}

export interface DagEdge {
  from: string;
  to:   string;
}

export interface TaskDag {
  nodes: readonly DagNode[];
  edges: readonly DagEdge[];
}
