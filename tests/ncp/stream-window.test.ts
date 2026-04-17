// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Test Cases — StreamManager window-based flow control
// Covers: NCP-S-07 through NCP-S-11
// Source: test/ncp_test_cases.md §3.3

import { describe, it, expect } from "vitest";
import { NcpError } from "../../src/core/frame-header.js";
import { StreamManager } from "../../src/ncp/stream-manager.js";
import type { StreamFrame } from "../../src/ncp/frames/stream-frame.js";

function outgoing(
  streamId: string,
  seq: number,
  data: unknown[],
  opts?: { is_last?: boolean; window_size?: number },
): StreamFrame {
  return {
    frame: "0x03",
    stream_id: streamId,
    seq,
    is_last: opts?.is_last ?? false,
    data,
    window_size: opts?.window_size,
  };
}

// ===========================================================================
// NCP-S-07: Initial Window
// ===========================================================================

describe("NCP-S-07: Initial window_size on seq=0 initialises remainingWindow", () => {
  // -----------------------------------------------------------------------
  // Spec: §3.3 — window_size=5 on seq=0 sets remainingWindow=5; each send
  // decrements it by 1.
  // -----------------------------------------------------------------------
  it("initialises remainingWindow=5 and decrements on each send", () => {
    const mgr = new StreamManager();

    // Opening frame with window_size=5 — does not consume a window slot.
    mgr.send(outgoing("s1", 0, [], { window_size: 5 }));
    // After 0 sends: isPaused must be false; 5 sends should succeed.
    expect(mgr.isPaused("s1")).toBe(false);

    // Five sends should each succeed.
    mgr.send(outgoing("s1", 1, ["a"]));
    mgr.send(outgoing("s1", 2, ["b"]));
    mgr.send(outgoing("s1", 3, ["c"]));
    mgr.send(outgoing("s1", 4, ["d"]));
    mgr.send(outgoing("s1", 5, ["e"]));

    // Window now exhausted — next send must throw.
    expect(() => mgr.send(outgoing("s1", 6, ["f"]))).toThrowError(NcpError);
    try {
      mgr.send(outgoing("s1", 6, ["f"]));
    } catch (e) {
      expect((e as NcpError).code).toBe("NCP-STREAM-WINDOW-OVERFLOW");
    }
  });
});

// ===========================================================================
// NCP-S-08: No Flow Control
// ===========================================================================

describe("NCP-S-08: No window_size means unlimited sends", () => {
  // -----------------------------------------------------------------------
  // Spec: §3.3 — absence of window_size disables flow control entirely.
  // -----------------------------------------------------------------------
  it("allows unlimited sends when no window_size is set", () => {
    const mgr = new StreamManager();

    // Opening frame without window_size.
    mgr.send(outgoing("s1", 0, []));

    // Many sends must all succeed without any exception.
    for (let i = 1; i <= 100; i++) {
      expect(() => mgr.send(outgoing("s1", i, ["x"]))).not.toThrow();
    }
  });
});

// ===========================================================================
// NCP-S-09: Reverse Refill
// ===========================================================================

describe("NCP-S-09: updateWindow replaces remainingWindow with new_size", () => {
  // -----------------------------------------------------------------------
  // Spec: §3.3 — a reverse-direction frame (data=[], window_size=N) refills
  // the sender's window to exactly N.
  // -----------------------------------------------------------------------
  it("replaces exhausted window with new_size=10 and allows further sends", () => {
    const mgr = new StreamManager();

    mgr.send(outgoing("s1", 0, [], { window_size: 2 }));
    mgr.send(outgoing("s1", 1, ["a"]));
    mgr.send(outgoing("s1", 2, ["b"]));

    // Window exhausted.
    expect(() => mgr.send(outgoing("s1", 3, ["c"]))).toThrowError(NcpError);

    // Reverse refill: updateWindow with new_size=10.
    mgr.updateWindow("s1", 10);
    expect(mgr.isPaused("s1")).toBe(false);

    // Ten more sends should succeed.
    for (let i = 3; i <= 12; i++) {
      expect(() => mgr.send(outgoing("s1", i, ["x"]))).not.toThrow();
    }

    // 11th send after refill must throw again.
    expect(() => mgr.send(outgoing("s1", 13, ["y"]))).toThrowError(NcpError);
  });
});

// ===========================================================================
// NCP-S-10: Pause and Resume
// ===========================================================================

describe("NCP-S-10: window_size=0 sets pause state; non-zero refill resumes", () => {
  // -----------------------------------------------------------------------
  // Spec: §3.3 — receiver sends window_size=0 to pause the sender; a later
  // non-zero window_size resumes it.
  // -----------------------------------------------------------------------
  it("sets pause when updateWindow(0) and clears it on non-zero refill", () => {
    const mgr = new StreamManager();

    mgr.send(outgoing("s1", 0, [], { window_size: 5 }));
    expect(mgr.isPaused("s1")).toBe(false);

    // Receiver signals pause.
    mgr.updateWindow("s1", 0);
    expect(mgr.isPaused("s1")).toBe(true);

    // Receiver sends non-zero refill → resume.
    mgr.updateWindow("s1", 5);
    expect(mgr.isPaused("s1")).toBe(false);
  });
});

// ===========================================================================
// NCP-S-11: Overflow
// ===========================================================================

describe("NCP-S-11: send when remainingWindow=0 throws NCP-STREAM-WINDOW-OVERFLOW", () => {
  // -----------------------------------------------------------------------
  // Spec: §3.3 — sending while window is exhausted is a protocol violation.
  // -----------------------------------------------------------------------
  it("throws NcpError with code NCP-STREAM-WINDOW-OVERFLOW", () => {
    const mgr = new StreamManager();

    mgr.send(outgoing("s1", 0, [], { window_size: 1 }));
    mgr.send(outgoing("s1", 1, ["a"])); // consumes the only slot

    // Window is now 0 — next send must throw with the correct error code.
    let caught: unknown;
    try {
      mgr.send(outgoing("s1", 2, ["b"]));
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(NcpError);
    expect((caught as NcpError).code).toBe("NCP-STREAM-WINDOW-OVERFLOW");
  });
});
