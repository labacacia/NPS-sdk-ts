// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// AnchorFrame (0x01) — Schema anchor for global reference
// NPS-1 §4.1

import { createHash } from "node:crypto";
// canonicalize ships CJS with TS `export default` — NodeNext resolves as namespace
import canonicalizeDefault from "canonicalize";
const canonicalize = canonicalizeDefault as unknown as (input: unknown) => string | undefined;
import { NcpError } from "../../core/frame-header.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const VALID_FIELD_TYPES = [
  "string", "uint64", "int64", "decimal", "bool",
  "timestamp", "bytes", "object", "array",
] as const;

export type SchemaFieldType = (typeof VALID_FIELD_TYPES)[number];

export interface SchemaField {
  name: string;
  type: string;
  semantic?: string;
  nullable?: boolean;
}

export interface FrameSchema {
  fields: SchemaField[];
}

export interface AnchorFrame {
  frame: string;
  anchor_id: string;
  schema: FrameSchema;
  ttl?: number;
}

// ---------------------------------------------------------------------------
// anchor_id computation (RFC 8785 JCS + SHA-256)
// ---------------------------------------------------------------------------

/**
 * Compute anchor_id from schema using RFC 8785 JCS canonicalization + SHA-256.
 * Format: "sha256:{64 lowercase hex chars}"
 */
export function computeAnchorId(schema: FrameSchema): string {
  const canonical = canonicalize(schema);
  if (!canonical) {
    throw new NcpError("NCP-ANCHOR-SCHEMA-INVALID", "Schema cannot be canonicalized");
  }
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `sha256:${hash}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an AnchorFrame.
 * @throws {NcpError} NCP-ANCHOR-SCHEMA-INVALID if anchor_id doesn't match or schema is invalid.
 */
export function validateAnchorFrame(frame: AnchorFrame): void {
  // Validate schema field types
  for (const field of frame.schema.fields) {
    if (!VALID_FIELD_TYPES.includes(field.type as SchemaFieldType)) {
      throw new NcpError(
        "NCP-ANCHOR-SCHEMA-INVALID",
        `Unsupported field type "${field.type}" for field "${field.name}". ` +
          `Valid types: ${VALID_FIELD_TYPES.join(", ")}`,
      );
    }
  }

  // Validate anchor_id matches computed hash
  const expected = computeAnchorId(frame.schema);
  if (frame.anchor_id !== expected) {
    throw new NcpError(
      "NCP-ANCHOR-SCHEMA-INVALID",
      `anchor_id mismatch: expected ${expected}, got ${frame.anchor_id}`,
    );
  }
}
