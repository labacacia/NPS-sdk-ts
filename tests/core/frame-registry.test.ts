// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-F-08: Unknown Frame Type
// Source: test/ncp_test_cases.md §1

import { describe, it, expect } from "vitest";
import { FrameType, NcpError } from "../../src/core/frame-header.js";
import { FrameRegistry } from "../../src/core/frame-registry.js";

describe("NCP-F-08: Unknown Frame Type", () => {
  const registry = FrameRegistry.createDefault();

  // -----------------------------------------------------------------------
  // NCP-F-08: Unknown Frame Type
  // Spec: §2.3 — Frame type routing table
  // -----------------------------------------------------------------------
  it("rejects unregistered frame type 0x88", () => {
    expect(() => registry.resolve(0x88)).toThrow(NcpError);
    try {
      registry.resolve(0x88);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-FRAME-UNKNOWN-TYPE");
    }
  });

  it("resolves registered NCP frame types", () => {
    expect(registry.resolve(FrameType.Anchor).name).toBe("AnchorFrame");
    expect(registry.resolve(FrameType.Diff).name).toBe("DiffFrame");
    expect(registry.resolve(FrameType.Stream).name).toBe("StreamFrame");
    expect(registry.resolve(FrameType.Caps).name).toBe("CapsFrame");
    expect(registry.resolve(FrameType.Hello).name).toBe("HelloFrame");
    expect(registry.resolve(FrameType.Error).name).toBe("ErrorFrame");
  });

  it("resolves protocol for frame types", () => {
    expect(registry.resolve(FrameType.Anchor).protocol).toBe("ncp");
    expect(registry.resolve(FrameType.Error).protocol).toBe("system");
  });

  it("has() returns false for unregistered types", () => {
    expect(registry.has(0x88)).toBe(false);
    expect(registry.has(FrameType.Anchor)).toBe(true);
  });
});
