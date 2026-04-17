// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// Tier-2 MsgPack Codec — Binary encode/decode
// NPS-1 §8

import { encode, decode } from "@msgpack/msgpack";
import { NcpError } from "../frame-header.js";

/**
 * Encode a frame payload to Tier-2 MsgPack bytes.
 */
export function encodeMsgPack(payload: unknown): Uint8Array {
  return encode(payload);
}

/**
 * Decode Tier-2 MsgPack bytes to a parsed object.
 * @throws {NcpError} NPS-CLIENT-BAD-FRAME on malformed MsgPack.
 */
export function decodeMsgPack(bytes: Uint8Array): unknown {
  try {
    return decode(bytes) as unknown;
  } catch {
    throw new NcpError(
      "NPS-CLIENT-BAD-FRAME",
      "Malformed MsgPack payload",
    );
  }
}
