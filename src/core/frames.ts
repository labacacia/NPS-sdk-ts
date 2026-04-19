// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NPS wire-level frame primitives: FrameType, FrameFlags, EncodingTier, FrameHeader.
 */

import { NpsFrameError } from "./exceptions.js";

// ── FrameType ────────────────────────────────────────────────────────────────

/** Unified frame byte namespace for the full NPS suite (NPS-0 §9). */
export enum FrameType {
  // NCP  0x01–0x0F
  ANCHOR       = 0x01,
  DIFF         = 0x02,
  STREAM       = 0x03,
  CAPS         = 0x04,
  ALIGN        = 0x05, // deprecated — use AlignStream (0x43)
  HELLO        = 0x06,

  // NWP  0x10–0x1F
  QUERY        = 0x10,
  ACTION       = 0x11,

  // NIP  0x20–0x2F
  IDENT        = 0x20,
  TRUST        = 0x21,
  REVOKE       = 0x22,

  // NDP  0x30–0x3F
  ANNOUNCE     = 0x30,
  RESOLVE      = 0x31,
  GRAPH        = 0x32,

  // NOP  0x40–0x4F
  TASK         = 0x40,
  DELEGATE     = 0x41,
  SYNC         = 0x42,
  ALIGN_STREAM = 0x43,

  // Reserved / System  0xF0–0xFF
  ERROR        = 0xFE,
}

// ── EncodingTier ─────────────────────────────────────────────────────────────

/**
 * Wire encoding tier, stored in the lower 2 bits of the flags byte (NPS-1 §3.2).
 * 0x00 = Tier-1 JSON — human-readable; development / compatibility.
 * 0x01 = Tier-2 MsgPack — binary, ~60 % smaller; production default.
 */
export enum EncodingTier {
  JSON    = 0x00,
  MSGPACK = 0x01,
}

// ── FrameFlags ───────────────────────────────────────────────────────────────

/**
 * Flags byte in the NPS frame header (NPS-1 §3.2).
 * Bit layout (LSB = bit 0):
 *   Bits 0–1 (T0,T1) : Encoding tier
 *   Bit 2  (FINAL)   : Last chunk of a StreamFrame; non-stream frames MUST set this
 *   Bit 3  (ENC)     : Payload encrypted
 *   Bits 4–6 (RSV)   : Reserved — sender MUST write 0
 *   Bit 7  (EXT)     : Extended 8-byte header
 */
export const FrameFlags = {
  NONE:          0x00,
  TIER1_JSON:    0x00,
  TIER2_MSGPACK: 0x01,
  FINAL:         0x04,
  ENCRYPTED:     0x08,
  EXT:           0x80,
} as const;

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_HEADER_SIZE  = 4;
export const EXTENDED_HEADER_SIZE = 8;
export const DEFAULT_MAX_PAYLOAD  = 0xffff;        // 65 535 bytes
export const EXTENDED_MAX_PAYLOAD = 0xffffffff;    // 4 GiB - 1

// ── FrameHeader ──────────────────────────────────────────────────────────────

/**
 * NPS frame header, present at the start of every wire message (NPS-1 §3.1).
 *
 * Default (4 bytes, EXT=0):
 *   Byte 0   : FrameType
 *   Byte 1   : Flags
 *   Byte 2–3 : PayloadLength (big-endian uint16)
 *
 * Extended (8 bytes, EXT=1):
 *   Byte 0   : FrameType
 *   Byte 1   : Flags (bit 7 = 1)
 *   Byte 2–3 : Reserved (must be 0)
 *   Byte 4–7 : PayloadLength (big-endian uint32)
 */
export class FrameHeader {
  constructor(
    public readonly frameType: FrameType,
    public readonly flags: number,
    public readonly payloadLength: number,
  ) {}

  get isExtended(): boolean {
    return (this.flags & FrameFlags.EXT) !== 0;
  }

  get headerSize(): number {
    return this.isExtended ? EXTENDED_HEADER_SIZE : DEFAULT_HEADER_SIZE;
  }

  get encodingTier(): EncodingTier {
    return (this.flags & 0x03) as EncodingTier;
  }

  get isFinal(): boolean {
    return (this.flags & 0x04) !== 0;
  }

  get isEncrypted(): boolean {
    return (this.flags & 0x08) !== 0;
  }

  // ── Parsing ───────────────────────────────────────────────────────────────

  static parse(buf: Uint8Array): FrameHeader {
    if (buf.length < 2) {
      throw new NpsFrameError(
        `Buffer too small to read frame type and flags: need >= 2 bytes, got ${buf.length}.`,
      );
    }

    const flags = buf[1]!;
    const ext   = (flags & FrameFlags.EXT) !== 0;

    if (ext) {
      if (buf.length < EXTENDED_HEADER_SIZE) {
        throw new NpsFrameError(
          `Buffer too small for extended frame header: need ${EXTENDED_HEADER_SIZE} bytes, got ${buf.length}.`,
        );
      }
      const view = new DataView(buf.buffer, buf.byteOffset);
      const payloadLength = view.getUint32(4, false); // big-endian
      return new FrameHeader(buf[0]! as FrameType, flags, payloadLength);
    }

    if (buf.length < DEFAULT_HEADER_SIZE) {
      throw new NpsFrameError(
        `Buffer too small for frame header: need ${DEFAULT_HEADER_SIZE} bytes, got ${buf.length}.`,
      );
    }
    const view = new DataView(buf.buffer, buf.byteOffset);
    const payloadLength = view.getUint16(2, false); // big-endian
    return new FrameHeader(buf[0]! as FrameType, flags, payloadLength);
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  toBytes(): Uint8Array {
    if (this.isExtended) {
      const buf  = new Uint8Array(EXTENDED_HEADER_SIZE);
      const view = new DataView(buf.buffer);
      view.setUint8(0, this.frameType);
      view.setUint8(1, this.flags);
      view.setUint16(2, 0, false);             // reserved
      view.setUint32(4, this.payloadLength, false);
      return buf;
    }
    const buf  = new Uint8Array(DEFAULT_HEADER_SIZE);
    const view = new DataView(buf.buffer);
    view.setUint8(0, this.frameType);
    view.setUint8(1, this.flags);
    view.setUint16(2, this.payloadLength, false);
    return buf;
  }

  toString(): string {
    return `FrameHeader(frameType=0x${this.frameType.toString(16).padStart(2, "0")}, flags=0x${this.flags.toString(16).padStart(2, "0")}, payloadLength=${this.payloadLength})`;
  }
}
