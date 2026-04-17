// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// StreamManager — Concurrent stream tracking, sequence validation, flow control
// NPS-1 §4.3, §7.3

import { NcpError } from "../core/frame-header.js";
import { NCP_ERROR_CODES } from "./ncp-error-codes.js";
import type { StreamFrame } from "./frames/stream-frame.js";

interface ActiveStream {
  streamId: string;
  expectedSeq: number;
  chunks: unknown[][];
  completed: boolean;
  errorCode?: string;
}

interface OutgoingStream {
  streamId: string;
  remainingWindow: number | undefined; // undefined = no flow control
  paused: boolean;
}

/**
 * Manages concurrent StreamFrame streams.
 *
 * - Tracks active streams by stream_id
 * - Validates sequential seq numbers
 * - Enforces max concurrent stream limit (NPS-1 §7.3, default 32)
 * - Detects early termination via error_code
 * - Enforces window-based flow control on outgoing streams (NCP-S-07–11)
 */
export class StreamManager {
  private readonly streams = new Map<string, ActiveStream>();
  private readonly outgoing = new Map<string, OutgoingStream>();
  private readonly maxConcurrent: number;

  constructor(options?: { maxConcurrent?: number }) {
    this.maxConcurrent = options?.maxConcurrent ?? 32;
  }

  /**
   * Receive a StreamFrame chunk.
   *
   * @returns true if stream is complete (is_last=true or error_code set).
   * @throws {NcpError} NCP-STREAM-LIMIT-EXCEEDED if too many concurrent streams.
   * @throws {NcpError} NCP-STREAM-NOT-FOUND if frame.seq > 0 for a stream that was never opened.
   * @throws {NcpError} NPS-CLIENT-CONFLICT if the stream_id was already completed (stream-id reuse; see test_cases NCP-S-04).
   * @throws {NcpError} NCP-STREAM-SEQ-GAP if sequence number is not expected.
   */
  receive(frame: StreamFrame): boolean {
    let stream = this.streams.get(frame.stream_id);

    if (!stream) {
      // A stream is opened only by seq=0. Any other seq on an unknown stream_id
      // means the opener was never seen (NCP-S-13: unknown stream_id).
      if (frame.seq !== 0) {
        throw new NcpError(
          NCP_ERROR_CODES.NCP_STREAM_NOT_FOUND,
          `Unknown stream_id ${frame.stream_id} — first frame must have seq=0`,
        );
      }

      // New stream — check concurrent limit
      if (this.streams.size >= this.maxConcurrent) {
        throw new NcpError(
          NCP_ERROR_CODES.NCP_STREAM_LIMIT_EXCEEDED,
          `Max concurrent streams (${this.maxConcurrent}) exceeded`,
        );
      }

      stream = {
        streamId: frame.stream_id,
        expectedSeq: 0,
        chunks: [],
        completed: false,
      };
      this.streams.set(frame.stream_id, stream);
    }

    // Reject writes to completed streams. Per test_cases NCP-S-04, the spec does
    // not assign a dedicated NCP code for stream-id reuse; interim mapping uses
    // the NPS-level NPS-CLIENT-CONFLICT until a spec-side code is added.
    if (stream.completed) {
      throw new NcpError(
        "NPS-CLIENT-CONFLICT",
        `Stream ${frame.stream_id} is already completed — cannot reuse stream_id`,
      );
    }

    // Sequence validation
    if (frame.seq !== stream.expectedSeq) {
      // Duplicate detection — same seq as last accepted
      if (frame.seq < stream.expectedSeq) {
        // Ignore duplicate (idempotent)
        return false;
      }
      throw new NcpError(
        NCP_ERROR_CODES.NCP_STREAM_SEQ_GAP,
        `Expected seq ${stream.expectedSeq}, got ${frame.seq} on stream ${frame.stream_id}`,
      );
    }

    stream.chunks.push(frame.data);
    stream.expectedSeq = frame.seq + 1;

    // Early termination via error_code
    if (frame.error_code) {
      stream.completed = true;
      stream.errorCode = frame.error_code;
      return true;
    }

    // Normal completion
    if (frame.is_last) {
      stream.completed = true;
      return true;
    }

    return false;
  }

  /**
   * Send a StreamFrame on an outgoing stream, enforcing window-based flow control.
   *
   * - seq=0 with window_size initialises remainingWindow (no decrement for opening frame).
   * - Subsequent sends decrement remainingWindow when flow control is active.
   * - Throws NCP-STREAM-WINDOW-OVERFLOW when remainingWindow === 0.
   *
   * @throws {NcpError} NCP-STREAM-WINDOW-OVERFLOW if window is exhausted.
   */
  send(frame: StreamFrame): void {
    let out = this.outgoing.get(frame.stream_id);

    if (!out) {
      out = {
        streamId: frame.stream_id,
        remainingWindow: undefined,
        paused: false,
      };
      this.outgoing.set(frame.stream_id, out);
    }

    // Opening frame: initialise window from window_size if provided.
    if (frame.seq === 0 && frame.window_size !== undefined) {
      out.remainingWindow = frame.window_size;
      return; // opening frame does not consume a window slot
    }

    // Flow control check for subsequent frames.
    if (out.remainingWindow !== undefined) {
      if (out.remainingWindow === 0) {
        throw new NcpError(
          NCP_ERROR_CODES.NCP_STREAM_WINDOW_OVERFLOW,
          `Window exhausted on stream ${frame.stream_id}`,
        );
      }
      out.remainingWindow -= 1;
    }
  }

  /**
   * Update the send window for a stream.
   *
   * Called when a reverse-direction StreamFrame arrives with data=[] and window_size set.
   * Replaces remainingWindow with new_size. Sets paused=true when new_size === 0.
   */
  updateWindow(streamId: string, newSize: number): void {
    let out = this.outgoing.get(streamId);
    if (!out) {
      out = {
        streamId,
        remainingWindow: newSize,
        paused: newSize === 0,
      };
      this.outgoing.set(streamId, out);
      return;
    }
    out.remainingWindow = newSize;
    out.paused = newSize === 0;
  }

  /**
   * Returns true when the outgoing stream is paused (window=0 was received).
   * Resumes (returns false) once a non-zero window update arrives.
   */
  isPaused(streamId: string): boolean {
    return this.outgoing.get(streamId)?.paused ?? false;
  }

  /** Get reassembled data for a completed stream. */
  getData(streamId: string): unknown[] | null {
    const stream = this.streams.get(streamId);
    if (!stream || !stream.completed) return null;
    return stream.chunks.flat();
  }

  /** Get error code if stream terminated with error. */
  getError(streamId: string): string | undefined {
    return this.streams.get(streamId)?.errorCode;
  }

  /** Number of active (non-completed) streams. */
  get activeCount(): number {
    let count = 0;
    for (const s of this.streams.values()) {
      if (!s.completed) count++;
    }
    return count;
  }
}
