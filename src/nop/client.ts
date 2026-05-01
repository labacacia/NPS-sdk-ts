// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { NpsFrameCodec } from "../core/codec.js";
import { EncodingTier } from "../core/frames.js";
import { FrameRegistry } from "../core/registry.js";
import { registerNcpFrames } from "../ncp/registry.js";
import { registerNopFrames } from "./registry.js";
import { TaskState } from "./models.js";
import type { TaskFrame } from "./frames.js";

const TERMINAL_STATES = new Set<TaskState>([
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELLED,
]);

export class NopTaskStatus {
  constructor(private readonly _raw: Record<string, unknown>) {}

  get taskId():           string              { return this._raw["task_id"]  as string; }
  get state():            TaskState           { return this._raw["state"] as TaskState; }
  get isTerminal():       boolean             { return TERMINAL_STATES.has(this._raw["state"] as TaskState); }
  get aggregatedResult(): unknown             { return this._raw["aggregated_result"]; }
  get errorCode():        string | undefined  { return (this._raw["error_code"]    as string | null) ?? undefined; }
  get errorMessage():     string | undefined  { return (this._raw["error_message"] as string | null) ?? undefined; }
  get nodeResults():      Record<string, unknown> { return (this._raw["node_results"] as Record<string, unknown> | undefined) ?? {}; }
  get raw():              Record<string, unknown> { return this._raw; }

  toString(): string {
    return `NopTaskStatus(taskId=${this.taskId}, state=${String(this._raw["state"])})`;
  }
}

export class NopClient {
  private readonly _baseUrl: string;
  private readonly _codec:   NpsFrameCodec;
  private readonly _tier:    EncodingTier;

  constructor(
    baseUrl: string,
    options: { defaultTier?: EncodingTier; registry?: FrameRegistry } = {},
  ) {
    this._baseUrl = baseUrl.replace(/\/$/, "");
    this._tier    = options.defaultTier ?? EncodingTier.MSGPACK;

    const registry = options.registry ?? (() => {
      const r = new FrameRegistry();
      registerNcpFrames(r);
      registerNopFrames(r);
      return r;
    })();
    this._codec = new NpsFrameCodec(registry);
  }

  async submit(frame: TaskFrame): Promise<string> {
    const wire = this._codec.encode(frame, { overrideTier: this._tier });
    const res  = await fetch(`${this._baseUrl}/task`, {
      method:  "POST",
      body:    wire as BodyInit,
      headers: { "Content-Type": "application/x-nps-frame", "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`NOP /task failed: HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    return data["task_id"] as string;
  }

  async getStatus(taskId: string): Promise<NopTaskStatus> {
    const res = await fetch(`${this._baseUrl}/task/${taskId}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`NOP /task/${taskId} failed: HTTP ${res.status}`);
    return new NopTaskStatus(await res.json() as Record<string, unknown>);
  }

  async cancel(taskId: string): Promise<void> {
    const res = await fetch(`${this._baseUrl}/task/${taskId}/cancel`, {
      method:  "POST",
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`NOP /task/${taskId}/cancel failed: HTTP ${res.status}`);
  }

  async wait(
    taskId: string,
    options: { pollIntervalMs?: number; timeoutMs?: number } = {},
  ): Promise<NopTaskStatus> {
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const timeoutMs      = options.timeoutMs      ?? 30_000;
    const deadline       = Date.now() + timeoutMs;

    while (true) {
      const status = await this.getStatus(taskId);
      if (status.isTerminal) return status;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Task '${taskId}' did not complete within ${timeoutMs}ms (state: ${String(status.raw["state"])}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
    }
  }
}
