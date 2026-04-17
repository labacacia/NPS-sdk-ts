// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-D-05 through D-10: DiffFrame patch_format
// Source: test/ncp_test_cases.md §3.2

import { describe, it, expect } from "vitest";
import { NcpError, EncodingTier } from "../../src/core/frame-header.js";
import {
  validateDiffFrame,
  type DiffFrame,
} from "../../src/ncp/frames/diff-frame.js";

function makeJsonPatchFrame(overrides?: Partial<DiffFrame>): DiffFrame {
  return {
    frame: "0x02",
    anchor_ref: "sha256:abc123",
    base_seq: 0,
    patch: [{ op: "replace", path: "/name", value: "updated" }],
    ...overrides,
  };
}

describe("NCP-D: DiffFrame patch_format", () => {
  // -----------------------------------------------------------------------
  // NCP-D-05: Default patch_format (json_patch)
  // patch_format omitted on Tier-1 JSON frame → treat as json_patch → Success
  // -----------------------------------------------------------------------
  it("NCP-D-05: omitted patch_format on Tier-1 passes validation", () => {
    const frame = makeJsonPatchFrame();
    expect(frame.patch_format).toBeUndefined();
    expect(() => validateDiffFrame(frame, EncodingTier.Json)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-D-06: Explicit patch_format=json_patch
  // json_patch on Tier-1 or Tier-2 → Success
  // -----------------------------------------------------------------------
  it("NCP-D-06: explicit patch_format=json_patch on Tier-1 passes", () => {
    const frame = makeJsonPatchFrame({ patch_format: "json_patch" });
    expect(() => validateDiffFrame(frame, EncodingTier.Json)).not.toThrow();
  });

  it("NCP-D-06: explicit patch_format=json_patch on Tier-2 passes", () => {
    const frame = makeJsonPatchFrame({ patch_format: "json_patch" });
    expect(() => validateDiffFrame(frame, EncodingTier.MsgPack)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-D-07: binary_bitset on Tier-2 (supported)
  // patch_format=binary_bitset on Tier-2 MsgPack → Success
  // -----------------------------------------------------------------------
  it("NCP-D-07: binary_bitset on Tier-2 MsgPack passes", () => {
    const frame: DiffFrame = {
      ...makeJsonPatchFrame(),
      patch_format: "binary_bitset",
      patch: new Uint8Array([0b00000011, 0x01, 0x05]), // bitset + packed values
    };
    expect(() => validateDiffFrame(frame, EncodingTier.MsgPack)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-D-08: binary_bitset on Tier-1 (protocol forbids)
  // Expected: NCP-DIFF-FORMAT-UNSUPPORTED
  // -----------------------------------------------------------------------
  it("NCP-D-08: binary_bitset on Tier-1 JSON throws NCP-DIFF-FORMAT-UNSUPPORTED", () => {
    const frame = makeJsonPatchFrame({ patch_format: "binary_bitset" });
    expect(() => validateDiffFrame(frame, EncodingTier.Json)).toThrow(NcpError);
    try {
      validateDiffFrame(frame, EncodingTier.Json);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-DIFF-FORMAT-UNSUPPORTED");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-D-09: binary_bitset when receiver opted out
  // Simulated as Tier-1 (non-Tier-2) → NCP-DIFF-FORMAT-UNSUPPORTED
  // -----------------------------------------------------------------------
  it("NCP-D-09: binary_bitset when receiver opted out (non-Tier-2) throws NCP-DIFF-FORMAT-UNSUPPORTED", () => {
    const frame = makeJsonPatchFrame({ patch_format: "binary_bitset" });
    // Receiver did not advertise binary_bitset support — simulated as JSON tier
    expect(() => validateDiffFrame(frame, EncodingTier.Json)).toThrow(NcpError);
    try {
      validateDiffFrame(frame, EncodingTier.Json);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-DIFF-FORMAT-UNSUPPORTED");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-D-10: Unknown patch_format
  // patch_format="some_future_format" → NCP-DIFF-FORMAT-UNSUPPORTED
  // -----------------------------------------------------------------------
  it("NCP-D-10: unknown patch_format throws NCP-DIFF-FORMAT-UNSUPPORTED", () => {
    // Cast to bypass TypeScript type check for runtime test
    const frame = makeJsonPatchFrame({
      patch_format: "some_future_format" as unknown as "json_patch",
    });
    expect(() => validateDiffFrame(frame, EncodingTier.Json)).toThrow(NcpError);
    try {
      validateDiffFrame(frame, EncodingTier.Json);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-DIFF-FORMAT-UNSUPPORTED");
    }
  });
});
