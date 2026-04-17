// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { NpsFrameError } from "./exceptions.js";
import { FrameType } from "./frames.js";
import type { NpsFrame } from "./codec.js";

export interface FrameClass {
  fromDict(data: Record<string, unknown>): NpsFrame;
}

export class FrameRegistry {
  private readonly _map = new Map<FrameType, FrameClass>();

  register(frameType: FrameType, cls: FrameClass): void {
    this._map.set(frameType, cls);
  }

  resolve(frameType: FrameType): FrameClass {
    const cls = this._map.get(frameType);
    if (cls === undefined) {
      throw new NpsFrameError(
        `No frame class registered for type 0x${frameType.toString(16).padStart(2, "0")}.`,
      );
    }
    return cls;
  }
}
