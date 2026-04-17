// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Frame Header — Binary parse/write for NPS wire format
// NPS-1 Neural Communication Protocol §3.1, §3.2

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Wire encoding tier (NPS-1 §3.2, flags bits 0-1). */
export enum EncodingTier {
  /** Tier-1: UTF-8 JSON — development & compatibility. */
  Json = 0x00,
  /** Tier-2: MessagePack binary — production (~60% compression). */
  MsgPack = 0x01,
  // 0x02 = Reserved
  // 0x03 = Reserved
}

/** Unified frame type namespace for the full NPS suite (NPS-0 §9). */
export enum FrameType {
  // NCP 0x01–0x0F
  Anchor = 0x01,
  Diff = 0x02,
  Stream = 0x03,
  Caps = 0x04,
  Align = 0x05, // deprecated — use AlignStream (0x43)
  Hello = 0x06,
  // NWP 0x10–0x1F
  Query = 0x10,
  Action = 0x11,
  Subscribe = 0x12,
  // NIP 0x20–0x2F
  Ident = 0x20,
  Trust = 0x21,
  Revoke = 0x22,
  // NDP 0x30–0x3F
  Announce = 0x30,
  Resolve = 0x31,
  Graph = 0x32,
  // NOP 0x40–0x4F
  Task = 0x40,
  Delegate = 0x41,
  Sync = 0x42,
  AlignStream = 0x43,
  // System 0xF0–0xFF
  Error = 0xfe,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default (compact) header size in bytes. */
export const DEFAULT_HEADER_SIZE = 4;

/** Extended header size in bytes (EXT=1). */
export const EXTENDED_HEADER_SIZE = 8;

/** Maximum payload in default mode (64 KiB − 1). */
export const DEFAULT_MAX_PAYLOAD = 0xffff;

/** Maximum payload in extended mode (4 GiB − 1). */
export const EXTENDED_MAX_PAYLOAD = 0xffffffff;

// Flag bit positions (NPS-1 §3.2)
const TIER_MASK = 0x03; // bits 0-1
const FINAL_BIT = 0x04; // bit 2
const ENC_BIT = 0x08; // bit 3
const RESERVED_MASK = 0x70; // bits 4-6
const EXT_BIT = 0x80; // bit 7

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** NCP protocol error with machine-readable error code. */
export class NcpError extends Error {
  // `code` accepts NcpErrorCode constants (preferred) as well as NPS status
  // strings that are not NCP-prefixed (e.g. "NPS-CLIENT-CONFLICT") for cases
  // where the spec delegates to NPS-level codes without assigning an NCP code.
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NcpError";
  }
}

// ---------------------------------------------------------------------------
// Parsed header
// ---------------------------------------------------------------------------

/** Parsed frame header. */
export interface FrameHeader {
  /** Raw frame type byte. */
  frameType: number;
  /** Raw flags byte. */
  flags: number;
  /** Payload length in bytes. */
  payloadLength: number;
  /** Encoding tier extracted from flags bits 0-1. */
  tier: EncodingTier;
  /** True when FINAL flag (bit 2) is set. */
  isFinal: boolean;
  /** True when ENC flag (bit 3) is set. */
  isEncrypted: boolean;
  /** True when EXT flag (bit 7) is set — 8-byte header. */
  isExtended: boolean;
  /** Header size in bytes (4 or 8). */
  headerSize: number;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse a frame header from the start of the buffer.
 * Reads 2 bytes first to determine EXT, then reads remaining bytes.
 *
 * @throws {NcpError} NCP-FRAME-FLAGS-INVALID if reserved bits 4-6 are non-zero.
 * @throws {NcpError} NCP-FRAME-PARSE-ERROR if buffer is too small.
 * @throws {NcpError} NCP-FRAME-PAYLOAD-TOO-LARGE if opts.max_frame_payload is set and exceeded.
 */
export function parseFrameHeader(
  buffer: Uint8Array,
  opts?: { max_frame_payload?: number },
): FrameHeader {
  if (buffer.length < 2) {
    throw new NcpError(
      "NCP-FRAME-PARSE-ERROR",
      `Buffer too small to read frame type and flags: need >= 2 bytes, got ${buffer.length}`,
    );
  }

  const frameType = buffer[0]!;
  const flags = buffer[1]!;

  // Validate reserved bits (NPS-1 §3.2: bits 4-6 MUST be 0)
  if ((flags & RESERVED_MASK) !== 0) {
    throw new NcpError(
      "NCP-FRAME-FLAGS-INVALID",
      "Reserved flag bits 4-6 must be zero",
    );
  }

  const isExtended = (flags & EXT_BIT) !== 0;

  if (isExtended) {
    if (buffer.length < EXTENDED_HEADER_SIZE) {
      throw new NcpError(
        "NCP-FRAME-PARSE-ERROR",
        `Buffer too small for extended header: need ${EXTENDED_HEADER_SIZE} bytes, got ${buffer.length}`,
      );
    }

    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const payloadLength = view.getUint32(2, false); // big-endian

    if (
      opts?.max_frame_payload !== undefined &&
      payloadLength > opts.max_frame_payload
    ) {
      throw new NcpError(
        "NCP-FRAME-PAYLOAD-TOO-LARGE",
        `Payload length ${payloadLength} exceeds max_frame_payload ${opts.max_frame_payload}`,
      );
    }

    return {
      frameType,
      flags,
      payloadLength,
      tier: (flags & TIER_MASK) as EncodingTier,
      isFinal: (flags & FINAL_BIT) !== 0,
      isEncrypted: (flags & ENC_BIT) !== 0,
      isExtended: true,
      headerSize: EXTENDED_HEADER_SIZE,
    };
  }

  // Default 4-byte header
  if (buffer.length < DEFAULT_HEADER_SIZE) {
    throw new NcpError(
      "NCP-FRAME-PARSE-ERROR",
      `Buffer too small for header: need ${DEFAULT_HEADER_SIZE} bytes, got ${buffer.length}`,
    );
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const payloadLength = view.getUint16(2, false); // big-endian

  if (
    opts?.max_frame_payload !== undefined &&
    payloadLength > opts.max_frame_payload
  ) {
    throw new NcpError(
      "NCP-FRAME-PAYLOAD-TOO-LARGE",
      `Payload length ${payloadLength} exceeds max_frame_payload ${opts.max_frame_payload}`,
    );
  }

  return {
    frameType,
    flags,
    payloadLength,
    tier: (flags & TIER_MASK) as EncodingTier,
    isFinal: (flags & FINAL_BIT) !== 0,
    isEncrypted: (flags & ENC_BIT) !== 0,
    isExtended: false,
    headerSize: DEFAULT_HEADER_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write a frame header into the buffer.
 * @returns Number of bytes written (4 or 8).
 * @throws {Error} if buffer is too small.
 */
export function writeFrameHeader(
  header: FrameHeader,
  buffer: Uint8Array,
): number {
  const size = header.isExtended ? EXTENDED_HEADER_SIZE : DEFAULT_HEADER_SIZE;
  if (buffer.length < size) {
    throw new Error(
      `Destination buffer must be at least ${size} bytes, got ${buffer.length}`,
    );
  }

  buffer[0] = header.frameType;
  buffer[1] = header.flags;

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  if (header.isExtended) {
    view.setUint32(2, header.payloadLength, false); // big-endian
    buffer[6] = 0; // reserved
    buffer[7] = 0; // reserved
  } else {
    view.setUint16(2, header.payloadLength, false); // big-endian
  }

  return size;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flags byte from individual options. */
export function buildFlags(options: {
  tier?: EncodingTier;
  final?: boolean;
  encrypted?: boolean;
  extended?: boolean;
}): number {
  let flags = (options.tier ?? EncodingTier.Json) & TIER_MASK;
  if (options.final) flags |= FINAL_BIT;
  if (options.encrypted) flags |= ENC_BIT;
  if (options.extended) flags |= EXT_BIT;
  return flags;
}
