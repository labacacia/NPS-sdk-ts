// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

// ── FrameSchema ───────────────────────────────────────────────────────────────

export interface SchemaField {
  name:      string;
  type:      string;
  semantic?: string;
  nullable?: boolean;
}

export interface FrameSchema {
  fields: readonly SchemaField[];
}

// ── AnchorFrame ───────────────────────────────────────────────────────────────

export class AnchorFrame implements NpsFrame {
  readonly frameType     = FrameType.ANCHOR;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly anchorId: string,
    public readonly schema:   FrameSchema,
    public readonly ttl:      number = 3600,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      anchor_id: this.anchorId,
      schema:    { fields: this.schema.fields.map((f) => ({ ...f })) },
      ttl:       this.ttl,
    };
  }

  static fromDict(data: Record<string, unknown>): AnchorFrame {
    const schemaRaw = data["schema"] as { fields: SchemaField[] };
    return new AnchorFrame(
      data["anchor_id"] as string,
      { fields: schemaRaw.fields },
      (data["ttl"] as number | undefined) ?? 3600,
    );
  }
}

// ── JsonPatchOperation ────────────────────────────────────────────────────────

export interface JsonPatchOperation {
  op:     string;
  path:   string;
  value?: unknown;
}

// ── DiffFrame ─────────────────────────────────────────────────────────────────

export class DiffFrame implements NpsFrame {
  readonly frameType     = FrameType.DIFF;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly anchorRef: string,
    public readonly baseSeq:   number,
    public readonly patch:     readonly JsonPatchOperation[],
    public readonly entityId?: string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      anchor_ref: this.anchorRef,
      base_seq:   this.baseSeq,
      patch:      this.patch.map((p) => ({ ...p })),
      entity_id:  this.entityId ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): DiffFrame {
    return new DiffFrame(
      data["anchor_ref"] as string,
      data["base_seq"]   as number,
      data["patch"]      as JsonPatchOperation[],
      (data["entity_id"] as string | null) ?? undefined,
    );
  }
}

// ── StreamFrame ───────────────────────────────────────────────────────────────

export class StreamFrame implements NpsFrame {
  readonly frameType     = FrameType.STREAM;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly streamId:   string,
    public readonly seq:        number,
    public readonly isLast:     boolean,
    public readonly data:       readonly Record<string, unknown>[],
    public readonly anchorRef?: string,
    public readonly windowSize?: number,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      stream_id:   this.streamId,
      seq:         this.seq,
      is_last:     this.isLast,
      data:        this.data,
      anchor_ref:  this.anchorRef  ?? null,
      window_size: this.windowSize ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): StreamFrame {
    return new StreamFrame(
      data["stream_id"]   as string,
      data["seq"]         as number,
      data["is_last"]     as boolean,
      data["data"]        as Record<string, unknown>[],
      (data["anchor_ref"]  as string | null)  ?? undefined,
      (data["window_size"] as number | null)  ?? undefined,
    );
  }
}

// ── CapsFrame ─────────────────────────────────────────────────────────────────

export class CapsFrame implements NpsFrame {
  readonly frameType     = FrameType.CAPS;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly anchorRef:      string,
    public readonly count:          number,
    public readonly data:           readonly Record<string, unknown>[],
    public readonly nextCursor?:    string,
    public readonly tokenEst?:      number,
    public readonly cached?:        boolean,
    public readonly tokenizerUsed?: string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      anchor_ref:      this.anchorRef,
      count:           this.count,
      data:            this.data,
      next_cursor:     this.nextCursor    ?? null,
      token_est:       this.tokenEst      ?? null,
      cached:          this.cached        ?? null,
      tokenizer_used:  this.tokenizerUsed ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): CapsFrame {
    return new CapsFrame(
      data["anchor_ref"]     as string,
      data["count"]          as number,
      data["data"]           as Record<string, unknown>[],
      (data["next_cursor"]    as string | null) ?? undefined,
      (data["token_est"]      as number | null) ?? undefined,
      (data["cached"]         as boolean | null) ?? undefined,
      (data["tokenizer_used"] as string | null) ?? undefined,
    );
  }
}

// ── ErrorFrame ────────────────────────────────────────────────────────────────

export class ErrorFrame implements NpsFrame {
  readonly frameType     = FrameType.ERROR;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly status:   string,
    public readonly error:    string,
    public readonly message?: string,
    public readonly details?: Record<string, unknown>,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      status:  this.status,
      error:   this.error,
      message: this.message ?? null,
      details: this.details ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): ErrorFrame {
    return new ErrorFrame(
      data["status"]  as string,
      data["error"]   as string,
      (data["message"] as string | null) ?? undefined,
      (data["details"] as Record<string, unknown> | null) ?? undefined,
    );
  }
}
