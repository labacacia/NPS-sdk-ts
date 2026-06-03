// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NOP Error Codes — all 20 protocol error codes per spec/error-codes.md

export const NOP_TASK_NOT_FOUND              = "NOP-TASK-NOT-FOUND" as const;
export const NOP_TASK_TIMEOUT                = "NOP-TASK-TIMEOUT" as const;
export const NOP_TASK_DAG_INVALID            = "NOP-TASK-DAG-INVALID" as const;
export const NOP_TASK_DAG_CYCLE              = "NOP-TASK-DAG-CYCLE" as const;
export const NOP_TASK_DAG_TOO_LARGE          = "NOP-TASK-DAG-TOO-LARGE" as const;
export const NOP_TASK_ALREADY_COMPLETED      = "NOP-TASK-ALREADY-COMPLETED" as const;
export const NOP_TASK_CANCELLED              = "NOP-TASK-CANCELLED" as const;
export const NOP_DELEGATE_SCOPE_VIOLATION    = "NOP-DELEGATE-SCOPE-VIOLATION" as const;
export const NOP_DELEGATE_REJECTED           = "NOP-DELEGATE-REJECTED" as const;
export const NOP_DELEGATE_CHAIN_TOO_DEEP     = "NOP-DELEGATE-CHAIN-TOO-DEEP" as const;
export const NOP_DELEGATE_TIMEOUT            = "NOP-DELEGATE-TIMEOUT" as const;
export const NOP_SYNC_TIMEOUT                = "NOP-SYNC-TIMEOUT" as const;
export const NOP_SYNC_DEPENDENCY_FAILED      = "NOP-SYNC-DEPENDENCY-FAILED" as const;
export const NOP_STREAM_SEQ_GAP              = "NOP-STREAM-SEQ-GAP" as const;
export const NOP_STREAM_NID_MISMATCH         = "NOP-STREAM-NID-MISMATCH" as const;
export const NOP_RESOURCE_INSUFFICIENT       = "NOP-RESOURCE-INSUFFICIENT" as const;
export const NOP_CONDITION_EVAL_ERROR        = "NOP-CONDITION-EVAL-ERROR" as const;
export const NOP_INPUT_MAPPING_ERROR         = "NOP-INPUT-MAPPING-ERROR" as const;
export const NOP_COMPENSATION_FAILED         = "NOP-COMPENSATION-FAILED" as const;
export const NOP_COMPENSATION_NOT_SUPPORTED  = "NOP-COMPENSATION-NOT-SUPPORTED" as const;

// ── Referenced in task description (extra codes) ──────────────────────────────
/** AlignStream NAK: sequence gap during alignment stream */
export const NOP_STREAM_NAK                  = "NOP-STREAM-NAK" as const;
/** Callback HMAC header missing on webhook delivery */
export const NOP_CALLBACK_HMAC_MISSING       = "NOP-CALLBACK-HMAC-MISSING" as const;
/** Task result requested after result_ttl_seconds elapsed (v0.7) */
export const NOP_TASK_RESULT_EXPIRED         = "NOP-TASK-RESULT-EXPIRED" as const;
/** NAK retransmission requested for a frame no longer in sender's buffer (v0.7) */
export const NOP_STREAM_NAK_UNRESOLVABLE     = "NOP-STREAM-NAK-UNRESOLVABLE" as const;

/** Maps each NOP error code to its NPS status code. */
export const NOP_ERROR_TO_NPS_STATUS: Record<string, string> = {
  "NOP-TASK-NOT-FOUND":             "NPS-CLIENT-NOT-FOUND",
  "NOP-TASK-TIMEOUT":               "NPS-SERVER-TIMEOUT",
  "NOP-TASK-DAG-INVALID":           "NPS-CLIENT-BAD-FRAME",
  "NOP-TASK-DAG-CYCLE":             "NPS-CLIENT-BAD-FRAME",
  "NOP-TASK-DAG-TOO-LARGE":         "NPS-CLIENT-BAD-FRAME",
  "NOP-TASK-ALREADY-COMPLETED":     "NPS-CLIENT-CONFLICT",
  "NOP-TASK-CANCELLED":             "NPS-CLIENT-CONFLICT",
  "NOP-DELEGATE-SCOPE-VIOLATION":   "NPS-AUTH-FORBIDDEN",
  "NOP-DELEGATE-REJECTED":          "NPS-CLIENT-UNPROCESSABLE",
  "NOP-DELEGATE-CHAIN-TOO-DEEP":    "NPS-CLIENT-BAD-PARAM",
  "NOP-DELEGATE-TIMEOUT":           "NPS-SERVER-TIMEOUT",
  "NOP-SYNC-TIMEOUT":               "NPS-SERVER-TIMEOUT",
  "NOP-SYNC-DEPENDENCY-FAILED":     "NPS-CLIENT-UNPROCESSABLE",
  "NOP-STREAM-SEQ-GAP":             "NPS-STREAM-SEQ-GAP",
  "NOP-STREAM-NID-MISMATCH":        "NPS-AUTH-UNAUTHENTICATED",
  "NOP-RESOURCE-INSUFFICIENT":      "NPS-SERVER-UNAVAILABLE",
  "NOP-CONDITION-EVAL-ERROR":       "NPS-CLIENT-BAD-PARAM",
  "NOP-INPUT-MAPPING-ERROR":        "NPS-CLIENT-UNPROCESSABLE",
  "NOP-COMPENSATION-FAILED":        "NPS-CLIENT-UNPROCESSABLE",
  "NOP-COMPENSATION-NOT-SUPPORTED": "NPS-CLIENT-UNPROCESSABLE",
  "NOP-STREAM-NAK":                 "NPS-STREAM-SEQ-GAP",
  "NOP-CALLBACK-HMAC-MISSING":      "NPS-AUTH-UNAUTHENTICATED",
  "NOP-TASK-RESULT-EXPIRED":        "NPS-CLIENT-NOT-FOUND",
  "NOP-STREAM-NAK-UNRESOLVABLE":    "NPS-STREAM-SEQ-GAP",
};
