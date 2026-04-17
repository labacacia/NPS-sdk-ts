// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * AnchorFrameCache — in-process cache for AnchorFrame instances (NPS-1 §4.1).
 */

import { createHash } from "node:crypto";
import { NpsAnchorNotFoundError, NpsAnchorPoisonError } from "./exceptions.js";
import type { AnchorFrame, FrameSchema } from "../ncp/frames.js";

export class AnchorFrameCache {
  private readonly _store = new Map<string, { frame: AnchorFrame; expiresAt: number }>();

  // Allow clock injection for testing
  clock: () => number = () => Date.now();

  // ── Public API ────────────────────────────────────────────────────────────

  set(frame: AnchorFrame): string {
    const anchorId = frame.anchorId.startsWith("sha256:")
      ? frame.anchorId
      : AnchorFrameCache.computeAnchorId(frame.schema);

    const existing = this._store.get(anchorId);
    if (existing !== undefined && this.clock() < existing.expiresAt) {
      if (!AnchorFrameCache._schemasEqual(existing.frame.schema, frame.schema)) {
        throw new NpsAnchorPoisonError(anchorId);
      }
      // Same schema — idempotent; refresh TTL below
    }

    const ttlMs   = (frame.ttl ?? 3600) * 1000;
    const expiresAt = this.clock() + ttlMs;
    this._store.set(anchorId, { frame, expiresAt });
    return anchorId;
  }

  get(anchorId: string): AnchorFrame | undefined {
    const entry = this._store.get(anchorId);
    if (entry === undefined) return undefined;
    if (this.clock() > entry.expiresAt) {
      this._store.delete(anchorId);
      return undefined;
    }
    return entry.frame;
  }

  getRequired(anchorId: string): AnchorFrame {
    const frame = this.get(anchorId);
    if (frame === undefined) throw new NpsAnchorNotFoundError(anchorId);
    return frame;
  }

  invalidate(anchorId: string): void {
    this._store.delete(anchorId);
  }

  get size(): number {
    this._evictExpired();
    return this._store.size;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  static computeAnchorId(schema: FrameSchema): string {
    const sorted = [...schema.fields]
      .map((f) => {
        const obj: Record<string, unknown> = { name: f.name, type: f.type };
        if (f.semantic !== undefined) obj["semantic"] = f.semantic;
        if (f.nullable !== undefined) obj["nullable"] = f.nullable;
        return obj;
      })
      .sort((a, b) => String(a["name"]).localeCompare(String(b["name"])));

    const canonical = JSON.stringify(sorted);
    const digest    = createHash("sha256").update(canonical, "utf8").digest("hex");
    return `sha256:${digest}`;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _evictExpired(): void {
    const now = this.clock();
    for (const [k, entry] of this._store) {
      if (now > entry.expiresAt) this._store.delete(k);
    }
  }

  private static _schemasEqual(a: FrameSchema, b: FrameSchema): boolean {
    return AnchorFrameCache.computeAnchorId(a) === AnchorFrameCache.computeAnchorId(b);
  }
}
