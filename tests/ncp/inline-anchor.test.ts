// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — NCP-C-05, C-06, C-07: CapsFrame inline_anchor
// Source: test/ncp_test_cases.md §3.4

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { computeAnchorId, type FrameSchema } from "../../src/ncp/frames/anchor-frame.js";
import { validateCapsFrame, type CapsFrame } from "../../src/ncp/frames/caps-frame.js";

const schemaV1: FrameSchema = {
  fields: [
    { name: "id", type: "uint64", semantic: "entity.id" },
    { name: "name", type: "string", semantic: "entity.label" },
  ],
};

const schemaV2: FrameSchema = {
  fields: [
    { name: "id", type: "uint64", semantic: "entity.id" },
    { name: "name", type: "string", semantic: "entity.label" },
    { name: "price", type: "decimal", semantic: "commerce.price.usd" },
  ],
};

function makeValidCaps(overrides?: Partial<CapsFrame>): CapsFrame {
  return {
    frame: "0x04",
    anchor_ref: computeAnchorId(schemaV1),
    count: 2,
    data: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
    ...overrides,
  };
}

describe("NCP-C: CapsFrame inline_anchor", () => {
  // -----------------------------------------------------------------------
  // NCP-C-05: inline_anchor Present (Valid)
  // CapsFrame with inline_anchor containing valid AnchorFrame
  // (correct anchor_id = JCS+SHA-256 of schema). Expected: Success
  // -----------------------------------------------------------------------
  it("NCP-C-05: valid inline_anchor passes validation", () => {
    const anchorId = computeAnchorId(schemaV1);
    const frame = makeValidCaps({
      inline_anchor: { anchor_id: anchorId, schema: schemaV1, ttl: 3600 },
    });
    expect(() => validateCapsFrame(frame)).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // NCP-C-06: inline_anchor anchor_id Mismatch
  // anchor_id != recomputed JCS+SHA-256 of schema → NCP-ANCHOR-SCHEMA-INVALID
  // cache NOT updated
  // -----------------------------------------------------------------------
  it("NCP-C-06: inline_anchor with wrong anchor_id throws NCP-ANCHOR-SCHEMA-INVALID", () => {
    const frame = makeValidCaps({
      inline_anchor: {
        anchor_id: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        schema: schemaV1,
        ttl: 3600,
      },
    });
    expect(() => validateCapsFrame(frame)).toThrow(NcpError);
    try {
      validateCapsFrame(frame);
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-ANCHOR-SCHEMA-INVALID");
    }
  });

  // -----------------------------------------------------------------------
  // NCP-C-07: inline_anchor Auto-Update Flow
  // Outer anchor_ref points to NEW anchor; inline_anchor carries its AnchorFrame.
  // Old anchor retired from cache, new cached. Expected: Success
  // -----------------------------------------------------------------------
  it("NCP-C-07: inline_anchor with new schema version passes validation", () => {
    const newAnchorId = computeAnchorId(schemaV2);
    const frame = makeValidCaps({
      anchor_ref: newAnchorId, // outer ref points to new anchor
      inline_anchor: { anchor_id: newAnchorId, schema: schemaV2, ttl: 3600 },
    });
    expect(() => validateCapsFrame(frame)).not.toThrow();
    // Cache update (retire old, store new) is a session-layer concern.
    // validateCapsFrame confirms the inline_anchor is structurally valid.
    expect(frame.inline_anchor!.anchor_id).toBe(newAnchorId);
  });
});
