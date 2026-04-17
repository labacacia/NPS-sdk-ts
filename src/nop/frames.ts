// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";
import type { AggregateStrategy, TaskContext, TaskDag, TaskPriority } from "./models.js";

// ── TaskFrame ─────────────────────────────────────────────────────────────────

export class TaskFrame implements NpsFrame {
  readonly frameType     = FrameType.TASK;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly taskId:       string,
    public readonly dag:          TaskDag,
    public readonly timeoutMs?:   number,
    public readonly callbackUrl?: string,
    public readonly context?:     TaskContext,
    public readonly priority?:    TaskPriority,
    public readonly depth?:       number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      task_id:      this.taskId,
      dag:          this.dag,
      timeout_ms:   this.timeoutMs   ?? null,
      callback_url: this.callbackUrl ?? null,
      context:      this.context     ?? null,
      priority:     this.priority    ?? null,
      depth:        this.depth       ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): TaskFrame {
    return new TaskFrame(
      data["task_id"]      as string,
      data["dag"]          as TaskDag,
      (data["timeout_ms"]   as number | null) ?? undefined,
      (data["callback_url"] as string | null) ?? undefined,
      (data["context"]      as TaskContext | null) ?? undefined,
      (data["priority"]     as TaskPriority | null) ?? undefined,
      (data["depth"]        as number | null) ?? undefined,
    );
  }
}

// ── DelegateFrame ─────────────────────────────────────────────────────────────

export class DelegateFrame implements NpsFrame {
  readonly frameType     = FrameType.DELEGATE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly taskId:         string,
    public readonly subtaskId:      string,
    public readonly action:         string,
    public readonly agentNid:       string,
    public readonly inputs?:        Record<string, unknown>,
    public readonly params?:        Record<string, unknown>,
    public readonly idempotencyKey?: string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      task_id:         this.taskId,
      subtask_id:      this.subtaskId,
      action:          this.action,
      agent_nid:       this.agentNid,
      inputs:          this.inputs          ?? null,
      params:          this.params          ?? null,
      idempotency_key: this.idempotencyKey  ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): DelegateFrame {
    return new DelegateFrame(
      data["task_id"]         as string,
      data["subtask_id"]      as string,
      data["action"]          as string,
      data["agent_nid"]       as string,
      (data["inputs"]          as Record<string, unknown> | null) ?? undefined,
      (data["params"]          as Record<string, unknown> | null) ?? undefined,
      (data["idempotency_key"] as string | null) ?? undefined,
    );
  }
}

// ── SyncFrame ─────────────────────────────────────────────────────────────────

export class SyncFrame implements NpsFrame {
  readonly frameType     = FrameType.SYNC;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly taskId:      string,
    public readonly syncId:      string,
    public readonly waitFor:     readonly string[],
    public readonly minRequired: number = 0,
    public readonly aggregate:   AggregateStrategy | string = "merge",
    public readonly timeoutMs?:  number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      task_id:      this.taskId,
      sync_id:      this.syncId,
      wait_for:     this.waitFor,
      min_required: this.minRequired,
      aggregate:    this.aggregate,
      timeout_ms:   this.timeoutMs ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): SyncFrame {
    return new SyncFrame(
      data["task_id"]      as string,
      data["sync_id"]      as string,
      data["wait_for"]     as string[],
      (data["min_required"] as number) ?? 0,
      (data["aggregate"]    as string) ?? "merge",
      (data["timeout_ms"]   as number | null) ?? undefined,
    );
  }
}

// ── StreamError ───────────────────────────────────────────────────────────────

export interface StreamError {
  errorCode: string;
  message?:  string;
}

// ── AlignStreamFrame ──────────────────────────────────────────────────────────

export class AlignStreamFrame implements NpsFrame {
  readonly frameType     = FrameType.ALIGN_STREAM;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly streamId:   string,
    public readonly taskId:     string,
    public readonly subtaskId:  string,
    public readonly seq:        number,
    public readonly isFinal:    boolean,
    public readonly senderNid:  string,
    public readonly data?:      Record<string, unknown>,
    public readonly error?:     StreamError,
    public readonly windowSize?: number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      stream_id:   this.streamId,
      task_id:     this.taskId,
      subtask_id:  this.subtaskId,
      seq:         this.seq,
      is_final:    this.isFinal,
      sender_nid:  this.senderNid,
      data:        this.data        ?? null,
      error:       this.error ? { error_code: this.error.errorCode, message: this.error.message ?? null } : null,
      window_size: this.windowSize  ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): AlignStreamFrame {
    const rawError = data["error"] as { error_code: string; message?: string } | null;
    return new AlignStreamFrame(
      data["stream_id"]  as string,
      data["task_id"]    as string,
      data["subtask_id"] as string,
      data["seq"]        as number,
      data["is_final"]   as boolean,
      data["sender_nid"] as string,
      (data["data"]        as Record<string, unknown> | null) ?? undefined,
      rawError ? { errorCode: rawError.error_code, ...(rawError.message != null ? { message: rawError.message } : {}) } : undefined,
      (data["window_size"] as number | null) ?? undefined,
    );
  }
}
