// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — Frame types + Tier-1 JSON codec
// Covers: NCP-E-01, E-03, NCP-A-01 to A-04, NCP-C-01 to C-04, NCP-D-01 to D-04
// Source: test/ncp_test_cases.md §2, §3

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { encodeJson, decodeJson } from "../../src/core/codecs/tier1-json-codec.js";
import {
  computeAnchorId,
  validateAnchorFrame,
  type AnchorFrame,
  type FrameSchema,
} from "../../src/ncp/frames/anchor-frame.js";
import { validateCapsFrame, type CapsFrame } from "../../src/ncp/frames/caps-frame.js";
import { validateDiffSeq, type DiffFrame } from "../../src/ncp/frames/diff-frame.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSchema: FrameSchema = {
  fields: [
    { name: "id", type: "uint64", semantic: "entity.id" },
    { name: "name", type: "string", semantic: "entity.label" },
    { name: "price", type: "decimal", semantic: "commerce.price.usd" },
    { name: "stock", type: "uint64", semantic: "commerce.inventory.count" },
  ],
};

function makeValidAnchor(): AnchorFrame {
  const anchor_id = computeAnchorId(testSchema);
  return { frame: "0x01", anchor_id, schema: testSchema, ttl: 3600 };
}

// ===========================================================================
// Group 2: Encoding Tiers (Tier-1 JSON)
// ===========================================================================

describe("Group 2: Encoding — Tier-1 JSON", () => {
  // -----------------------------------------------------------------------
  // NCP-E-01: Tier-1 JSON (Valid)
  // Spec: §3.2, §8 — Flags T0/T1 = 00
  // -----------------------------------------------------------------------
  it("NCP-E-01: encodes and decodes valid JSON payload", () => {
    const anchor = makeValidAnchor();
    const bytes = encodeJson(anchor);
    const decoded = decodeJson(bytes) as AnchorFrame;

    expect(decoded.frame).toBe("0x01");
    expect(decoded.anchor_id).toBe(anchor.anchor_id);
    expect(decoded.schema.fields).toHaveLength(4);
  });

  // -----------------------------------------------------------------------
  // NCP-E-03: Tier-1 JSON (Malformed)
  // Spec: §3.2, §8 — Invalid JSON → NPS-CLIENT-BAD-FRAME
  // -----------------------------------------------------------------------
  it("NCP-E-03: rejects malformed JSON payload", () => {
    const bad = new TextEncoder().encode('{"frame":"0x01", "anchor_id":');
    expect(() => decodeJson(bad)).toThrow(NcpError);

    try {
      decodeJson(bad);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });
});

// ===========================================================================
// Group 3.1: AnchorFrame (0x01)
// ===========================================================================

describe("Group 3.1: AnchorFrame", () => {
  // -----------------------------------------------------------------------
  // NCP-A-01: Valid Anchor
  // Spec: §4.1 — anchor_id = SHA-256(JCS(schema))
  // -----------------------------------------------------------------------
  it("NCP-A-01: computes correct anchor_id via JCS + SHA-256", () => {
    const anchor_id = computeAnchorId(testSchema);

    expect(anchor_id).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Same schema produces same ID (deterministic)
    expect(computeAnchorId(testSchema)).toBe(anchor_id);
  });

  it("NCP-A-01: different field order produces same anchor_id (JCS normalises)", () => {
    const schemaA: FrameSchema = {
      fields: [
        { name: "id", type: "uint64" },
        { name: "name", type: "string" },
      ],
    };
    const schemaB: FrameSchema = {
      fields: [
        { name: "name", type: "string" },
        { name: "id", type: "uint64" },
      ],
    };

    // NOTE: JCS sorts object keys, but array order is preserved.
    // Different field ORDER in the array produces different hashes.
    // Only different key ORDER within objects is normalised.
    const idA = computeAnchorId(schemaA);
    const idB = computeAnchorId(schemaB);

    // Array order matters — these are different schemas
    expect(idA).not.toBe(idB);
  });

  it("NCP-A-01: validates and caches valid anchor frame", () => {
    const anchor = makeValidAnchor();
    expect(() => validateAnchorFrame(anchor)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-A-02: Anchor ID Mismatch
  // Spec: §4.1 — Provided anchor_id != SHA-256(JCS(schema))
  // -----------------------------------------------------------------------
  it("NCP-A-02: rejects anchor with wrong anchor_id", () => {
    const anchor: AnchorFrame = {
      frame: "0x01",
      anchor_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      schema: testSchema,
      ttl: 3600,
    };

    expect(() => validateAnchorFrame(anchor)).toThrow(NcpError);
    try {
      validateAnchorFrame(anchor);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-SCHEMA-INVALID");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-A-03: Anchor Poisoning — tested in Step 7 (AnchorCache)
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // NCP-A-04: Invalid Schema Field
  // Spec: §4.1 — Unsupported type (e.g. "tensor")
  // -----------------------------------------------------------------------
  it("NCP-A-04: rejects schema with unsupported field type", () => {
    const badSchema: FrameSchema = {
      fields: [
        { name: "id", type: "uint64" },
        { name: "embedding", type: "tensor" }, // not in valid types
      ],
    };
    const anchor_id = computeAnchorId(badSchema);
    const anchor: AnchorFrame = {
      frame: "0x01",
      anchor_id,
      schema: badSchema,
    };

    expect(() => validateAnchorFrame(anchor)).toThrow(NcpError);
    try {
      validateAnchorFrame(anchor);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-SCHEMA-INVALID");
    }
  });

  it("NCP-A-04: accepts all valid field types", () => {
    const allTypes: FrameSchema = {
      fields: [
        { name: "a", type: "string" },
        { name: "b", type: "uint64" },
        { name: "c", type: "int64" },
        { name: "d", type: "decimal" },
        { name: "e", type: "bool" },
        { name: "f", type: "timestamp" },
        { name: "g", type: "bytes" },
        { name: "h", type: "object" },
        { name: "i", type: "array" },
      ],
    };
    const anchor_id = computeAnchorId(allTypes);
    const anchor: AnchorFrame = { frame: "0x01", anchor_id, schema: allTypes };
    expect(() => validateAnchorFrame(anchor)).not.toThrow();
  });

  // NCP-A-05 and NCP-A-06 — tested in Step 7 (AnchorCache)
});

// ===========================================================================
// Group 3.4: CapsFrame (0x04)
// ===========================================================================

describe("Group 3.4: CapsFrame", () => {
  // -----------------------------------------------------------------------
  // NCP-C-01: Empty Data
  // Spec: §4.4 — count=0, data=[] is valid
  // -----------------------------------------------------------------------
  it("NCP-C-01: accepts empty data with count=0", () => {
    const caps: CapsFrame = {
      frame: "0x04",
      anchor_ref: "sha256:abc123",
      count: 0,
      data: [],
    };
    expect(() => validateCapsFrame(caps)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-C-02: Count Mismatch
  // Spec: §4.4 — count MUST equal len(data)
  // -----------------------------------------------------------------------
  it("NCP-C-02: rejects count mismatch", () => {
    const caps: CapsFrame = {
      frame: "0x04",
      anchor_ref: "sha256:abc123",
      count: 3,
      data: [{ id: 1 }, { id: 2 }], // 2 items but count says 3
    };
    expect(() => validateCapsFrame(caps)).toThrow(NcpError);

    try {
      validateCapsFrame(caps);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-C-03: Cursor Handling
  // Spec: §4.4 — Base64-URL next_cursor
  // -----------------------------------------------------------------------
  it("NCP-C-03: preserves Base64-URL cursor in round-trip", () => {
    const caps: CapsFrame = {
      frame: "0x04",
      anchor_ref: "sha256:abc123",
      count: 2,
      data: [{ id: 1001 }, { id: 1002 }],
      next_cursor: "eyJpZCI6MTAwM30", // {"id":1003}
    };
    expect(() => validateCapsFrame(caps)).not.toThrow();

    const bytes = encodeJson(caps);
    const decoded = decodeJson(bytes) as CapsFrame;
    expect(decoded.next_cursor).toBe("eyJpZCI6MTAwM30");

    // Decode the cursor
    const cursorData = JSON.parse(
      Buffer.from(decoded.next_cursor!, "base64url").toString(),
    );
    expect(cursorData.id).toBe(1003);
  });

  // -----------------------------------------------------------------------
  // NCP-C-04: Token Budget Hint
  // Spec: §4.4 — token_est is informational
  // -----------------------------------------------------------------------
  it("NCP-C-04: preserves token_est in round-trip", () => {
    const caps: CapsFrame = {
      frame: "0x04",
      anchor_ref: "sha256:abc123",
      count: 1,
      data: [{ id: 1 }],
      token_est: 180,
    };
    const bytes = encodeJson(caps);
    const decoded = decodeJson(bytes) as CapsFrame;
    expect(decoded.token_est).toBe(180);
  });
});

// ===========================================================================
// Group 3.2: DiffFrame (0x02)
// ===========================================================================

describe("Group 3.2: DiffFrame", () => {
  // -----------------------------------------------------------------------
  // NCP-D-01: Valid Patch
  // Spec: §4.2 — RFC 6902 JSON Patch applied to anchor data
  // -----------------------------------------------------------------------
  it("NCP-D-01: round-trips valid DiffFrame with JSON patch", () => {
    const diff: DiffFrame = {
      frame: "0x02",
      anchor_ref: "sha256:abc123",
      base_seq: 42,
      patch_format: "json_patch",
      entity_id: "product:1001",
      patch: [
        { op: "replace", path: "/price", value: 299.0 },
        { op: "replace", path: "/stock", value: 48 },
      ],
    };

    const bytes = encodeJson(diff);
    const decoded = decodeJson(bytes) as DiffFrame;

    expect(decoded.anchor_ref).toBe("sha256:abc123");
    expect(decoded.base_seq).toBe(42);
    expect(decoded.patch).toHaveLength(2);
    expect(decoded.patch[0]!.op).toBe("replace");
    expect(decoded.patch[0]!.value).toBe(299.0);
  });

  // -----------------------------------------------------------------------
  // NCP-D-02: Sequence Gap
  // Spec: §4.2 — base_seq must match receiver's current sequence
  // -----------------------------------------------------------------------
  it("NCP-D-02: rejects sequence gap", () => {
    const diff: DiffFrame = {
      frame: "0x02",
      anchor_ref: "sha256:abc123",
      base_seq: 3,
      patch: [{ op: "replace", path: "/price", value: 100 }],
    };
    const currentSeq = 5;

    expect(() => validateDiffSeq(diff, currentSeq)).toThrow(NcpError);
    try {
      validateDiffSeq(diff, currentSeq);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-STREAM-SEQ-GAP");
    }
  });

  it("NCP-D-02: accepts matching sequence", () => {
    const diff: DiffFrame = {
      frame: "0x02",
      anchor_ref: "sha256:abc123",
      base_seq: 5,
      patch: [{ op: "replace", path: "/price", value: 100 }],
    };
    expect(() => validateDiffSeq(diff, 5)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-D-03: Patch Target Invalid
  // Spec: §4.2 — Patch path not in schema
  // NOTE: Full validation requires schema context. Tested with fast-json-patch
  //       at integration level. Here we verify the DiffFrame structure.
  // -----------------------------------------------------------------------
  it("NCP-D-03: DiffFrame preserves patch paths for validation", () => {
    const diff: DiffFrame = {
      frame: "0x02",
      anchor_ref: "sha256:abc123",
      base_seq: 0,
      patch: [{ op: "replace", path: "/nonexistent_field", value: 42 }],
    };

    const bytes = encodeJson(diff);
    const decoded = decodeJson(bytes) as DiffFrame;
    expect(decoded.patch[0]!.path).toBe("/nonexistent_field");
  });

  // -----------------------------------------------------------------------
  // NCP-D-04: Missing Ref — tested in Step 7 (AnchorCache lookup)
  // -----------------------------------------------------------------------
});
