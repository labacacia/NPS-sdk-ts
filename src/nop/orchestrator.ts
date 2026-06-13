// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// NOP DAG Orchestrator — TypeScript port of NPS.NOP.NopOrchestrator (NPS-5 §3, §5).
// Dispatches DelegateFrames in topological order, handles retries, K-of-N,
// condition-based skipping, and result aggregation.

import type { DagNode, TaskDag }  from "./models.js";
import { TaskState, TaskPriority } from "./models.js";
import { validateDag, MAX_DELEGATE_DEPTH } from "./dag-validator.js";
import type { TaskFrame }          from "./frames.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NopTaskRecord {
  taskId:      string;
  frame:       TaskFrame;
  state:       TaskState;
  startedAt:   Date;
  completedAt?: Date;
  nodeResults: Map<string, NodeResult>;
  error?:      { code: string; message: string };
}

export interface NodeResult {
  nodeId:   string;
  ok:       boolean;
  output?:  unknown;
  error?:   { code: string; message: string };
  skipped?: boolean;
}

export interface NopTaskResult {
  taskId:          string;
  state:           TaskState;
  aggregatedResult?: unknown;
  nodeResults:     Record<string, NodeResult>;
  error?:          { code: string; message: string };
}

/** Dispatches a single DAG node to a remote Worker Agent. */
export interface INopWorkerDispatcher {
  dispatch(nodeId: string, node: DagNode, params: unknown, deadlineMs: number): Promise<NodeResult>;
}

// ── In-memory task store ──────────────────────────────────────────────────────

export class InMemoryNopTaskStore {
  private readonly _tasks = new Map<string, NopTaskRecord>();

  get(taskId: string): NopTaskRecord | undefined { return this._tasks.get(taskId); }
  save(record: NopTaskRecord):   void { this._tasks.set(record.taskId, record); }
  delete(taskId: string):        void { this._tasks.delete(taskId); }
  list():  readonly NopTaskRecord[]   { return [...this._tasks.values()]; }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class NopOrchestrator {
  constructor(
    private readonly dispatcher: INopWorkerDispatcher,
    private readonly store:      InMemoryNopTaskStore = new InMemoryNopTaskStore(),
    private readonly opts: {
      defaultTimeoutMs?: number;
      maxTimeoutMs?:     number;
    } = {},
  ) {}

  async execute(task: TaskFrame, signal?: AbortSignal): Promise<NopTaskResult> {
    // 1. Delegation depth guard
    if ((task.depth ?? 0) >= MAX_DELEGATE_DEPTH)
      return this._failure(task.taskId, "NOP-DELEGATE-CHAIN-TOO-DEEP",
        `Delegation chain depth ${task.depth} exceeds maximum of ${MAX_DELEGATE_DEPTH}.`);

    // 2. DAG validation
    const validation = validateDag(task.dag);
    if (!validation.valid)
      return this._failure(task.taskId, validation.errorCode!, validation.errorMessage!);

    // 3. Reject duplicate task IDs
    if (this.store.get(task.taskId))
      return this._failure(task.taskId, "NOP-TASK-ALREADY-COMPLETED",
        `Task '${task.taskId}' already exists.`);

    // 4. Persist initial record
    const record: NopTaskRecord = {
      taskId:      task.taskId,
      frame:       task,
      state:       TaskState.PENDING,
      startedAt:   new Date(),
      nodeResults: new Map(),
    };
    this.store.save(record);

    // 5. Execute DAG in topological order
    const order    = validation.topologicalOrder!;
    const maxMs    = Math.min(
      task.timeoutMs ?? this.opts.defaultTimeoutMs ?? 30_000,
      this.opts.maxTimeoutMs ?? 3_600_000,
    );
    const deadline = Date.now() + maxMs;

    record.state = TaskState.RUNNING;
    this.store.save(record);

    for (const nodeId of order) {
      if (signal?.aborted) {
        record.state = TaskState.CANCELLED;
        record.completedAt = new Date();
        this.store.save(record);
        return this._fromRecord(record);
      }
      if (Date.now() >= deadline) {
        record.state = TaskState.FAILED;
        record.error = { code: "NOP-TASK-TIMEOUT", message: "Task deadline exceeded." };
        record.completedAt = new Date();
        this.store.save(record);
        return this._fromRecord(record);
      }

      const node = task.dag.nodes.find(n => n.id === nodeId)!;

      // Condition-based skip
      if (node.condition && !this._evalCondition(node.condition, record.nodeResults)) {
        record.nodeResults.set(nodeId, { nodeId, ok: true, skipped: true });
        this.store.save(record);
        continue;
      }

      // K-of-N check
      if (!this._kOfNSatisfied(node, record.nodeResults)) {
        // Not enough successful predecessors — skip this node
        record.nodeResults.set(nodeId, { nodeId, ok: false, skipped: true,
          error: { code: "NOP-TASK-NODE-SKIPPED", message: "K-of-N prerequisite not met." } });
        this.store.save(record);
        continue;
      }

      // Resolve inputs from upstream outputs
      const params = this._resolveInputs(node, record.nodeResults);

      // Dispatch with retry
      const nodeTimeoutMs = node.timeoutMs ?? maxMs;
      const retryPolicy   = node.retryPolicy ?? { maxRetries: 2, backoff: "exponential" as const };
      const maxRetries    = retryPolicy.maxRetries ?? 2;

      let result: NodeResult | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const delayMs = this._backoffDelay(retryPolicy, attempt - 1);
          await new Promise(r => setTimeout(r, delayMs));
        }
        try {
          result = await this.dispatcher.dispatch(nodeId, node, params, nodeTimeoutMs);
        } catch (err) {
          result = {
            nodeId,
            ok:    false,
            error: { code: "NOP-TASK-NODE-FAILED", message: String(err) },
          };
        }
        if (result.ok) break;
      }

      record.nodeResults.set(nodeId, result!);
      this.store.save(record);

      // If a non-skipped node failed, fail the whole task
      if (!result!.ok && !result!.skipped) {
        record.state       = TaskState.FAILED;
        record.error       = result!.error;
        record.completedAt = new Date();
        this.store.save(record);
        return this._fromRecord(record);
      }
    }

    // All nodes executed successfully
    record.state       = TaskState.COMPLETED;
    record.completedAt = new Date();
    this.store.save(record);
    return this._fromRecord(record);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _kOfNSatisfied(node: DagNode, results: Map<string, NodeResult>): boolean {
    const deps = node.inputFrom ?? [];
    if (deps.length === 0) return true;
    const minRequired = node.minRequired ?? 0;
    if (minRequired === 0) {
      // All must succeed (or be skipped)
      return deps.every(dep => {
        const r = results.get(dep);
        return r && (r.ok || r.skipped);
      });
    }
    const successCount = deps.filter(dep => {
      const r = results.get(dep);
      return r && r.ok && !r.skipped;
    }).length;
    return successCount >= minRequired;
  }

  private _resolveInputs(node: DagNode, results: Map<string, NodeResult>): unknown {
    if (!node.inputMapping || Object.keys(node.inputMapping).length === 0) {
      // Pass through outputs of all direct predecessors
      const upstream = node.inputFrom ?? [];
      if (upstream.length === 0) return undefined;
      if (upstream.length === 1) return results.get(upstream[0])?.output;
      return Object.fromEntries(
        upstream.map(dep => [dep, results.get(dep)?.output])
      );
    }
    // inputMapping: { localParam: "$.upstreamId.field" }
    const resolved: Record<string, unknown> = {};
    for (const [local, path] of Object.entries(node.inputMapping)) {
      resolved[local] = this._jsonPath(path as string, results);
    }
    return resolved;
  }

  /** Minimal JSONPath evaluator: `$.nodeId.field` → results.get(nodeId).output.field */
  private _jsonPath(path: string, results: Map<string, NodeResult>): unknown {
    const parts = path.replace(/^\$\./, "").split(".");
    if (parts.length < 2) return undefined;
    const [nodeId, ...rest] = parts;
    let val: unknown = results.get(nodeId)?.output;
    for (const key of rest) {
      if (val == null || typeof val !== "object") return undefined;
      val = (val as Record<string, unknown>)[key];
    }
    return val;
  }

  /** Minimal CEL condition evaluator: only handles `$.nodeId.field == "value"` patterns. */
  private _evalCondition(condition: string, results: Map<string, NodeResult>): boolean {
    // Best-effort: if we can't parse it, default to executing the node.
    try {
      const eqMatch = condition.match(/^\s*([\w.$]+)\s*==\s*"([^"]*)"\s*$/);
      if (eqMatch) {
        const val = this._jsonPath(eqMatch[1], results);
        return String(val) === eqMatch[2];
      }
      const neMatch = condition.match(/^\s*([\w.$]+)\s*!=\s*"([^"]*)"\s*$/);
      if (neMatch) {
        const val = this._jsonPath(neMatch[1], results);
        return String(val) !== neMatch[2];
      }
    } catch { /* fall through */ }
    return true;
  }

  private _backoffDelay(
    policy: { backoff: string; baseDelayMs?: number; maxDelayMs?: number },
    attempt: number,
  ): number {
    const base = policy.baseDelayMs ?? 1_000;
    const cap  = policy.maxDelayMs  ?? 30_000;
    let delay: number;
    if (policy.backoff === "fixed")       delay = base;
    else if (policy.backoff === "linear") delay = base * (attempt + 1);
    else                                  delay = base * Math.pow(2, attempt); // exponential
    return Math.min(delay, cap);
  }

  private _failure(taskId: string, code: string, message: string): NopTaskResult {
    return {
      taskId,
      state:       TaskState.FAILED,
      nodeResults: {},
      error:       { code, message },
    };
  }

  private _fromRecord(record: NopTaskRecord): NopTaskResult {
    const nodeResults: Record<string, NodeResult> = {};
    for (const [k, v] of record.nodeResults) nodeResults[k] = v;
    // Aggregate: collect all successful terminal outputs
    const terminals = [...record.nodeResults.values()]
      .filter(r => r.ok && !r.skipped && r.output !== undefined)
      .map(r => r.output);
    return {
      taskId:           record.taskId,
      state:            record.state,
      aggregatedResult: terminals.length === 1 ? terminals[0] : terminals.length > 1 ? terminals : undefined,
      nodeResults,
      error:            record.error,
    };
  }
}
