// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — Group 1: Framing & Header (NCP-F-01 to NCP-F-07)
// Source: test/ncp_test_cases.md §1

import { describe, it, expect } from "vitest";
import {
  parseFrameHeader,
  writeFrameHeader,
  buildFlags,
  EncodingTier,
  FrameType,
  NcpError,
  DEFAULT_HEADER_SIZE,
  EXTENDED_HEADER_SIZE,
} from "../../src/core/frame-header.js";

describe("Group 1: Framing & Header", () => {
  // -----------------------------------------------------------------------
  // NCP-F-01: Standard Header (Valid)
  // Spec: §3.1 — Default 4-byte header
  // -----------------------------------------------------------------------
  it("NCP-F-01: decodes standard 4-byte header", () => {
    // AnchorFrame (0x01), flags=0x00 (JSON, no flags), payload=32 bytes
    const buf = new Uint8Array([0x01, 0x00, 0x00, 0x20]);
    const h = parseFrameHeader(buf);

    expect(h.frameType).toBe(FrameType.Anchor);
    expect(h.tier).toBe(EncodingTier.Json);
    expect(h.isFinal).toBe(false);
    expect(h.isEncrypted).toBe(false);
    expect(h.isExtended).toBe(false);
    expect(h.payloadLength).toBe(32);
    expect(h.headerSize).toBe(DEFAULT_HEADER_SIZE);
  });

  // -----------------------------------------------------------------------
  // NCP-F-02: Extended Header (Valid)
  // Spec: §3.1 — Extended 8-byte header (EXT=1)
  // -----------------------------------------------------------------------
  it("NCP-F-02: decodes extended 8-byte header with EXT=1", () => {
    // AnchorFrame, EXT=1 (0x80), payload=65536 (just over default max)
    const buf = new Uint8Array([0x01, 0x80, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    const h = parseFrameHeader(buf);

    expect(h.frameType).toBe(FrameType.Anchor);
    expect(h.isExtended).toBe(true);
    expect(h.payloadLength).toBe(65536);
    expect(h.headerSize).toBe(EXTENDED_HEADER_SIZE);
  });

  // -----------------------------------------------------------------------
  // NCP-F-03: EXT Flag Mismatch (Low)
  // Spec: §3.1, §3.3 — EXT=1 with small payload is valid but inefficient
  // -----------------------------------------------------------------------
  it("NCP-F-03: accepts EXT=1 with small payload (inefficient but valid)", () => {
    // Extended header, payload=100 bytes (well under 64KB)
    const buf = new Uint8Array([0x01, 0x80, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00]);
    const h = parseFrameHeader(buf);

    expect(h.isExtended).toBe(true);
    expect(h.payloadLength).toBe(100);
  });

  // -----------------------------------------------------------------------
  // NCP-F-04: EXT Flag Mismatch (High) — NCP-FRAME-PAYLOAD-TOO-LARGE
  // NOTE: This test belongs at the codec level (Step 5). Default header
  //       uint16 maxes at 65535 — can't physically express > 64KB.
  //       Codec validates payload against negotiated max_frame_payload.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // NCP-F-05: Buffer Underrun
  // Spec: §3.1 — Incomplete data
  // -----------------------------------------------------------------------
  it("NCP-F-05: errors when buffer too small for header", () => {
    // Only 1 byte — need at least 2 for type + flags
    expect(() => parseFrameHeader(new Uint8Array([0x01]))).toThrow(NcpError);
  });

  it("NCP-F-05: errors when buffer too small for default header", () => {
    // 3 bytes — need 4 for default header
    expect(() => parseFrameHeader(new Uint8Array([0x01, 0x00, 0x00]))).toThrow(
      NcpError,
    );
  });

  it("NCP-F-05: errors when buffer too small for extended header", () => {
    // 4 bytes with EXT=1 — need 8
    expect(() =>
      parseFrameHeader(new Uint8Array([0x01, 0x80, 0x00, 0x00])),
    ).toThrow(NcpError);
  });

  // -----------------------------------------------------------------------
  // NCP-F-06: Buffer Overrun
  // Spec: §3.1 — Extra bytes are buffered for next frame
  // -----------------------------------------------------------------------
  it("NCP-F-06: parses header from oversized buffer", () => {
    // 4-byte header + 250 extra bytes — header parses, remainder ignored
    const buf = new Uint8Array(254);
    buf[0] = 0x01; // AnchorFrame
    buf[1] = 0x00; // no flags
    buf[2] = 0x00;
    buf[3] = 0x64; // payload = 100

    const h = parseFrameHeader(buf);
    expect(h.payloadLength).toBe(100);
    // Codec would read buf[4..104] as payload, buffer buf[104..] for next frame
  });

  // -----------------------------------------------------------------------
  // NCP-F-07: Reserved Flags Non-Zero
  // Spec: §3.2 — Bits 4-6 MUST be 0
  // -----------------------------------------------------------------------
  it("NCP-F-07: rejects non-zero reserved flag bits (bit 4)", () => {
    const buf = new Uint8Array([0x01, 0x10, 0x00, 0x20]); // bit 4 set
    expect(() => parseFrameHeader(buf)).toThrow(NcpError);
  });

  it("NCP-F-07: rejects non-zero reserved flag bits (bit 5)", () => {
    const buf = new Uint8Array([0x01, 0x20, 0x00, 0x20]); // bit 5 set
    expect(() => parseFrameHeader(buf)).toThrow(NcpError);
  });

  it("NCP-F-07: rejects non-zero reserved flag bits (bit 6)", () => {
    const buf = new Uint8Array([0x01, 0x40, 0x00, 0x20]); // bit 6 set
    expect(() => parseFrameHeader(buf)).toThrow(NcpError);
  });

  it("NCP-F-07: error code is NCP-FRAME-FLAGS-INVALID", () => {
    const buf = new Uint8Array([0x01, 0x20, 0x00, 0x20]);
    try {
      parseFrameHeader(buf);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NcpError);
      expect((e as NcpError).code).toBe("NCP-FRAME-FLAGS-INVALID");
    }
  });

  // -----------------------------------------------------------------------
  // Additional: Round-trip, ENC flag, write validation
  // -----------------------------------------------------------------------
  it("round-trips default header", () => {
    const flags = buildFlags({ tier: EncodingTier.MsgPack, final: true });
    const original = {
      frameType: FrameType.Caps,
      flags,
      payloadLength: 1024,
      tier: EncodingTier.MsgPack,
      isFinal: true,
      isEncrypted: false,
      isExtended: false,
      headerSize: DEFAULT_HEADER_SIZE,
    };

    const buf = new Uint8Array(DEFAULT_HEADER_SIZE);
    writeFrameHeader(original, buf);
    const parsed = parseFrameHeader(buf);

    expect(parsed.frameType).toBe(original.frameType);
    expect(parsed.payloadLength).toBe(original.payloadLength);
    expect(parsed.tier).toBe(EncodingTier.MsgPack);
    expect(parsed.isFinal).toBe(true);
  });

  it("round-trips extended header", () => {
    const flags = buildFlags({ tier: EncodingTier.Json, extended: true });
    const original = {
      frameType: FrameType.Stream,
      flags,
      payloadLength: 100_000,
      tier: EncodingTier.Json,
      isFinal: false,
      isEncrypted: false,
      isExtended: true,
      headerSize: EXTENDED_HEADER_SIZE,
    };

    const buf = new Uint8Array(EXTENDED_HEADER_SIZE);
    writeFrameHeader(original, buf);
    const parsed = parseFrameHeader(buf);

    expect(parsed.frameType).toBe(original.frameType);
    expect(parsed.payloadLength).toBe(100_000);
    expect(parsed.isExtended).toBe(true);
  });

  it("detects ENC flag", () => {
    const flags = buildFlags({ encrypted: true });
    const buf = new Uint8Array([0x01, flags, 0x00, 0x20]);
    const h = parseFrameHeader(buf);
    expect(h.isEncrypted).toBe(true);
  });

  it("write errors on undersized buffer", () => {
    const h = {
      frameType: FrameType.Anchor,
      flags: 0x00,
      payloadLength: 32,
      tier: EncodingTier.Json,
      isFinal: false,
      isEncrypted: false,
      isExtended: false,
      headerSize: DEFAULT_HEADER_SIZE,
    };
    expect(() => writeFrameHeader(h, new Uint8Array(2))).toThrow();
  });

  it("extended header reserved bytes are zero", () => {
    const flags = buildFlags({ extended: true });
    const h = {
      frameType: FrameType.Anchor,
      flags,
      payloadLength: 70_000,
      tier: EncodingTier.Json,
      isFinal: false,
      isEncrypted: false,
      isExtended: true,
      headerSize: EXTENDED_HEADER_SIZE,
    };

    const buf = new Uint8Array(EXTENDED_HEADER_SIZE);
    buf[6] = 0xff; // pre-fill to prove write zeros
    buf[7] = 0xff;
    writeFrameHeader(h, buf);

    expect(buf[6]).toBe(0);
    expect(buf[7]).toBe(0);
  });
});
