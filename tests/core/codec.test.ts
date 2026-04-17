// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — Codec dispatcher + MsgPack
// Covers: NCP-F-04, F-09, NCP-E-02, E-04, E-05, E-06
// Source: test/ncp_test_cases.md §1, §2

import { describe, it, expect } from "vitest";
import { EncodingTier, FrameType, NcpError } from "../../src/core/frame-header.js";
import { encodeFrame, decodeFrame } from "../../src/core/codecs/ncp-codec.js";
import { computeAnchorId, type FrameSchema } from "../../src/ncp/frames/anchor-frame.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSchema: FrameSchema = {
  fields: [
    { name: "id", type: "uint64" },
    { name: "name", type: "string" },
  ],
};

// ===========================================================================
// NCP-F-04: EXT Flag Mismatch (High) — payload exceeds default max
// ===========================================================================

describe("NCP-F-04 / NCP-F-09: Payload size enforcement", () => {
  // -----------------------------------------------------------------------
  // NCP-F-09: Max Payload Enforced
  // Spec: §3.3 — Negotiated max_frame_payload
  // -----------------------------------------------------------------------
  it("NCP-F-09: rejects payload exceeding negotiated max", () => {
    // Encode a small frame, then decode with a tiny max
    const frame = encodeFrame(
      { frame: "0x01", anchor_id: "sha256:abc", schema: testSchema },
      { frameType: FrameType.Anchor },
    );

    expect(() => decodeFrame(frame, { maxFramePayload: 10 })).toThrow(NcpError);
    try {
      decodeFrame(frame, { maxFramePayload: 10 });
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-FRAME-PAYLOAD-TOO-LARGE");
    }
  });

  it("NCP-F-09: accepts payload within negotiated max", () => {
    const frame = encodeFrame(
      { frame: "0x01", data: "small" },
      { frameType: FrameType.Anchor },
    );
    expect(() => decodeFrame(frame, { maxFramePayload: 65535 })).not.toThrow();
  });

  // NCP-F-04: The codec auto-upgrades to extended header for large payloads
  it("NCP-F-04: auto-extends header for payload > 64KB", () => {
    const largeData = { frame: "0x03", data: "x".repeat(70_000) };
    const frame = encodeFrame(largeData, { frameType: FrameType.Stream });

    // Should have used extended header
    expect(frame[1]! & 0x80).toBe(0x80); // EXT bit set

    // Decode with large enough max
    const result = decodeFrame(frame, { maxFramePayload: 0xffffffff });
    expect((result.payload as { data: string }).data).toHaveLength(70_000);
  });
});

// ===========================================================================
// NCP-E-02: Tier-2 MsgPack (Valid)
// ===========================================================================

describe("NCP-E-02 / E-04: Tier-2 MsgPack", () => {
  // -----------------------------------------------------------------------
  // NCP-E-02: Tier-2 MsgPack (Valid)
  // Spec: §3.2, §8 — Flags T0/T1 = 01
  // -----------------------------------------------------------------------
  it("NCP-E-02: round-trips frame via MsgPack encoding", () => {
    const anchor = {
      frame: "0x01",
      anchor_id: computeAnchorId(testSchema),
      schema: testSchema,
      ttl: 3600,
    };

    const encoded = encodeFrame(anchor, {
      frameType: FrameType.Anchor,
      tier: EncodingTier.MsgPack,
    });
    const result = decodeFrame(encoded);

    expect(result.header.tier).toBe(EncodingTier.MsgPack);
    const decoded = result.payload as typeof anchor;
    expect(decoded.frame).toBe("0x01");
    expect(decoded.ttl).toBe(3600);
  });

  // -----------------------------------------------------------------------
  // NCP-E-04: Tier-2 MsgPack (Malformed)
  // Spec: §3.2, §8 — Invalid MsgPack → NPS-CLIENT-BAD-FRAME
  // -----------------------------------------------------------------------
  it("NCP-E-04: rejects malformed MsgPack payload", () => {
    // Craft a frame with MsgPack tier flag but garbage payload
    const header = new Uint8Array([
      FrameType.Anchor, // frame type
      0x01, // flags: Tier-2 MsgPack
      0x00,
      0x04, // payload length: 4
    ]);
    const garbage = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
    const frame = new Uint8Array(header.length + garbage.length);
    frame.set(header);
    frame.set(garbage, header.length);

    expect(() => decodeFrame(frame)).toThrow(NcpError);
    try {
      decodeFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });
});

// ===========================================================================
// NCP-E-05: Reserved Tier
// ===========================================================================

describe("NCP-E-05: Reserved encoding tier", () => {
  // -----------------------------------------------------------------------
  // NCP-E-05: Reserved Tier (T3/T4)
  // Spec: §3.2, §8 — T0/T1 = 10 or 11 → NCP-ENCODING-UNSUPPORTED
  // -----------------------------------------------------------------------
  it("NCP-E-05: rejects reserved encoding tier 0x02", () => {
    // Craft header with tier bits = 10 (0x02)
    const header = new Uint8Array([
      FrameType.Anchor,
      0x02, // flags: tier = 10 (reserved)
      0x00,
      0x02, // payload: 2 bytes
    ]);
    const payload = new Uint8Array([0x80, 0x00]); // dummy
    const frame = new Uint8Array(header.length + payload.length);
    frame.set(header);
    frame.set(payload, header.length);

    expect(() => decodeFrame(frame)).toThrow(NcpError);
    try {
      decodeFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ENCODING-UNSUPPORTED");
    }
  });

  it("NCP-E-05: rejects reserved encoding tier 0x03", () => {
    const header = new Uint8Array([
      FrameType.Anchor,
      0x03, // flags: tier = 11 (reserved)
      0x00,
      0x02,
    ]);
    const payload = new Uint8Array([0x80, 0x00]);
    const frame = new Uint8Array(header.length + payload.length);
    frame.set(header);
    frame.set(payload, header.length);

    expect(() => decodeFrame(frame)).toThrow(NcpError);
    try {
      decodeFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ENCODING-UNSUPPORTED");
    }
  });
});

// ===========================================================================
// NCP-E-06: Encoding Switch
// ===========================================================================

describe("NCP-E-06: Mid-session encoding switch", () => {
  // -----------------------------------------------------------------------
  // NCP-E-06: Encoding Switch
  // Spec: §8 — Different frames MAY use different tiers
  // -----------------------------------------------------------------------
  it("NCP-E-06: decodes JSON then MsgPack frames back-to-back", () => {
    const data = { frame: "0x04", anchor_ref: "sha256:abc", count: 0, data: [] };

    const jsonFrame = encodeFrame(data, {
      frameType: FrameType.Caps,
      tier: EncodingTier.Json,
    });
    const msgpackFrame = encodeFrame(data, {
      frameType: FrameType.Caps,
      tier: EncodingTier.MsgPack,
    });

    const result1 = decodeFrame(jsonFrame);
    expect(result1.header.tier).toBe(EncodingTier.Json);
    expect((result1.payload as { count: number }).count).toBe(0);

    const result2 = decodeFrame(msgpackFrame);
    expect(result2.header.tier).toBe(EncodingTier.MsgPack);
    expect((result2.payload as { count: number }).count).toBe(0);
  });
});
