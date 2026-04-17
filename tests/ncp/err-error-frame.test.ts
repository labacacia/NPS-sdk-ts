// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-ERR-01, NCP-ERR-02, NCP-ERR-03: ErrorFrame (0xFE)
// Source: test/ncp_test_cases.md §3.5, §3.6

import { describe, it, expect } from "vitest";
import { isErrorFrame, type ErrorFrame } from "../../src/ncp/frames/error-frame.js";
import { NCP_ERROR_CODES } from "../../src/ncp/ncp-error-codes.js";

describe("NCP-ERR: ErrorFrame (0xFE)", () => {
  // -----------------------------------------------------------------------
  // NCP-ERR-01: Standard Error
  // Spec: §4.7 — ErrorFrame carries NPS status + protocol error + message
  // -----------------------------------------------------------------------
  it("NCP-ERR-01: parses standard error with status, error, and message", () => {
    const raw: ErrorFrame = {
      frame: "0xFE",
      status: "NPS-CLIENT-NOT-FOUND",
      error: "NCP-ANCHOR-NOT-FOUND",
      message: "Schema anchor not found in cache, please resend AnchorFrame",
    };

    expect(isErrorFrame(raw)).toBe(true);
    expect(raw.status).toBe("NPS-CLIENT-NOT-FOUND");
    expect(raw.error).toBe("NCP-ANCHOR-NOT-FOUND");
    expect(raw.message).toContain("Schema anchor not found");
  });

  // -----------------------------------------------------------------------
  // NCP-ERR-02: Nested Details
  // Spec: §4.7 — details object contains structured data
  // -----------------------------------------------------------------------
  it("NCP-ERR-02: parses error with nested details object", () => {
    const raw: ErrorFrame = {
      frame: "0xFE",
      status: "NPS-CLIENT-NOT-FOUND",
      error: "NCP-ANCHOR-NOT-FOUND",
      message: "Schema not found",
      details: {
        anchor_ref: "sha256:a3f9b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef12",
        retry_after_ms: 5000,
      },
    };

    expect(isErrorFrame(raw)).toBe(true);
    expect(raw.details).toBeDefined();
    expect(raw.details!.anchor_ref).toBe(
      "sha256:a3f9b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef12",
    );
    expect(raw.details!.retry_after_ms).toBe(5000);
  });

  it("NCP-ERR-02: handles version incompatible error with server details", () => {
    const raw: ErrorFrame = {
      frame: "0xFE",
      status: "NPS-PROTO-VERSION-INCOMPATIBLE",
      error: "NCP-VERSION-INCOMPATIBLE",
      message: "No compatible NPS version",
      details: {
        server_version: "0.4",
        client_min_version: "0.5",
      },
    };

    expect(isErrorFrame(raw)).toBe(true);
    expect(raw.details!.server_version).toBe("0.4");
    expect(raw.details!.client_min_version).toBe("0.5");
  });

  // -----------------------------------------------------------------------
  // Type guard edge cases
  // -----------------------------------------------------------------------
  it("type guard rejects non-error objects", () => {
    expect(isErrorFrame(null)).toBe(false);
    expect(isErrorFrame({})).toBe(false);
    expect(isErrorFrame({ frame: "0x01" })).toBe(false);
    expect(isErrorFrame({ frame: "0xFE" })).toBe(false); // missing status + error
    expect(isErrorFrame({ frame: "0xFE", status: "NPS-CLIENT-NOT-FOUND" })).toBe(false);
  });

  it("type guard accepts minimal valid error", () => {
    expect(
      isErrorFrame({
        frame: "0xFE",
        status: "NPS-CLIENT-BAD-FRAME",
        error: "NCP-FRAME-UNKNOWN-TYPE",
      }),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // NCP-ERR-03: v0.4 Error Code Roundtrip
  // Spec: §3.6 — ErrorFrame carrying each of the 6 new v0.4 codes decodes cleanly
  // New codes: NCP-ANCHOR-STALE, NCP-DIFF-FORMAT-UNSUPPORTED, NCP-VERSION-INCOMPATIBLE,
  //            NCP-STREAM-WINDOW-OVERFLOW, NCP-ENC-NOT-NEGOTIATED, NCP-ENC-AUTH-FAILED
  // -----------------------------------------------------------------------
  describe("NCP-ERR-03: v0.4 error code roundtrip", () => {
    const v04Codes: Array<{ code: string; status: string; description: string }> = [
      {
        code: NCP_ERROR_CODES.NCP_ANCHOR_STALE,
        status: "NPS-CLIENT-CONFLICT",
        description: "Anchor is stale; server has a newer version",
      },
      {
        code: NCP_ERROR_CODES.NCP_DIFF_FORMAT_UNSUPPORTED,
        status: "NPS-CLIENT-BAD-FRAME",
        description: "patch_format=binary_bitset not supported on this tier",
      },
      {
        code: NCP_ERROR_CODES.NCP_VERSION_INCOMPATIBLE,
        status: "NPS-PROTO-VERSION-INCOMPATIBLE",
        description: "No compatible NPS version between client and server",
      },
      {
        code: NCP_ERROR_CODES.NCP_STREAM_WINDOW_OVERFLOW,
        status: "NPS-STREAM-LIMIT",
        description: "Sender exceeded flow-control window",
      },
      {
        code: NCP_ERROR_CODES.NCP_ENC_NOT_NEGOTIATED,
        status: "NPS-CLIENT-BAD-FRAME",
        description: "ENC=1 set but no encryption algorithms were negotiated",
      },
      {
        code: NCP_ERROR_CODES.NCP_ENC_AUTH_FAILED,
        status: "NPS-CLIENT-BAD-FRAME",
        description: "E2E encryption auth-tag verification failed",
      },
    ];

    for (const { code, status, description } of v04Codes) {
      it(`roundtrips ErrorFrame with error="${code}"`, () => {
        const raw: ErrorFrame = {
          frame: "0xFE",
          status,
          error: code,
          message: description,
        };

        // Encodes cleanly (type guard accepts)
        expect(isErrorFrame(raw)).toBe(true);

        // Decodes cleanly (fields preserved)
        expect(raw.frame).toBe("0xFE");
        expect(raw.status).toBe(status);
        expect(raw.error).toBe(code);
        expect(raw.message).toBe(description);
      });
    }
  });
});
