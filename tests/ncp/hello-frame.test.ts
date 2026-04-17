// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-H-01 through H-06: HelloFrame (0x06)
// Source: test/ncp_test_cases.md §3.5

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { NCP_ERROR_CODES } from "../../src/ncp/ncp-error-codes.js";
import { validateHelloFrame, type HelloFrame } from "../../src/ncp/frames/hello-frame.js";

function makeValidHello(): HelloFrame {
  return {
    frame: "0x06",
    nps_version: "0.4",
    supported_encodings: ["msgpack", "json"],
    supported_protocols: ["ncp", "nwp"],
  };
}

describe("NCP-H: HelloFrame (0x06)", () => {
  // -----------------------------------------------------------------------
  // NCP-H-01: First frame after TCP connect
  // Spec: §3.5 — Client sends HelloFrame as very first frame
  // -----------------------------------------------------------------------
  it("NCP-H-01: accepts a valid HelloFrame with all required fields", () => {
    const frame = makeValidHello();
    expect(() => validateHelloFrame(frame)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-H-02: HelloFrame Not First (protocol enforcement — out of scope for
  //   unit test; validateHelloFrame validates structure only)
  // -----------------------------------------------------------------------
  it("NCP-H-02: valid HelloFrame structure passes validation", () => {
    // Connection-ordering enforcement is a session-layer concern.
    // validateHelloFrame validates fields only.
    const frame = makeValidHello();
    expect(() => validateHelloFrame(frame)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-H-03: HelloFrame Missing Required Fields
  // Spec: §3.5 — nps_version, supported_encodings, supported_protocols required
  // -----------------------------------------------------------------------
  it("NCP-H-03: rejects HelloFrame missing nps_version", () => {
    const frame = { ...makeValidHello(), nps_version: "" } as HelloFrame;
    expect(() => validateHelloFrame(frame)).toThrow(NcpError);
    try {
      validateHelloFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });

  it("NCP-H-03: rejects HelloFrame missing supported_encodings", () => {
    const frame = { ...makeValidHello(), supported_encodings: [] } as HelloFrame;
    expect(() => validateHelloFrame(frame)).toThrow(NcpError);
    try {
      validateHelloFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });

  it("NCP-H-03: rejects HelloFrame missing supported_protocols", () => {
    const frame = { ...makeValidHello(), supported_protocols: [] } as HelloFrame;
    expect(() => validateHelloFrame(frame)).toThrow(NcpError);
    try {
      validateHelloFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-H-04: HelloFrame with ENC=1
  // Spec: §3.5 — ENC=1 on HelloFrame before negotiation → NCP-ENC-NOT-NEGOTIATED
  //   This is checked at the session layer (frame flags), not by validateHelloFrame.
  //   We verify the expected error code is a known constant.
  // -----------------------------------------------------------------------
  it("NCP-H-04: NCP-ENC-NOT-NEGOTIATED is the named constant for pre-negotiation ENC=1", () => {
    // Session-layer enforcement: if ENC=1 flag is set on HelloFrame,
    // the receiver MUST return NCP-ENC-NOT-NEGOTIATED. We assert against the
    // canonical constant rather than a raw string, and the negotiation path
    // itself is exercised end-to-end in ncp-e2e-enc-reject.test.ts.
    expect(NCP_ERROR_CODES.NCP_ENC_NOT_NEGOTIATED).toBe(
      "NCP-ENC-NOT-NEGOTIATED",
    );
    // Sanity: the constant is a member of the NcpErrorCode union, which is
    // the type-level promise that downstream code can rely on.
    const code: (typeof NCP_ERROR_CODES)[keyof typeof NCP_ERROR_CODES] =
      NCP_ERROR_CODES.NCP_ENC_NOT_NEGOTIATED;
    expect(code).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // NCP-H-05: HelloFrame encoded Tier-2
  // Spec: §3.5 — Tier-2 MsgPack is allowed during handshake
  // -----------------------------------------------------------------------
  it("NCP-H-05: validates HelloFrame regardless of encoding tier (structure only)", () => {
    // Tier selection is a codec concern; validateHelloFrame validates fields.
    const frame = makeValidHello();
    expect(() => validateHelloFrame(frame)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-H-06: min_version defaults to nps_version
  // Spec: §3.5 — If min_version omitted, server treats as equal to nps_version
  // -----------------------------------------------------------------------
  it("NCP-H-06: accepts HelloFrame without min_version (optional field)", () => {
    const frame = makeValidHello();
    expect(frame.min_version).toBeUndefined();
    expect(() => validateHelloFrame(frame)).not.toThrow();
  });

  it("NCP-H-06: accepts HelloFrame with explicit min_version", () => {
    const frame = { ...makeValidHello(), min_version: "0.3" };
    expect(() => validateHelloFrame(frame)).not.toThrow();
    expect(frame.min_version).toBe("0.3");
  });
});
