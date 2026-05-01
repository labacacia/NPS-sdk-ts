// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** NIP error code wire constants — mirror of `spec/error-codes.md` NIP section. */

// ── Cert verification (v1 + v2) ──────────────────────────────────────────────
export const CERT_EXPIRED            = "NIP-CERT-EXPIRED";
export const CERT_REVOKED            = "NIP-CERT-REVOKED";
export const CERT_SIGNATURE_INVALID  = "NIP-CERT-SIGNATURE-INVALID";
export const CERT_UNTRUSTED_ISSUER   = "NIP-CERT-UNTRUSTED-ISSUER";
export const CERT_CAPABILITY_MISSING = "NIP-CERT-CAPABILITY-MISSING";
export const CERT_SCOPE_VIOLATION    = "NIP-CERT-SCOPE-VIOLATION";

// ── CA service ───────────────────────────────────────────────────────────────
export const CA_NID_NOT_FOUND          = "NIP-CA-NID-NOT-FOUND";
export const CA_NID_ALREADY_EXISTS     = "NIP-CA-NID-ALREADY-EXISTS";
export const CA_SERIAL_DUPLICATE       = "NIP-CA-SERIAL-DUPLICATE";
export const CA_RENEWAL_TOO_EARLY      = "NIP-CA-RENEWAL-TOO-EARLY";
export const CA_SCOPE_EXPANSION_DENIED = "NIP-CA-SCOPE-EXPANSION-DENIED";

export const OCSP_UNAVAILABLE     = "NIP-OCSP-UNAVAILABLE";
export const TRUST_FRAME_INVALID  = "NIP-TRUST-FRAME-INVALID";

// ── RFC-0003 (assurance level) ───────────────────────────────────────────────
export const ASSURANCE_MISMATCH = "NIP-ASSURANCE-MISMATCH";
export const ASSURANCE_UNKNOWN  = "NIP-ASSURANCE-UNKNOWN";

// ── RFC-0004 (reputation log) ────────────────────────────────────────────────
export const REPUTATION_ENTRY_INVALID      = "NIP-REPUTATION-ENTRY-INVALID";
export const REPUTATION_LOG_UNREACHABLE    = "NIP-REPUTATION-LOG-UNREACHABLE";
export const REPUTATION_GOSSIP_FORK        = "NIP-REPUTATION-GOSSIP-FORK";
export const REPUTATION_GOSSIP_SIG_INVALID = "NIP-REPUTATION-GOSSIP-SIG-INVALID";

// ── RFC-0002 (X.509 + ACME) ──────────────────────────────────────────────────
export const CERT_FORMAT_INVALID       = "NIP-CERT-FORMAT-INVALID";
export const CERT_EKU_MISSING          = "NIP-CERT-EKU-MISSING";
export const CERT_SUBJECT_NID_MISMATCH = "NIP-CERT-SUBJECT-NID-MISMATCH";
export const ACME_CHALLENGE_FAILED     = "NIP-ACME-CHALLENGE-FAILED";
