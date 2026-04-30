// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/** Agent identity assurance level per NPS-RFC-0003 §5.1.1. */
export type AssuranceLevelWire = "anonymous" | "attested" | "verified";

export class AssuranceLevel {
  static readonly ANONYMOUS = new AssuranceLevel("anonymous", 0);
  static readonly ATTESTED  = new AssuranceLevel("attested",  1);
  static readonly VERIFIED  = new AssuranceLevel("verified",  2);

  private constructor(
    public readonly wire: AssuranceLevelWire,
    public readonly rank: number,
  ) {}

  meetsOrExceeds(required: AssuranceLevel): boolean {
    return this.rank >= required.rank;
  }

  static fromWire(wire: string | null | undefined): AssuranceLevel {
    if (wire == null) return AssuranceLevel.ANONYMOUS;
    for (const level of [AssuranceLevel.ANONYMOUS, AssuranceLevel.ATTESTED, AssuranceLevel.VERIFIED]) {
      if (level.wire === wire) return level;
    }
    throw new Error(`Unknown assurance_level: ${JSON.stringify(wire)}`);
  }

  static fromRank(rank: number): AssuranceLevel {
    for (const level of [AssuranceLevel.ANONYMOUS, AssuranceLevel.ATTESTED, AssuranceLevel.VERIFIED]) {
      if (level.rank === rank) return level;
    }
    throw new Error(`Unknown assurance_level rank: ${rank}`);
  }
}
