// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// NCP Frame Registry — Maps frame type bytes to protocol identifiers
// NPS-0 §9 Unified frame namespace

import { FrameType, NcpError } from "./frame-header.js";

// ---------------------------------------------------------------------------
// Protocol identifier for routing
// ---------------------------------------------------------------------------

export type Protocol = "ncp" | "nwp" | "nip" | "ndp" | "nop" | "system";

export interface FrameRegistryEntry {
  /** Frame type byte. */
  frameType: number;
  /** Human-readable name. */
  name: string;
  /** Protocol this frame belongs to. */
  protocol: Protocol;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Maps frame type bytes to metadata.
 * Built once at startup, then read-only.
 */
export class FrameRegistry {
  private readonly map: Map<number, FrameRegistryEntry>;

  constructor(entries: FrameRegistryEntry[]) {
    this.map = new Map(entries.map((e) => [e.frameType, e]));
  }

  /**
   * Resolve a frame type byte to its registry entry.
   * @throws {NcpError} NCP-FRAME-UNKNOWN-TYPE if not registered.
   */
  resolve(frameType: number): FrameRegistryEntry {
    const entry = this.map.get(frameType);
    if (!entry) {
      throw new NcpError(
        "NCP-FRAME-UNKNOWN-TYPE",
        `No entry registered for frame type 0x${frameType.toString(16).padStart(2, "0")}`,
      );
    }
    return entry;
  }

  /** Check if a frame type is registered. */
  has(frameType: number): boolean {
    return this.map.has(frameType);
  }

  /**
   * Create a registry pre-populated with all NCP core frames.
   * Upper-layer protocols can extend via the builder.
   */
  static createDefault(): FrameRegistry {
    return new FrameRegistryBuilder()
      .add(FrameType.Anchor, "AnchorFrame", "ncp")
      .add(FrameType.Diff, "DiffFrame", "ncp")
      .add(FrameType.Stream, "StreamFrame", "ncp")
      .add(FrameType.Caps, "CapsFrame", "ncp")
      .add(FrameType.Align, "AlignFrame", "ncp") // deprecated
      .add(FrameType.Hello, "HelloFrame", "ncp")
      .add(FrameType.Error, "ErrorFrame", "system")
      .build();
  }
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class FrameRegistryBuilder {
  private readonly entries: FrameRegistryEntry[] = [];

  add(frameType: number, name: string, protocol: Protocol): this {
    this.entries.push({ frameType, name, protocol });
    return this;
  }

  build(): FrameRegistry {
    return new FrameRegistry(this.entries);
  }
}
