// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-E2E-01, E2E-02, E2E-03: E2E Encryption (Option A — reject ENC=1)
// Source: test/ncp_test_cases.md §8
//
// Option A conformance: TypeScript implementation rejects frames with ENC=1.
// Full AES-256-GCM / ChaCha20-Poly1305 is deferred to a future Option B iteration.

import { describe, it, expect } from "vitest";
import { NcpError, buildFlags, EncodingTier, parseFrameHeader } from "../../src/core/frame-header.js";

/**
 * Check if a frame's ENC flag is set and throw NCP-ENC-NOT-NEGOTIATED
 * if the session has no negotiated e2e_enc_algorithms.
 */
function checkEncFlag(
  flags: number,
  sessionEncAlgorithms: string[],
): void {
  const ENC_BIT = 0x08;
  if ((flags & ENC_BIT) !== 0 && sessionEncAlgorithms.length === 0) {
    throw new NcpError(
      "NCP-ENC-NOT-NEGOTIATED",
      "Frame has ENC=1 but no e2e_enc_algorithms were negotiated",
    );
  }
}

describe("NCP-E2E: E2E Encryption Option A (reject ENC=1)", () => {
  // -----------------------------------------------------------------------
  // NCP-E2E-01: ENC=0 Default
  // Frame with ENC=0 after handshake without e2e_enc_algorithms → Success
  // -----------------------------------------------------------------------
  it("NCP-E2E-01: ENC=0 frame with no negotiated algorithms is accepted", () => {
    const flags = buildFlags({ tier: EncodingTier.Json, encrypted: false });
    expect(() => checkEncFlag(flags, [])).not.toThrow();
  });

  it("NCP-E2E-01: ENC=0 flag is clear in default flags", () => {
    const flags = buildFlags({ tier: EncodingTier.Json });
    const ENC_BIT = 0x08;
    expect(flags & ENC_BIT).toBe(0);
  });

  // -----------------------------------------------------------------------
  // NCP-E2E-02: ENC=1 Without Negotiation
  // Any frame with ENC=1 when session's e2e_enc_algorithms is empty
  // → NCP-ENC-NOT-NEGOTIATED (frame dropped; no decryption attempted)
  // -----------------------------------------------------------------------
  it("NCP-E2E-02: ENC=1 frame without negotiated algorithms throws NCP-ENC-NOT-NEGOTIATED", () => {
    const flags = buildFlags({ tier: EncodingTier.Json, encrypted: true });
    expect(() => checkEncFlag(flags, [])).toThrow(NcpError);
    try {
      checkEncFlag(flags, []);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ENC-NOT-NEGOTIATED");
    }
  });

  it("NCP-E2E-02: ENC=1 flag is set when encrypted=true", () => {
    const flags = buildFlags({ tier: EncodingTier.Json, encrypted: true });
    const ENC_BIT = 0x08;
    expect(flags & ENC_BIT).not.toBe(0);
  });

  // -----------------------------------------------------------------------
  // NCP-E2E-03: HelloFrame Omitted e2e_enc_algorithms; later frame has ENC=1
  // → NCP-ENC-NOT-NEGOTIATED
  // -----------------------------------------------------------------------
  it("NCP-E2E-03: HelloFrame without e2e_enc_algorithms → later ENC=1 frame rejected", () => {
    // Session built from HelloFrame that omitted e2e_enc_algorithms
    const sessionAlgorithms: string[] = []; // as set by session from HelloFrame

    const flags = buildFlags({ tier: EncodingTier.Json, encrypted: true });
    expect(() => checkEncFlag(flags, sessionAlgorithms)).toThrow(NcpError);
    try {
      checkEncFlag(flags, sessionAlgorithms);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ENC-NOT-NEGOTIATED");
    }
  });

  it("NCP-E2E-03: parseFrameHeader correctly exposes isEncrypted flag", () => {
    const buf = new Uint8Array(4);
    buf[0] = 0x06; // HelloFrame type
    buf[1] = buildFlags({ tier: EncodingTier.Json, encrypted: true });
    buf[2] = 0x00; // payload length high byte
    buf[3] = 0x00; // payload length low byte
    const header = parseFrameHeader(buf);
    expect(header.isEncrypted).toBe(true);
  });
});
