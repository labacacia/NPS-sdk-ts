// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

// ── Filter DSL ────────────────────────────────────────────────────────────────

export interface QueryOrderClause {
  field: string;
  dir:   "asc" | "desc" | "ASC" | "DESC";
}

export interface VectorSearchOptions {
  vector:      readonly number[];
  topK?:       number;
  minScore?:   number;
  vectorField?: string;
  field?:      string;
  top_k?:      number;
  threshold?:  number;
  metric?:     "cosine" | "dot" | "euclidean" | string;
}

export const NWP_TOPOLOGY_SNAPSHOT = "topology.snapshot" as const;
export const NWP_TOPOLOGY_STREAM   = "topology.stream" as const;

export interface TopologySnapshotRequest {
  kind: typeof NWP_TOPOLOGY_SNAPSHOT;
  anchorRef?: string;
  includeBridges?: boolean;
  includeCapabilities?: boolean;
  maxDepth?: number;
  since?: string;
}

export interface TopologyStreamRequest {
  kind: typeof NWP_TOPOLOGY_STREAM;
  anchorRef?: string;
  includeInitialSnapshot?: boolean;
  eventTypes?: readonly string[];
  since?: string;
}

export interface TopologyMember {
  nodeId: string;
  nodeType?: string;
  anchorRef?: string;
  capabilities?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface TopologyEvent {
  eventId: string;
  eventType: string;
  nodeId?: string;
  anchorRef?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export interface BridgeNodeSpec {
  bridgeId: string;
  sourceProtocol: string;
  targetProtocol: string;
  sourceRef?: string;
  targetRef?: string;
  capabilities?: readonly string[];
  metadata?: Record<string, unknown>;
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
    public readonly cursor?:       string,
    public readonly autoAnchor?:   boolean,
    public readonly stream?:       boolean,
    public readonly aggregate?:    Record<string, unknown>,
    public readonly tokenBudget?:  number,
    public readonly tokenizer?:    string,
    public readonly requestId?:    string,
  ) {}

  toDict(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      anchor_ref:    this.anchorRef    ?? null,
      filter:        this.filter       ?? null,
      limit:         this.limit        ?? null,
      offset:        this.offset       ?? null,
      cursor:        this.cursor       ?? null,
      order:         this.orderBy      ?? null,
      order_by:      this.orderBy      ?? null,
      fields:        this.fields       ?? null,
      vector_search: normalizeVectorSearch(this.vectorSearch),
      depth:         this.depth        ?? null,
      auto_anchor:   this.autoAnchor   ?? null,
      stream:        this.stream       ?? null,
      aggregate:     this.aggregate    ?? null,
      request_id:    this.requestId    ?? null,
    };
    if (this.tokenBudget !== undefined) d["token_budget"] = this.tokenBudget;
    if (this.tokenizer   !== undefined) d["tokenizer"]    = this.tokenizer;
    return d;
  }

  static fromDict(data: Record<string, unknown>): QueryFrame {
    const order = (data["order"] ?? data["order_by"]) as QueryOrderClause[] | null | undefined;
    return new QueryFrame(
      (data["anchor_ref"]    as string  | null) ?? undefined,
      (data["filter"]        as Record<string, unknown> | null) ?? undefined,
      (data["limit"]         as number  | null) ?? undefined,
      (data["offset"]        as number  | null) ?? undefined,
      order ?? undefined,
      (data["fields"]        as string[] | null) ?? undefined,
      denormalizeVectorSearch((data["vector_search"] as Record<string, unknown> | null) ?? undefined),
      (data["depth"]         as number  | null) ?? undefined,
      (data["cursor"]        as string  | null) ?? undefined,
      (data["auto_anchor"]   as boolean | null) ?? undefined,
      (data["stream"]        as boolean | null) ?? undefined,
      (data["aggregate"]     as Record<string, unknown> | null) ?? undefined,
      (data["token_budget"]  as number  | null) ?? undefined,
      (data["tokenizer"]     as string  | null) ?? undefined,
      (data["request_id"]    as string  | null) ?? undefined,
    );
  }
}

function normalizeVectorSearch(v?: VectorSearchOptions): Record<string, unknown> | null {
  if (v == null) return null;
  return {
    field:     v.field ?? v.vectorField ?? null,
    vector:    [...v.vector],
    top_k:     v.top_k ?? v.topK ?? null,
    threshold: v.threshold ?? v.minScore ?? null,
    metric:    v.metric ?? null,
  };
}

function denormalizeVectorSearch(v?: Record<string, unknown>): VectorSearchOptions | undefined {
  if (v == null) return undefined;
  return {
    vector:      (v["vector"] as number[] | undefined) ?? [],
    topK:        (v["topK"] ?? v["top_k"]) as number | undefined,
    minScore:    (v["minScore"] ?? v["threshold"]) as number | undefined,
    vectorField: (v["vectorField"] ?? v["field"]) as string | undefined,
    field:       (v["field"] ?? v["vectorField"]) as string | undefined,
    top_k:       (v["top_k"] ?? v["topK"]) as number | undefined,
    threshold:   (v["threshold"] ?? v["minScore"]) as number | undefined,
    metric:      v["metric"] as string | undefined,
  };
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

// ── SubscribeFrame ───────────────────────────────────────────────────────────

export class SubscribeFrame implements NpsFrame {
  readonly frameType     = FrameType.SUBSCRIBE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly action:            string,
    public readonly streamId:          string,
    public readonly anchorRef?:        string,
    public readonly filter?:           Record<string, unknown>,
    public readonly heartbeatInterval?: number,
    public readonly resumeFromSeq?:    number,
    public readonly type?:             string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      action:             this.action,
      stream_id:          this.streamId,
      anchor_ref:         this.anchorRef         ?? null,
      filter:             this.filter            ?? null,
      heartbeat_interval: this.heartbeatInterval ?? null,
      resume_from_seq:    this.resumeFromSeq     ?? null,
      type:               this.type              ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): SubscribeFrame {
    return new SubscribeFrame(
      data["action"]       as string,
      data["stream_id"]    as string,
      (data["anchor_ref"]  as string | null) ?? undefined,
      (data["filter"]      as Record<string, unknown> | null) ?? undefined,
      (data["heartbeat_interval"] as number | null) ?? undefined,
      (data["resume_from_seq"]    as number | null) ?? undefined,
      (data["type"]        as string | null) ?? undefined,
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
