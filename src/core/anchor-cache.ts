// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// AnchorCache — Schema cache with TTL, LRU eviction, poison detection
// NPS-1 §5.3, §7.2, §9

import { NcpError } from "./frame-header.js";
import type { AnchorFrame } from "../ncp/frames/anchor-frame.js";

interface CacheEntry {
  frame: AnchorFrame;
  expiresAt: number; // epoch ms
  lastAccessed: number; // epoch ms
}

/**
 * AnchorFrame cache with:
 * - TTL-based expiry (NPS-1 §5.3)
 * - LRU eviction at maxSize (NPS-1 §9, default 1000)
 * - Anchor poisoning detection (NPS-1 §7.2)
 */
export class AnchorCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly getNow: () => number;

  constructor(options?: { maxSize?: number; getNow?: () => number }) {
    this.maxSize = options?.maxSize ?? 1000;
    this.getNow = options?.getNow ?? (() => Date.now());
  }

  /**
   * Cache an AnchorFrame.
   *
   * - ttl=0: frame is valid but not cached (NPS-1 §4.1)
   * - Same anchor_id + same schema: idempotent (no-op)
   * - Same anchor_id + different schema: NCP-ANCHOR-ID-MISMATCH (poison detection)
   *
   * @throws {NcpError} NCP-ANCHOR-ID-MISMATCH on anchor poisoning.
   */
  set(frame: AnchorFrame): void {
    // ttl=0 means use once, don't cache
    if (frame.ttl === 0) return;

    const existing = this.cache.get(frame.anchor_id);
    if (existing) {
      // Poison detection: same ID, different schema
      const existingJson = JSON.stringify(existing.frame.schema);
      const newJson = JSON.stringify(frame.schema);
      if (existingJson !== newJson) {
        throw new NcpError(
          "NCP-ANCHOR-ID-MISMATCH",
          `Anchor poisoning detected: anchor_id ${frame.anchor_id} received with different schema`,
        );
      }
      // Same schema — idempotent, update access time
      existing.lastAccessed = this.getNow();
      return;
    }

    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLru();
    }

    const ttlMs = (frame.ttl ?? 3600) * 1000;
    this.cache.set(frame.anchor_id, {
      frame,
      expiresAt: this.getNow() + ttlMs,
      lastAccessed: this.getNow(),
    });
  }

  /**
   * Get a cached AnchorFrame by anchor_id.
   *
   * @returns The cached frame, or null if not found or expired.
   */
  get(anchorId: string): AnchorFrame | null {
    const entry = this.cache.get(anchorId);
    if (!entry) return null;

    // Check TTL expiry
    if (this.getNow() >= entry.expiresAt) {
      this.cache.delete(anchorId);
      return null;
    }

    entry.lastAccessed = this.getNow();
    return entry.frame;
  }

  /**
   * Get a cached AnchorFrame, throwing if not found.
   * @throws {NcpError} NCP-ANCHOR-NOT-FOUND if not in cache or expired.
   */
  getRequired(anchorId: string): AnchorFrame {
    const frame = this.get(anchorId);
    if (!frame) {
      throw new NcpError(
        "NCP-ANCHOR-NOT-FOUND",
        `Schema anchor ${anchorId} not found in cache`,
      );
    }
    return frame;
  }

  /** Current cache size. */
  get size(): number {
    return this.cache.size;
  }

  /** Evict the least recently accessed entry. */
  private evictLru(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
