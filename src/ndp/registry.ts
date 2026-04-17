// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { FrameRegistry } from "../core/registry.js";
import { FrameType } from "../core/frames.js";
import { AnnounceFrame, GraphFrame, ResolveFrame } from "./frames.js";

export function registerNdpFrames(registry: FrameRegistry): void {
  registry.register(FrameType.ANNOUNCE, AnnounceFrame);
  registry.register(FrameType.RESOLVE,  ResolveFrame);
  registry.register(FrameType.GRAPH,    GraphFrame);
}
