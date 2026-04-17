// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { FrameRegistry } from "../core/registry.js";
import { FrameType } from "../core/frames.js";
import { AlignStreamFrame, DelegateFrame, SyncFrame, TaskFrame } from "./frames.js";

export function registerNopFrames(registry: FrameRegistry): void {
  registry.register(FrameType.TASK,         TaskFrame);
  registry.register(FrameType.DELEGATE,     DelegateFrame);
  registry.register(FrameType.SYNC,         SyncFrame);
  registry.register(FrameType.ALIGN_STREAM, AlignStreamFrame);
}
