// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Parity tests for NPS-RFC-0001 NCP native-mode connection preamble.

import { describe, it, expect } from "vitest";
import {
  PREAMBLE_BYTES,
  PREAMBLE_LENGTH,
  PREAMBLE_LITERAL,
  PREAMBLE_ERROR_CODE,
  PREAMBLE_STATUS_CODE,
  preambleMatches,
  tryValidatePreamble,
  validatePreamble,
  writePreamble,
  NcpPreambleInvalidError,
} from "../../src/ncp/preamble.js";

const SPEC_BYTES = new Uint8Array([0x4e, 0x50, 0x53, 0x2f, 0x31, 0x2e, 0x30, 0x0a]);

describe("NCP preamble", () => {
  it("bytes are exactly the spec constant", () => {
    expect(PREAMBLE_LENGTH).toBe(8);
    expect(PREAMBLE_LITERAL).toBe("NPS/1.0\n");
    expect(PREAMBLE_BYTES).toEqual(SPEC_BYTES);
  });

  it("matches returns true for exact preamble", () => {
    expect(preambleMatches(PREAMBLE_BYTES)).toBe(true);
  });

  it("matches returns true when preamble is at start of longer buffer", () => {
    const combined = new Uint8Array(16);
    combined.set(PREAMBLE_BYTES, 0);
    combined[8] = 0x06;
    expect(preambleMatches(combined)).toBe(true);
  });

  it.each([0, 1, 7])("matches returns false on short read length=%i", (n) => {
    expect(preambleMatches(PREAMBLE_BYTES.slice(0, n))).toBe(false);
  });

  it("tryValidate accepts exact preamble", () => {
    const r = tryValidatePreamble(PREAMBLE_BYTES);
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("");
  });

  it("tryValidate rejects short read with reason", () => {
    const r = tryValidatePreamble(new Uint8Array(3));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("short read");
    expect(r.reason).toContain("3/8");
  });

  it("tryValidate rejects arbitrary garbage", () => {
    const r = tryValidatePreamble(new TextEncoder().encode("GET / HTT"));
    expect(r.valid).toBe(false);
    expect(r.reason).not.toContain("future");
    expect(r.reason).toContain("not speaking NPS");
  });

  it("tryValidate flags future-major-version distinctly", () => {
    const r = tryValidatePreamble(new TextEncoder().encode("NPS/2.0\n"));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("future-major");
  });

  it("validate throws with codes exposed", () => {
    try {
      validatePreamble(new TextEncoder().encode("BADXXXXX"));
      throw new Error("expected throw");
    } catch (e) {
      const err = e as NcpPreambleInvalidError;
      expect(err.errorCode).toBe("NCP-PREAMBLE-INVALID");
      expect(err.statusCode).toBe("NPS-PROTO-PREAMBLE-INVALID");
      expect(err.message).not.toBe("");
    }
  });

  it("writePreamble emits exactly the constant bytes", () => {
    const chunks: Uint8Array[] = [];
    writePreamble({ write: (b) => chunks.push(b) });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(SPEC_BYTES);
  });

  it("status and error code constants match spec", () => {
    expect(PREAMBLE_ERROR_CODE).toBe("NCP-PREAMBLE-INVALID");
    expect(PREAMBLE_STATUS_CODE).toBe("NPS-PROTO-PREAMBLE-INVALID");
  });
});
