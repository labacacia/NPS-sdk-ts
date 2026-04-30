// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** ACME wire constants (RFC 8555 + NPS-RFC-0002 §4.4). */

export const CONTENT_TYPE_JOSE_JSON = "application/jose+json";
export const CONTENT_TYPE_PROBLEM   = "application/problem+json";
export const CONTENT_TYPE_PEM_CERT  = "application/pem-certificate-chain";

export const CHALLENGE_AGENT_01  = "agent-01";
export const IDENTIFIER_TYPE_NID = "nid";

/** ACME status enumeration values (RFC 8555 §7.1.6). */
export const Status = {
  PENDING:     "pending",
  READY:       "ready",
  PROCESSING:  "processing",
  VALID:       "valid",
  INVALID:     "invalid",
  EXPIRED:     "expired",
  DEACTIVATED: "deactivated",
  REVOKED:     "revoked",
  SUBMITTED:   "submitted",
} as const;
