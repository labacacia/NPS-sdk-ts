// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// StreamFrame (0x03) — Streaming data chunks with flow control
// NPS-1 §4.3

import { NcpError } from "../../core/frame-header.js";

export interface StreamFrame {
  frame: string;
  stream_id: string;
  seq: number;
  is_last: boolean;
  anchor_ref?: string;
  data: unknown[];
  window_size?: number;
  error_code?: string;
}

// UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate stream_id is a valid UUID v4.
 * @throws {NcpError} NPS-CLIENT-BAD-FRAME if stream_id is not a valid UUID v4.
 */
export function validateStreamFrame(frame: StreamFrame): void {
  if (!UUID_V4_RE.test(frame.stream_id)) {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      `stream_id "${frame.stream_id}" is not a valid UUID v4`,
    );
  }
}
