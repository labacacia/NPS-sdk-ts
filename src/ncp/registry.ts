// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { FrameRegistry } from "../core/registry.js";
import { FrameType } from "../core/frames.js";
import { AnchorFrame, CapsFrame, DiffFrame, ErrorFrame, HelloFrame, StreamFrame } from "./frames.js";

export function registerNcpFrames(registry: FrameRegistry): void {
  registry.register(FrameType.ANCHOR, AnchorFrame);
  registry.register(FrameType.DIFF,   DiffFrame);
  registry.register(FrameType.STREAM, StreamFrame);
  registry.register(FrameType.CAPS,   CapsFrame);
  registry.register(FrameType.HELLO,  HelloFrame);
  registry.register(FrameType.ERROR,  ErrorFrame);
}
