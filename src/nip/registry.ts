// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { FrameRegistry } from "../core/registry.js";
import { FrameType } from "../core/frames.js";
import { IdentFrame, TrustFrame, RevokeFrame } from "./frames.js";

export function registerNipFrames(registry: FrameRegistry): void {
  registry.register(FrameType.IDENT,  IdentFrame);
  registry.register(FrameType.TRUST,  TrustFrame);
  registry.register(FrameType.REVOKE, RevokeFrame);
}
