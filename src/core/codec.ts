// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NPS frame codec: Tier-1 (JSON) and Tier-2 (MsgPack) encode/decode,
 * plus the top-level NpsFrameCodec dispatcher.
 */

import * as msgpack from "@msgpack/msgpack";
import { NpsCodecError } from "./exceptions.js";
import {
  DEFAULT_MAX_PAYLOAD,
  EncodingTier,
  FrameFlags,
  FrameHeader,
  FrameType,
} from "./frames.js";
import type { FrameRegistry } from "./registry.js";

// ── NpsFrame interface ────────────────────────────────────────────────────────

export interface NpsFrame {
  readonly frameType: FrameType;
  readonly preferredTier: EncodingTier;
  toDict(): Record<string, unknown>;
}

// ── Tier-1 JSON codec ─────────────────────────────────────────────────────────

export class Tier1JsonCodec {
  encode(frame: NpsFrame): Uint8Array {
    try {
      const json = JSON.stringify(frame.toDict());
      return new TextEncoder().encode(json);
    } catch (err) {
      throw new NpsCodecError(
        `Tier-1 JSON encode failed for 0x${frame.frameType.toString(16).padStart(2, "0")}: ${String(err)}`,
      );
    }
  }

  decode(frameType: FrameType, payload: Uint8Array, registry: FrameRegistry): NpsFrame {
    const cls = registry.resolve(frameType);
    try {
      const text = new TextDecoder().decode(payload);
      const data = JSON.parse(text) as Record<string, unknown>;
      return cls.fromDict(data);
    } catch (err) {
      throw new NpsCodecError(
        `Tier-1 JSON decode failed for 0x${frameType.toString(16).padStart(2, "0")}: ${String(err)}`,
      );
    }
  }
}

// ── Tier-2 MsgPack codec ──────────────────────────────────────────────────────

export class Tier2MsgPackCodec {
  encode(frame: NpsFrame): Uint8Array {
    try {
      return msgpack.encode(frame.toDict());
    } catch (err) {
      throw new NpsCodecError(
        `Tier-2 MsgPack encode failed for 0x${frame.frameType.toString(16).padStart(2, "0")}: ${String(err)}`,
      );
    }
  }

  decode(frameType: FrameType, payload: Uint8Array, registry: FrameRegistry): NpsFrame {
    const cls = registry.resolve(frameType);
    try {
      const data = msgpack.decode(payload) as Record<string, unknown>;
      return cls.fromDict(data);
    } catch (err) {
      throw new NpsCodecError(
        `Tier-2 MsgPack decode failed for 0x${frameType.toString(16).padStart(2, "0")}: ${String(err)}`,
      );
    }
  }
}

// ── NpsFrameCodec (dispatcher) ────────────────────────────────────────────────

export class NpsFrameCodec {
  private readonly _registry: FrameRegistry;
  private readonly _maxPayload: number;
  private readonly _json    = new Tier1JsonCodec();
  private readonly _msgpack = new Tier2MsgPackCodec();

  constructor(registry: FrameRegistry, options: { maxPayload?: number } = {}) {
    this._registry   = registry;
    this._maxPayload = options.maxPayload ?? DEFAULT_MAX_PAYLOAD;
  }

  // ── Encode ────────────────────────────────────────────────────────────────

  encode(frame: NpsFrame, options: { overrideTier?: EncodingTier } = {}): Uint8Array {
    const tier    = options.overrideTier ?? frame.preferredTier;
    const tierCodec = this._selectCodec(tier);

    let payload: Uint8Array;
    try {
      payload = tierCodec.encode(frame);
    } catch (err) {
      if (err instanceof NpsCodecError) throw err;
      throw new NpsCodecError(`Encode failed for 0x${frame.frameType.toString(16)}.`);
    }

    if (payload.length > this._maxPayload) {
      throw new NpsCodecError(
        `Encoded payload for 0x${frame.frameType.toString(16).padStart(2, "0")} exceeds max_frame_payload` +
        ` (${payload.length} bytes > ${this._maxPayload}). Use StreamFrame (0x03) for large payloads.`,
      );
    }

    const useExt = payload.length > DEFAULT_MAX_PAYLOAD;
    let flags    = this._buildFlags(frame, tier);
    if (useExt) flags |= FrameFlags.EXT;

    const header     = new FrameHeader(frame.frameType, flags, payload.length);
    const headerBytes = header.toBytes();
    const wire       = new Uint8Array(headerBytes.length + payload.length);
    wire.set(headerBytes, 0);
    wire.set(payload, headerBytes.length);
    return wire;
  }

  // ── Decode ────────────────────────────────────────────────────────────────

  decode(wire: Uint8Array): NpsFrame {
    const header  = FrameHeader.parse(wire);
    const payload = wire.slice(header.headerSize, header.headerSize + header.payloadLength);
    const codec   = this._selectCodec(header.encodingTier);
    return codec.decode(header.frameType, payload, this._registry);
  }

  static peekHeader(wire: Uint8Array): FrameHeader {
    return FrameHeader.parse(wire);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildFlags(frame: NpsFrame, tier: EncodingTier): number {
    let flags = tier === EncodingTier.JSON ? FrameFlags.TIER1_JSON : FrameFlags.TIER2_MSGPACK;

    const isStreamFrame = "isLast" in frame;
    const isFinal       = !isStreamFrame || (frame as { isLast: boolean }).isLast;
    if (isFinal) flags |= FrameFlags.FINAL;

    return flags;
  }

  private _selectCodec(tier: EncodingTier): Tier1JsonCodec | Tier2MsgPackCodec {
    if (tier === EncodingTier.JSON)    return this._json;
    if (tier === EncodingTier.MSGPACK) return this._msgpack;
    throw new NpsCodecError(`Unsupported encoding tier: 0x${(tier as number).toString(16).padStart(2, "0")}.`);
  }
}
