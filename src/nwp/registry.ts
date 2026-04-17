// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { FrameRegistry } from "../core/registry.js";
import { FrameType } from "../core/frames.js";
import { ActionFrame, QueryFrame } from "./frames.js";

export function registerNwpFrames(registry: FrameRegistry): void {
  registry.register(FrameType.QUERY,  QueryFrame);
  registry.register(FrameType.ACTION, ActionFrame);
}
