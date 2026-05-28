// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

// ── Filter DSL ────────────────────────────────────────────────────────────────

export interface QueryOrderClause {
  field: string;
  dir:   "ASC" | "DESC";
}

export interface VectorSearchOptions {
  field?:     string;
  vector:     readonly number[];
  top_k?:     number;
  threshold?: number;
  metric?:    "cosine" | "euclidean" | "dot_product";
}

// ── QueryFrame ────────────────────────────────────────────────────────────────

export interface QueryFrameOptions {
  anchorRef?:    string;
  filter?:       Record<string, unknown>;
  limit?:        number;
  cursor?:       string;
  order?:        readonly QueryOrderClause[];
  fields?:       readonly string[];
  vectorSearch?: VectorSearchOptions;
  depth?:        number;
  type?:         string;
  autoAnchor?:   boolean;
  stream?:       boolean;
  aggregate?:    Record<string, unknown>;
  tokenBudget?:  number;
  tokenizer?:    string;
  requestId?:    string;
}

export class QueryFrame implements NpsFrame {
  readonly frameType     = FrameType.QUERY;
  readonly preferredTier = EncodingTier.MSGPACK;

  readonly anchorRef?:    string;
  readonly filter?:       Record<string, unknown>;
  readonly limit?:        number;
  readonly cursor?:       string;
  readonly order?:        readonly QueryOrderClause[];
  readonly fields?:       readonly string[];
  readonly vectorSearch?: VectorSearchOptions;
  readonly depth?:        number;
  readonly type?:         string;
  readonly autoAnchor?:   boolean;
  readonly stream?:       boolean;
  readonly aggregate?:    Record<string, unknown>;
  readonly tokenBudget?:  number;
  readonly tokenizer?:    string;
  readonly requestId?:    string;

  constructor(opts: QueryFrameOptions = {}) {
    this.anchorRef    = opts.anchorRef;
    this.filter       = opts.filter;
    this.limit        = opts.limit;
    this.cursor       = opts.cursor;
    this.order        = opts.order;
    this.fields       = opts.fields;
    this.vectorSearch = opts.vectorSearch;
    this.depth        = opts.depth;
    this.type         = opts.type;
    this.autoAnchor   = opts.autoAnchor;
    this.stream       = opts.stream;
    this.aggregate    = opts.aggregate;
    this.tokenBudget  = opts.tokenBudget;
    this.tokenizer    = opts.tokenizer;
    this.requestId    = opts.requestId;
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      anchor_ref:    this.anchorRef    ?? null,
      filter:        this.filter       ?? null,
      limit:         this.limit        ?? null,
      cursor:        this.cursor       ?? null,
      order:         this.order        ?? null,
      fields:        this.fields       ?? null,
      vector_search: this.vectorSearch ?? null,
      depth:         this.depth        ?? null,
    };
    if (this.type        !== undefined) d["type"]         = this.type;
    if (this.autoAnchor  !== undefined) d["auto_anchor"]  = this.autoAnchor;
    if (this.stream      !== undefined) d["stream"]       = this.stream;
    if (this.aggregate   !== undefined) d["aggregate"]    = this.aggregate;
    if (this.tokenBudget !== undefined) d["token_budget"] = this.tokenBudget;
    if (this.tokenizer   !== undefined) d["tokenizer"]    = this.tokenizer;
    if (this.requestId   !== undefined) d["request_id"]   = this.requestId;
    return d;
  }

  static fromDict(data: Record<string, unknown>): QueryFrame {
    return new QueryFrame({
      anchorRef:    (data["anchor_ref"]    as string  | null) ?? undefined,
      filter:       (data["filter"]        as Record<string, unknown> | null) ?? undefined,
      limit:        (data["limit"]         as number  | null) ?? undefined,
      cursor:       (data["cursor"]        as string  | null) ?? undefined,
      order:        (data["order"]         as QueryOrderClause[] | null) ?? undefined,
      fields:       (data["fields"]        as string[] | null) ?? undefined,
      vectorSearch: (data["vector_search"] as VectorSearchOptions | null) ?? undefined,
      depth:        (data["depth"]         as number  | null) ?? undefined,
      type:         (data["type"]          as string  | null) ?? undefined,
      autoAnchor:   (data["auto_anchor"]   as boolean | null) ?? undefined,
      stream:       (data["stream"]        as boolean | null) ?? undefined,
      aggregate:    (data["aggregate"]     as Record<string, unknown> | null) ?? undefined,
      tokenBudget:  (data["token_budget"]  as number  | null) ?? undefined,
      tokenizer:    (data["tokenizer"]     as string  | null) ?? undefined,
      requestId:    (data["request_id"]    as string  | null) ?? undefined,
    });
  }
}

// ── ActionFrame ───────────────────────────────────────────────────────────────

export interface ActionFrameOptions {
  actionId:        string;
  params?:         Record<string, unknown>;
  async_?:         boolean;
  idempotencyKey?: string;
  timeoutMs?:      number;
  callbackUrl?:    string;
  priority?:       "low" | "normal" | "high";
  requestId?:      string;
}

export class ActionFrame implements NpsFrame {
  readonly frameType     = FrameType.ACTION;
  readonly preferredTier = EncodingTier.MSGPACK;

  readonly actionId:        string;
  readonly params?:         Record<string, unknown>;
  readonly async_?:         boolean;
  readonly idempotencyKey?: string;
  readonly timeoutMs?:      number;
  readonly callbackUrl?:    string;
  readonly priority?:       "low" | "normal" | "high";
  readonly requestId?:      string;

  constructor(opts: ActionFrameOptions) {
    this.actionId       = opts.actionId;
    this.params         = opts.params;
    this.async_         = opts.async_;
    this.idempotencyKey = opts.idempotencyKey;
    this.timeoutMs      = opts.timeoutMs;
    this.callbackUrl    = opts.callbackUrl;
    this.priority       = opts.priority;
    this.requestId      = opts.requestId;
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      action_id:       this.actionId,
      params:          this.params          ?? null,
      async:           this.async_          ?? false,
      idempotency_key: this.idempotencyKey  ?? null,
      timeout_ms:      this.timeoutMs       ?? null,
    };
    if (this.callbackUrl !== undefined) d["callback_url"] = this.callbackUrl;
    if (this.priority    !== undefined) d["priority"]     = this.priority;
    if (this.requestId   !== undefined) d["request_id"]   = this.requestId;
    return d;
  }

  static fromDict(data: Record<string, unknown>): ActionFrame {
    return new ActionFrame({
      actionId:       data["action_id"]       as string,
      params:         (data["params"]          as Record<string, unknown> | null) ?? undefined,
      async_:         (data["async"]           as boolean | null) ?? undefined,
      idempotencyKey: (data["idempotency_key"] as string  | null) ?? undefined,
      timeoutMs:      (data["timeout_ms"]      as number  | null) ?? undefined,
      callbackUrl:    (data["callback_url"]    as string  | null) ?? undefined,
      priority:       (data["priority"]        as "low" | "normal" | "high" | null) ?? undefined,
      requestId:      (data["request_id"]      as string  | null) ?? undefined,
    });
  }
}

// ── SubscribeFrame ────────────────────────────────────────────────────────────

export interface SubscribeFrameOptions {
  action:             "subscribe" | "unsubscribe" | "ping";
  streamId:           string;
  anchorRef?:         string;
  filter?:            Record<string, unknown>;
  heartbeatInterval?: number;
  resumeFromSeq?:     bigint | number;
  type?:              string;
}

export class SubscribeFrame implements NpsFrame {
  readonly frameType     = FrameType.SUBSCRIBE;
  readonly preferredTier = EncodingTier.MSGPACK;

  readonly action:             "subscribe" | "unsubscribe" | "ping";
  readonly streamId:           string;
  readonly anchorRef?:         string;
  readonly filter?:            Record<string, unknown>;
  readonly heartbeatInterval?: number;
  readonly resumeFromSeq?:     bigint;
  readonly type?:              string;

  constructor(opts: SubscribeFrameOptions) {
    this.action            = opts.action;
    this.streamId          = opts.streamId;
    this.anchorRef         = opts.anchorRef;
    this.filter            = opts.filter;
    this.heartbeatInterval = opts.heartbeatInterval;
    this.resumeFromSeq     = opts.resumeFromSeq !== undefined
      ? BigInt(opts.resumeFromSeq)
      : undefined;
    this.type = opts.type;
  }

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      frame:     0x12,
      action:    this.action,
      stream_id: this.streamId,
    };
    if (this.anchorRef         !== undefined) d["anchor_ref"]         = this.anchorRef;
    if (this.filter            !== undefined) d["filter"]             = this.filter;
    if (this.heartbeatInterval !== undefined) d["heartbeat_interval"] = this.heartbeatInterval;
    if (this.resumeFromSeq     !== undefined) d["resume_from_seq"]    = this.resumeFromSeq;
    if (this.type              !== undefined) d["type"]               = this.type;
    return d;
  }

  static fromDict(data: Record<string, unknown>): SubscribeFrame {
    const seq = data["resume_from_seq"];
    return new SubscribeFrame({
      action:            data["action"] as "subscribe" | "unsubscribe" | "ping",
      streamId:          data["stream_id"] as string,
      anchorRef:         (data["anchor_ref"]         as string  | null) ?? undefined,
      filter:            (data["filter"]             as Record<string, unknown> | null) ?? undefined,
      heartbeatInterval: (data["heartbeat_interval"] as number  | null) ?? undefined,
      resumeFromSeq:     seq != null ? BigInt(seq as string | number | bigint) : undefined,
      type:              (data["type"]               as string  | null) ?? undefined,
    });
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
