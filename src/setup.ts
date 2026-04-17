// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Registry factory helpers — lives outside core/ to avoid circular imports.
 * Use createDefaultRegistry() for NCP-only, createFullRegistry() for all protocols.
 */

import { FrameRegistry } from "./core/registry.js";
import { registerNcpFrames } from "./ncp/registry.js";
import { registerNwpFrames } from "./nwp/registry.js";
import { registerNipFrames } from "./nip/registry.js";
import { registerNdpFrames } from "./ndp/registry.js";
import { registerNopFrames } from "./nop/registry.js";

/** NCP frames only (ANCHOR, DIFF, STREAM, CAPS, ERROR). */
export function createDefaultRegistry(): FrameRegistry {
  const r = new FrameRegistry();
  registerNcpFrames(r);
  return r;
}

/** All 5 protocols (NCP + NWP + NIP + NDP + NOP). */
export function createFullRegistry(): FrameRegistry {
  const r = new FrameRegistry();
  registerNcpFrames(r);
  registerNwpFrames(r);
  registerNipFrames(r);
  registerNdpFrames(r);
  registerNopFrames(r);
  return r;
}
