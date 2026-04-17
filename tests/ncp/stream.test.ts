// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — StreamFrame + StreamManager
// Covers: NCP-S-01 to NCP-S-06, NCP-S-12 (UUID format), NCP-S-13 (unknown stream_id)
// Source: test/ncp_test_cases.md §3.3

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { StreamManager } from "../../src/ncp/stream-manager.js";
import { validateStreamFrame, type StreamFrame } from "../../src/ncp/frames/stream-frame.js";

function chunk(
  streamId: string,
  seq: number,
  data: unknown[],
  opts?: { is_last?: boolean; error_code?: string },
): StreamFrame {
  return {
    frame: "0x03",
    stream_id: streamId,
    seq,
    is_last: opts?.is_last ?? false,
    data,
    error_code: opts?.error_code,
  };
}

// ===========================================================================
// NCP-S-01: Sequential Chunks
// ===========================================================================

describe("NCP-S-01: Sequential Chunks", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — seq 0, 1, 2... with is_last=true on final chunk
  // -----------------------------------------------------------------------
  it("reassembles sequential chunks", () => {
    const mgr = new StreamManager();

    expect(mgr.receive(chunk("s1", 0, ["A", "B"]))).toBe(false);
    expect(mgr.receive(chunk("s1", 1, ["C", "D"]))).toBe(false);
    expect(mgr.receive(chunk("s1", 2, ["E"], { is_last: true }))).toBe(true);

    const data = mgr.getData("s1");
    expect(data).toEqual(["A", "B", "C", "D", "E"]);
  });
});

// ===========================================================================
// NCP-S-02: Out of Order Gap
// ===========================================================================

describe("NCP-S-02: Out of Order Gap", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — Sequence numbers MUST be strictly sequential
  // -----------------------------------------------------------------------
  it("rejects sequence gap", () => {
    const mgr = new StreamManager();
    mgr.receive(chunk("s1", 0, ["A"]));

    expect(() => mgr.receive(chunk("s1", 2, ["C"]))).toThrow(NcpError);
    try {
      mgr.receive(chunk("s1", 2, ["C"]));
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-STREAM-SEQ-GAP");
    }
  });
});

// ===========================================================================
// NCP-S-03: Duplicate Sequence
// ===========================================================================

describe("NCP-S-03: Duplicate Sequence", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — Duplicate seq: ignore or error (both acceptable)
  // Our implementation: ignore (idempotent)
  // -----------------------------------------------------------------------
  it("ignores duplicate sequence number", () => {
    const mgr = new StreamManager();
    mgr.receive(chunk("s1", 0, ["A"]));
    const result = mgr.receive(chunk("s1", 0, ["A-dup"])); // duplicate
    expect(result).toBe(false); // ignored

    mgr.receive(chunk("s1", 1, ["B"], { is_last: true }));
    const data = mgr.getData("s1");
    expect(data).toEqual(["A", "B"]); // no duplicate data
  });
});

// ===========================================================================
// NCP-S-04: Stream ID Conflict
// ===========================================================================

describe("NCP-S-04: Stream ID Conflict", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — New stream MUST NOT reuse an active stream_id.
  // test_cases.md: spec does not define a dedicated code; implementations
  // SHOULD use NPS-CLIENT-CONFLICT until one is assigned.
  // -----------------------------------------------------------------------
  it("rejects reuse of completed stream_id with NPS-CLIENT-CONFLICT", () => {
    const mgr = new StreamManager();
    mgr.receive(chunk("s1", 0, ["A"], { is_last: true }));

    // Try to reuse s1 — it's completed
    expect(() => mgr.receive(chunk("s1", 0, ["B"]))).toThrow(NcpError);
    try {
      mgr.receive(chunk("s1", 0, ["B"]));
    } catch (e) {
      expect((e as NcpError).code).toBe("NPS-CLIENT-CONFLICT");
    }
  });
});

// ===========================================================================
// NCP-S-05: Stream Flooding
// ===========================================================================

describe("NCP-S-05: Stream Flooding", () => {
  // -----------------------------------------------------------------------
  // Spec: §7.3 — Max concurrent streams (default 32)
  // -----------------------------------------------------------------------
  it("rejects opening more than max concurrent streams", () => {
    const mgr = new StreamManager({ maxConcurrent: 3 });

    mgr.receive(chunk("s1", 0, ["A"]));
    mgr.receive(chunk("s2", 0, ["B"]));
    mgr.receive(chunk("s3", 0, ["C"]));

    // 4th stream exceeds limit
    expect(() => mgr.receive(chunk("s4", 0, ["D"]))).toThrow(NcpError);
    try {
      mgr.receive(chunk("s4", 0, ["D"]));
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-STREAM-LIMIT-EXCEEDED");
    }
  });
});

// ===========================================================================
// NCP-S-06: Early Termination
// ===========================================================================

describe("NCP-S-06: Early Termination", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — error_code terminates stream, is_last forced true
  // -----------------------------------------------------------------------
  it("terminates stream on error_code", () => {
    const mgr = new StreamManager();

    mgr.receive(chunk("s1", 0, ["A"]));
    mgr.receive(chunk("s1", 1, ["B"]));

    const done = mgr.receive(
      chunk("s1", 2, [], { error_code: "NCP-STREAM-SEQ-GAP" }),
    );
    expect(done).toBe(true);

    // Partial data available
    const data = mgr.getData("s1");
    expect(data).toEqual(["A", "B"]);

    // Error propagated
    expect(mgr.getError("s1")).toBe("NCP-STREAM-SEQ-GAP");
  });
});

// ===========================================================================
// NCP-S-12: Invalid stream_id format
// ===========================================================================

describe("NCP-S-12: Invalid stream_id format", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 stream_id MUST be UUID v4
  // -----------------------------------------------------------------------
  const validV4 = "550e8400-e29b-41d4-a716-446655440000";
  const invalidExamples = [
    "not-a-uuid",
    "550e8400-e29b-41d4-a716-44665544000", // one char short
    "550e8400-e29b-11d4-a716-446655440000", // v1, not v4
    "550e8400-e29b-41d4-c716-446655440000", // wrong variant nibble
    "", // empty
  ];

  it("accepts a valid UUID v4 stream_id", () => {
    expect(() =>
      validateStreamFrame({
        frame: "0x03",
        stream_id: validV4,
        seq: 0,
        is_last: false,
        data: [],
      }),
    ).not.toThrow();
  });

  it.each(invalidExamples)(
    "rejects stream_id=%s with NPS-CLIENT-BAD-FRAME",
    (bad) => {
      try {
        validateStreamFrame({
          frame: "0x03",
          stream_id: bad,
          seq: 0,
          is_last: false,
          data: [],
        });
        throw new Error("validateStreamFrame should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(NcpError);
        expect((e as NcpError).code).toBe("NPS-CLIENT-BAD-FRAME");
      }
    },
  );
});

// ===========================================================================
// NCP-S-13: Unknown stream_id
// ===========================================================================

describe("NCP-S-13: Unknown stream_id", () => {
  // -----------------------------------------------------------------------
  // Spec: §4.3 — a frame for a stream_id that was never opened (seq > 0
  // without a prior seq=0 opener) MUST be rejected with NCP-STREAM-NOT-FOUND.
  // -----------------------------------------------------------------------
  it("rejects seq>0 on a never-opened stream_id", () => {
    const mgr = new StreamManager();
    expect(() => mgr.receive(chunk("never-opened", 5, ["X"]))).toThrow(
      NcpError,
    );
    try {
      mgr.receive(chunk("never-opened", 7, ["Y"]));
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-STREAM-NOT-FOUND");
    }
  });

  it("accepts seq=0 on a previously-unseen stream_id (opener)", () => {
    const mgr = new StreamManager();
    expect(mgr.receive(chunk("new-stream", 0, ["first"]))).toBe(false);
  });
});
