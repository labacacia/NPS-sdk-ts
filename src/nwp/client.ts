// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NwpClient — async HTTP-mode client for NPS Neural Web Protocol nodes (NPS-2).
 */

import { NpsFrameCodec } from "../core/codec.js";
import { EncodingTier } from "../core/frames.js";
import { FrameRegistry } from "../core/registry.js";
import { registerNcpFrames } from "../ncp/registry.js";
import { CapsFrame } from "../ncp/frames.js";
import type { StreamFrame } from "../ncp/frames.js";
import { registerNwpFrames } from "./registry.js";
import { ActionFrame, asyncActionResponseFromDict } from "./frames.js";
import type { AnchorFrame } from "../ncp/frames.js";
import type { QueryFrame, AsyncActionResponse } from "./frames.js";

const CONTENT_TYPE = "application/x-nps-frame";

export class NwpClient {
  private readonly _baseUrl: string;
  private readonly _codec:   NpsFrameCodec;
  private readonly _tier:    EncodingTier;

  constructor(
    baseUrl: string,
    options: { defaultTier?: EncodingTier; maxPayload?: number; registry?: FrameRegistry } = {},
  ) {
    this._baseUrl = baseUrl.replace(/\/$/, "");
    this._tier    = options.defaultTier ?? EncodingTier.MSGPACK;

    const registry = options.registry ?? (() => {
      const r = new FrameRegistry();
      registerNcpFrames(r);
      registerNwpFrames(r);
      return r;
    })();
    const codecOpts = options.maxPayload !== undefined ? { maxPayload: options.maxPayload } : {};
    this._codec = new NpsFrameCodec(registry, codecOpts);
  }

  async sendAnchor(frame: AnchorFrame): Promise<void> {
    const wire = this._codec.encode(frame, { overrideTier: this._tier });
    const res  = await fetch(`${this._baseUrl}/anchor`, {
      method:  "POST",
      body:    wire,
      headers: { "Content-Type": CONTENT_TYPE, "Accept": CONTENT_TYPE },
    });
    if (!res.ok) throw new Error(`NWP /anchor failed: HTTP ${res.status}`);
  }

  async query(frame: QueryFrame): Promise<CapsFrame> {
    const wire = this._codec.encode(frame, { overrideTier: this._tier });
    const res  = await fetch(`${this._baseUrl}/query`, {
      method:  "POST",
      body:    wire,
      headers: { "Content-Type": CONTENT_TYPE, "Accept": CONTENT_TYPE },
    });
    if (!res.ok) throw new Error(`NWP /query failed: HTTP ${res.status}`);

    const buf    = new Uint8Array(await res.arrayBuffer());
    const result = this._codec.decode(buf);
    if (!(result instanceof CapsFrame)) {
      throw new TypeError(`Expected CapsFrame from /query, got ${result.constructor.name}.`);
    }
    return result;
  }

  async *stream(frame: QueryFrame): AsyncGenerator<StreamFrame> {
    const wire = this._codec.encode(frame, { overrideTier: this._tier });
    const res  = await fetch(`${this._baseUrl}/stream`, {
      method:  "POST",
      body:    wire,
      headers: { "Content-Type": CONTENT_TYPE, "Accept": CONTENT_TYPE },
    });
    if (!res.ok) throw new Error(`NWP /stream failed: HTTP ${res.status}`);
    if (res.body === null) return;

    const { StreamFrame: SF } = await import("../ncp/frames.js");

    for await (const chunk of res.body) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
      if (bytes.length === 0) continue;
      const result = this._codec.decode(bytes);
      if (!(result instanceof SF)) {
        throw new TypeError(`Expected StreamFrame from /stream, got ${result.constructor.name}.`);
      }
      yield result;
      if (result.isLast) break;
    }
  }

  async invoke(frame: ActionFrame): Promise<unknown> {
    const wire = this._codec.encode(frame, { overrideTier: this._tier });
    const res  = await fetch(`${this._baseUrl}/invoke`, {
      method:  "POST",
      body:    wire,
      headers: { "Content-Type": CONTENT_TYPE, "Accept": CONTENT_TYPE },
    });
    if (!res.ok) throw new Error(`NWP /invoke failed: HTTP ${res.status}`);

    if (frame.async_) {
      return asyncActionResponseFromDict(await res.json() as Record<string, unknown>) as AsyncActionResponse;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes(CONTENT_TYPE)) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return this._codec.decode(buf);
    }
    return res.json();
  }
}
