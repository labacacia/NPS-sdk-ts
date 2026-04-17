// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Tier-1 JSON Codec — UTF-8 JSON encode/decode
// NPS-1 §8

import { NcpError } from "../frame-header.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a frame payload to Tier-1 JSON bytes.
 */
export function encodeJson(payload: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(payload));
}

/**
 * Decode Tier-1 JSON bytes to a parsed object.
 * @throws {NcpError} NPS-CLIENT-BAD-FRAME on malformed JSON.
 */
export function decodeJson(bytes: Uint8Array): unknown {
  const text = decoder.decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      "Malformed JSON payload",
    );
  }
}
