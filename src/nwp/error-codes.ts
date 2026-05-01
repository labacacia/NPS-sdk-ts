// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** NWP error code wire constants — mirror of `spec/error-codes.md` NWP section. */

// ── Auth ─────────────────────────────────────────────────────────────────────
export const AUTH_NID_SCOPE_VIOLATION    = "NWP-AUTH-NID-SCOPE-VIOLATION";
export const AUTH_NID_EXPIRED            = "NWP-AUTH-NID-EXPIRED";
export const AUTH_NID_REVOKED            = "NWP-AUTH-NID-REVOKED";
export const AUTH_NID_UNTRUSTED_ISSUER   = "NWP-AUTH-NID-UNTRUSTED-ISSUER";
export const AUTH_NID_CAPABILITY_MISSING = "NWP-AUTH-NID-CAPABILITY-MISSING";
export const AUTH_ASSURANCE_TOO_LOW      = "NWP-AUTH-ASSURANCE-TOO-LOW";
export const AUTH_REPUTATION_BLOCKED     = "NWP-AUTH-REPUTATION-BLOCKED";

// ── Query ─────────────────────────────────────────────────────────────────────
export const QUERY_FILTER_INVALID        = "NWP-QUERY-FILTER-INVALID";
export const QUERY_FIELD_UNKNOWN         = "NWP-QUERY-FIELD-UNKNOWN";
export const QUERY_CURSOR_INVALID        = "NWP-QUERY-CURSOR-INVALID";
export const QUERY_REGEX_UNSAFE          = "NWP-QUERY-REGEX-UNSAFE";
export const QUERY_VECTOR_UNSUPPORTED    = "NWP-QUERY-VECTOR-UNSUPPORTED";
export const QUERY_AGGREGATE_UNSUPPORTED = "NWP-QUERY-AGGREGATE-UNSUPPORTED";
export const QUERY_AGGREGATE_INVALID     = "NWP-QUERY-AGGREGATE-INVALID";
export const QUERY_STREAM_UNSUPPORTED    = "NWP-QUERY-STREAM-UNSUPPORTED";

// ── Action ────────────────────────────────────────────────────────────────────
export const ACTION_NOT_FOUND            = "NWP-ACTION-NOT-FOUND";
export const ACTION_PARAMS_INVALID       = "NWP-ACTION-PARAMS-INVALID";
export const ACTION_IDEMPOTENCY_CONFLICT = "NWP-ACTION-IDEMPOTENCY-CONFLICT";

// ── Task ──────────────────────────────────────────────────────────────────────
export const TASK_NOT_FOUND         = "NWP-TASK-NOT-FOUND";
export const TASK_ALREADY_CANCELLED = "NWP-TASK-ALREADY-CANCELLED";
export const TASK_ALREADY_COMPLETED = "NWP-TASK-ALREADY-COMPLETED";
export const TASK_ALREADY_FAILED    = "NWP-TASK-ALREADY-FAILED";

// ── Subscribe ─────────────────────────────────────────────────────────────────
export const SUBSCRIBE_STREAM_NOT_FOUND   = "NWP-SUBSCRIBE-STREAM-NOT-FOUND";
export const SUBSCRIBE_LIMIT_EXCEEDED     = "NWP-SUBSCRIBE-LIMIT-EXCEEDED";
export const SUBSCRIBE_FILTER_UNSUPPORTED = "NWP-SUBSCRIBE-FILTER-UNSUPPORTED";
export const SUBSCRIBE_INTERRUPTED        = "NWP-SUBSCRIBE-INTERRUPTED";
export const SUBSCRIBE_SEQ_TOO_OLD        = "NWP-SUBSCRIBE-SEQ-TOO-OLD";

// ── Infrastructure ────────────────────────────────────────────────────────────
export const BUDGET_EXCEEDED      = "NWP-BUDGET-EXCEEDED";
export const DEPTH_EXCEEDED       = "NWP-DEPTH-EXCEEDED";
export const GRAPH_CYCLE          = "NWP-GRAPH-CYCLE";
export const NODE_UNAVAILABLE     = "NWP-NODE-UNAVAILABLE";
export const RATE_LIMIT_EXCEEDED  = "NWP-RATE-LIMIT-EXCEEDED";

// ── Manifest ──────────────────────────────────────────────────────────────────
export const MANIFEST_VERSION_UNSUPPORTED = "NWP-MANIFEST-VERSION-UNSUPPORTED";
export const MANIFEST_NODE_TYPE_REMOVED   = "NWP-MANIFEST-NODE-TYPE-REMOVED";
export const MANIFEST_NODE_TYPE_UNKNOWN   = "NWP-MANIFEST-NODE-TYPE-UNKNOWN";

// ── Topology (alpha.4+) ───────────────────────────────────────────────────────
export const TOPOLOGY_UNAUTHORIZED       = "NWP-TOPOLOGY-UNAUTHORIZED";
export const TOPOLOGY_UNSUPPORTED_SCOPE  = "NWP-TOPOLOGY-UNSUPPORTED-SCOPE";
export const TOPOLOGY_DEPTH_UNSUPPORTED  = "NWP-TOPOLOGY-DEPTH-UNSUPPORTED";
export const TOPOLOGY_FILTER_UNSUPPORTED = "NWP-TOPOLOGY-FILTER-UNSUPPORTED";

// ── Reserved type (alpha.5+) ─────────────────────────────────────────────────
export const RESERVED_TYPE_UNSUPPORTED = "NWP-RESERVED-TYPE-UNSUPPORTED";
