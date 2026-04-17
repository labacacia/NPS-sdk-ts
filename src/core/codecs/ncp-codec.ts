// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Codec — Top-level encode/decode dispatcher
// Routes to Tier-1 JSON or Tier-2 MsgPack based on frame header flags.

import {
  parseFrameHeader,
  writeFrameHeader,
  buildFlags,
  EncodingTier,
  NcpError,
  DEFAULT_MAX_PAYLOAD,
  type FrameHeader,
} from "../frame-header.js";
import { encodeJson, decodeJson } from "./tier1-json-codec.js";
import { encodeMsgPack, decodeMsgPack } from "./tier2-msgpack-codec.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecodeResult {
  /** Parsed frame header. */
  header: FrameHeader;
  /** Decoded payload object. */
  payload: unknown;
  /** Total bytes consumed (header + payload). */
  bytesConsumed: number;
}

export interface EncodeOptions {
  /** Frame type byte. */
  frameType: number;
  /** Encoding tier (default: JSON). */
  tier?: EncodingTier;
  /** Set FINAL flag. */
  final?: boolean;
  /** Set ENC flag. */
  encrypted?: boolean;
  /** Use extended header (for payloads > 64KB). */
  extended?: boolean;
}

export interface CodecOptions {
  /** Maximum frame payload in bytes (negotiated via CapsFrame). Default: 65535. */
  maxFramePayload?: number;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Decode a complete NCP frame from a buffer.
 *
 * @returns Decoded header + payload + bytes consumed.
 * @throws {NcpError} NCP-ENCODING-UNSUPPORTED for reserved tiers.
 * @throws {NcpError} NCP-FRAME-PAYLOAD-TOO-LARGE if payload exceeds max.
 * @throws {NcpError} NCP-FRAME-INCOMPLETE if buffer doesn't have enough data.
 */
export function decodeFrame(
  buffer: Uint8Array,
  options?: CodecOptions,
): DecodeResult {
  const header = parseFrameHeader(buffer);
  const maxPayload = options?.maxFramePayload ?? DEFAULT_MAX_PAYLOAD;

  // NCP-F-09: Validate against negotiated max_frame_payload
  if (header.payloadLength > maxPayload) {
    throw new NcpError(
      "NCP-FRAME-PAYLOAD-TOO-LARGE",
      `Payload ${header.payloadLength} exceeds max_frame_payload ${maxPayload}`,
    );
  }

  const totalSize = header.headerSize + header.payloadLength;

  // NCP-F-05: Buffer underrun — not enough data for payload
  if (buffer.length < totalSize) {
    throw new NcpError(
      "NCP-FRAME-INCOMPLETE",
      `Buffer has ${buffer.length} bytes but frame needs ${totalSize}`,
    );
  }

  // Extract payload bytes
  const payloadBytes = buffer.subarray(
    header.headerSize,
    header.headerSize + header.payloadLength,
  );

  // Route to codec by tier
  let payload: unknown;
  switch (header.tier) {
    case EncodingTier.Json:
      payload = decodeJson(payloadBytes);
      break;
    case EncodingTier.MsgPack:
      payload = decodeMsgPack(payloadBytes);
      break;
    default:
      // NCP-E-05: Reserved tiers (0x02, 0x03)
      throw new NcpError(
        "NCP-ENCODING-UNSUPPORTED",
        `Unsupported encoding tier: 0x${(header.tier as number).toString(16).padStart(2, "0")}`,
      );
  }

  return { header, payload, bytesConsumed: totalSize };
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Encode a payload into a complete NCP frame (header + payload bytes).
 */
export function encodeFrame(
  payload: unknown,
  options: EncodeOptions,
): Uint8Array {
  const tier = options.tier ?? EncodingTier.Json;

  // Encode payload
  let payloadBytes: Uint8Array;
  switch (tier) {
    case EncodingTier.Json:
      payloadBytes = encodeJson(payload);
      break;
    case EncodingTier.MsgPack:
      payloadBytes = encodeMsgPack(payload);
      break;
    default:
      throw new NcpError(
        "NCP-ENCODING-UNSUPPORTED",
        `Unsupported encoding tier for encode: ${tier}`,
      );
  }

  // Determine if extended header is needed
  const needsExtended =
    options.extended || payloadBytes.length > DEFAULT_MAX_PAYLOAD;

  const flags = buildFlags({
    tier,
    final: options.final,
    encrypted: options.encrypted,
    extended: needsExtended,
  });

  const header: FrameHeader = {
    frameType: options.frameType,
    flags,
    payloadLength: payloadBytes.length,
    tier,
    isFinal: options.final ?? false,
    isEncrypted: options.encrypted ?? false,
    isExtended: needsExtended,
    headerSize: needsExtended ? 8 : 4,
  };

  // Write frame
  const frame = new Uint8Array(header.headerSize + payloadBytes.length);
  writeFrameHeader(header, frame);
  frame.set(payloadBytes, header.headerSize);

  return frame;
}
