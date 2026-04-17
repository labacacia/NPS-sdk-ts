// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

// ── Filter DSL ────────────────────────────────────────────────────────────────

export interface QueryOrderClause {
  field: string;
  dir:   "asc" | "desc";
}

export interface VectorSearchOptions {
  vector:      readonly number[];
  topK?:       number;
  minScore?:   number;
  vectorField?: string;
}

// ── QueryFrame ────────────────────────────────────────────────────────────────

export class QueryFrame implements NpsFrame {
  readonly frameType     = FrameType.QUERY;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly anchorRef?:    string,
    public readonly filter?:       Record<string, unknown>,
    public readonly limit?:        number,
    public readonly offset?:       number,
    public readonly orderBy?:      readonly QueryOrderClause[],
    public readonly fields?:       readonly string[],
    public readonly vectorSearch?: VectorSearchOptions,
    public readonly depth?:        number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      anchor_ref:    this.anchorRef    ?? null,
      filter:        this.filter       ?? null,
      limit:         this.limit        ?? null,
      offset:        this.offset       ?? null,
      order_by:      this.orderBy      ?? null,
      fields:        this.fields       ?? null,
      vector_search: this.vectorSearch ?? null,
      depth:         this.depth        ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): QueryFrame {
    return new QueryFrame(
      (data["anchor_ref"]    as string  | null) ?? undefined,
      (data["filter"]        as Record<string, unknown> | null) ?? undefined,
      (data["limit"]         as number  | null) ?? undefined,
      (data["offset"]        as number  | null) ?? undefined,
      (data["order_by"]      as QueryOrderClause[] | null) ?? undefined,
      (data["fields"]        as string[] | null) ?? undefined,
      (data["vector_search"] as VectorSearchOptions | null) ?? undefined,
      (data["depth"]         as number  | null) ?? undefined,
    );
  }
}

// ── ActionFrame ───────────────────────────────────────────────────────────────

export class ActionFrame implements NpsFrame {
  readonly frameType     = FrameType.ACTION;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly actionId:        string,
    public readonly params?:         Record<string, unknown>,
    public readonly async_?:         boolean,
    public readonly idempotencyKey?: string,
    public readonly timeoutMs?:      number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      action_id:       this.actionId,
      params:          this.params          ?? null,
      async:           this.async_          ?? false,
      idempotency_key: this.idempotencyKey  ?? null,
      timeout_ms:      this.timeoutMs       ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): ActionFrame {
    return new ActionFrame(
      data["action_id"]       as string,
      (data["params"]          as Record<string, unknown> | null) ?? undefined,
      (data["async"]           as boolean | null) ?? undefined,
      (data["idempotency_key"] as string  | null) ?? undefined,
      (data["timeout_ms"]      as number  | null) ?? undefined,
    );
  }
}

// ── AsyncActionResponse ───────────────────────────────────────────────────────

export interface AsyncActionResponse {
  taskId:    string;
  status:    string;
  pollUrl?:  string | undefined;
}

export function asyncActionResponseFromDict(data: Record<string, unknown>): AsyncActionResponse {
  const r: AsyncActionResponse = {
    taskId: data["task_id"] as string,
    status: data["status"]  as string,
  };
  const pollUrl = data["poll_url"] as string | null | undefined;
  if (pollUrl != null) r.pollUrl = pollUrl;
  return r;
}
