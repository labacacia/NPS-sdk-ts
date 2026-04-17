// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Canonical JSON helpers — two distinct serialisation paths used in NPS.
//
// AnchorFrame uses JCS (RFC 8785) for anchor_id hashing → jcsStringify.
// NIP signing uses Python-compatible sorted-key JSON → sortKeysStringify.

import canonicalizeImport from "canonicalize";

// `canonicalize` is a CJS module whose default export resolves to a namespace
// under NodeNext. Cast once to the call signature its .d.ts promises.
const canonicalize = canonicalizeImport as unknown as (
  input: unknown,
) => string | undefined;

/**
 * JCS (RFC 8785) canonical JSON stringify.
 * Used for AnchorFrame anchor_id computation.
 */
export function jcsStringify(obj: unknown): string {
  const result = canonicalize(obj);
  if (result === undefined) {
    throw new Error("canonicalize returned undefined for input");
  }
  return result;
}

/**
 * Sorted-key JSON stringify — matches Python's
 * `json.dumps(obj, sort_keys=True, separators=(",",":"))`.
 * Used for NIP signing.
 */
export function sortKeysStringify(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
