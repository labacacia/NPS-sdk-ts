// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — AnchorCache
// Covers: NCP-A-03, A-05, A-06, NCP-CA-01 to CA-05
// Source: test/ncp_test_cases.md §3.1, §4

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { AnchorCache } from "../../src/core/anchor-cache.js";
import {
  computeAnchorId,
  type AnchorFrame,
  type FrameSchema,
} from "../../src/ncp/frames/anchor-frame.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const schemaA: FrameSchema = {
  fields: [
    { name: "id", type: "uint64" },
    { name: "name", type: "string" },
  ],
};

const schemaB: FrameSchema = {
  fields: [
    { name: "id", type: "uint64" },
    { name: "price", type: "decimal" },
  ],
};

function makeAnchor(schema: FrameSchema, ttl?: number): AnchorFrame {
  return {
    frame: "0x01",
    anchor_id: computeAnchorId(schema),
    schema,
    ttl: ttl ?? 3600,
  };
}

// ===========================================================================
// NCP-A-03: Anchor Poisoning
// ===========================================================================

describe("NCP-A-03: Anchor Poisoning", () => {
  // -----------------------------------------------------------------------
  // Spec: §7.2 — Same anchor_id with different schema → NCP-ANCHOR-ID-MISMATCH
  // -----------------------------------------------------------------------
  it("detects anchor poisoning (same ID, different schema)", () => {
    const cache = new AnchorCache();
    const anchor = makeAnchor(schemaA);
    cache.set(anchor);

    // Craft a poisoned frame: same anchor_id but different schema
    const poisoned: AnchorFrame = {
      frame: "0x01",
      anchor_id: anchor.anchor_id, // same ID
      schema: schemaB, // different schema!
      ttl: 3600,
    };

    expect(() => cache.set(poisoned)).toThrow(NcpError);
    try {
      cache.set(poisoned);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-ID-MISMATCH");
    }
  });

  it("allows idempotent set with same schema", () => {
    const cache = new AnchorCache();
    const anchor = makeAnchor(schemaA);
    cache.set(anchor);
    expect(() => cache.set(anchor)).not.toThrow(); // same schema — fine
    expect(cache.size).toBe(1);
  });
});

// ===========================================================================
// NCP-A-05: Zero TTL
// ===========================================================================

describe("NCP-A-05: Zero TTL", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.1 — ttl=0 means don't cache, use once
  // -----------------------------------------------------------------------
  it("does not cache frames with ttl=0", () => {
    const cache = new AnchorCache();
    const anchor = makeAnchor(schemaA, 0); // ttl=0
    cache.set(anchor);

    expect(cache.size).toBe(0);
    expect(cache.get(anchor.anchor_id)).toBeNull();
  });
});

// ===========================================================================
// NCP-A-06: TTL Expiry
// ===========================================================================

describe("NCP-A-06: TTL Expiry", () => {
  // -----------------------------------------------------------------------
  // Spec: §5.3 — Expired anchors return not-found
  // -----------------------------------------------------------------------
  it("expires anchors after TTL", () => {
    let now = 1000;
    const cache = new AnchorCache({ getNow: () => now });

    const anchor = makeAnchor(schemaA, 1); // ttl=1 second
    cache.set(anchor);

    // Still valid
    expect(cache.get(anchor.anchor_id)).not.toBeNull();

    // Advance time past TTL
    now = 3000; // 2 seconds later
    expect(cache.get(anchor.anchor_id)).toBeNull();
  });

  it("getRequired throws NCP-ANCHOR-NOT-FOUND after expiry", () => {
    let now = 1000;
    const cache = new AnchorCache({ getNow: () => now });

    const anchor = makeAnchor(schemaA, 1);
    cache.set(anchor);

    now = 3000;
    expect(() => cache.getRequired(anchor.anchor_id)).toThrow(NcpError);
    try {
      cache.getRequired(anchor.anchor_id);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-NOT-FOUND");
    }
  });
});

// ===========================================================================
// Group 4: Schema Caching
// ===========================================================================

describe("Group 4: Schema Caching", () => {
  // -----------------------------------------------------------------------
  // NCP-CA-01: Cache Hit
  // Spec: §5.3 — anchor_ref already in local cache
  // -----------------------------------------------------------------------
  it("NCP-CA-01: returns cached schema on hit", () => {
    const cache = new AnchorCache();
    const anchor = makeAnchor(schemaA);
    cache.set(anchor);

    const result = cache.get(anchor.anchor_id);
    expect(result).not.toBeNull();
    expect(result!.anchor_id).toBe(anchor.anchor_id);
    expect(result!.schema.fields).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // NCP-CA-02: Cache Miss (Local)
  // Spec: §5.4 — Unknown anchor_ref → trigger fetch
  // -----------------------------------------------------------------------
  it("NCP-CA-02: returns null for unknown anchor_ref", () => {
    const cache = new AnchorCache();
    expect(cache.get("sha256:unknown")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // NCP-CA-03: Cache Miss (Server)
  // Spec: §5.4.2 — Server returns NCP-ANCHOR-NOT-FOUND
  // -----------------------------------------------------------------------
  it("NCP-CA-03: getRequired throws NCP-ANCHOR-NOT-FOUND for unknown ref", () => {
    const cache = new AnchorCache();
    expect(() => cache.getRequired("sha256:fabricated")).toThrow(NcpError);
    try {
      cache.getRequired("sha256:fabricated");
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-NOT-FOUND");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-CA-04: LRU Eviction
  // Spec: §9 — Cache limit 1000, LRU eviction
  // -----------------------------------------------------------------------
  it("NCP-CA-04: evicts LRU entry when cache is full", () => {
    let now = 1000;
    const cache = new AnchorCache({ maxSize: 3, getNow: () => now });

    // Fill cache with 3 entries at different times
    const anchors = Array.from({ length: 3 }, (_, i) => {
      const schema: FrameSchema = {
        fields: [{ name: `field_${i}`, type: "string" }],
      };
      return makeAnchor(schema);
    });
    now = 1000; cache.set(anchors[0]!);
    now = 2000; cache.set(anchors[1]!);
    now = 3000; cache.set(anchors[2]!);
    expect(cache.size).toBe(3);

    // Access first anchor to make it most recently used
    now = 4000;
    cache.get(anchors[0]!.anchor_id);

    // Add 4th entry — should evict anchors[1] (lastAccessed=2000, the oldest)
    now = 5000;
    const newSchema: FrameSchema = {
      fields: [{ name: "field_new", type: "string" }],
    };
    const newAnchor = makeAnchor(newSchema);
    cache.set(newAnchor);

    expect(cache.size).toBe(3);
    expect(cache.get(anchors[0]!.anchor_id)).not.toBeNull(); // still here (accessed at 4000)
    expect(cache.get(anchors[1]!.anchor_id)).toBeNull(); // evicted (LRU at 2000)
    expect(cache.get(newAnchor.anchor_id)).not.toBeNull(); // newly added
  });

  // -----------------------------------------------------------------------
  // NCP-CA-05: Schema Update
  // Spec: §5.4.1 — Same name, different anchor_id can coexist
  // -----------------------------------------------------------------------
  it("NCP-CA-05: stores multiple schema versions by anchor_id", () => {
    const cache = new AnchorCache();

    // v1
    const anchorV1 = makeAnchor(schemaA);
    cache.set(anchorV1);

    // v2 (different schema → different anchor_id)
    const anchorV2 = makeAnchor(schemaB);
    cache.set(anchorV2);

    // Both should coexist
    expect(cache.get(anchorV1.anchor_id)).not.toBeNull();
    expect(cache.get(anchorV2.anchor_id)).not.toBeNull();
    expect(anchorV1.anchor_id).not.toBe(anchorV2.anchor_id);
    expect(cache.size).toBe(2);
  });
});
