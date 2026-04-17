// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// ErrorFrame (0xFE) — Unified error frame for all NPS protocol layers
// NPS-1 §4.7

/** Unified error frame shared across all NPS protocol layers. */
export interface ErrorFrame {
  /** Fixed value "0xFE". */
  frame: string;
  /** NPS status code, e.g. "NPS-CLIENT-NOT-FOUND". */
  status: string;
  /** Protocol-level error code, e.g. "NCP-ANCHOR-NOT-FOUND". */
  error: string;
  /** Human-readable error description. */
  message?: string;
  /** Structured error details (e.g. anchor_ref, stream_id). */
  details?: Record<string, unknown>;
}

/** Type guard for ErrorFrame. */
export function isErrorFrame(obj: unknown): obj is ErrorFrame {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return o.frame === "0xFE" && typeof o.status === "string" && typeof o.error === "string";
}
