// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";

export interface IdentMetadata {
  issuer:       string;
  issuedAt:     string;
  expiresAt?:   string;
  capabilities?: readonly string[];
  scopes?:       readonly string[];
}

export class IdentFrame implements NpsFrame {
  readonly frameType     = FrameType.IDENT;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly nid:       string,
    public readonly pubKey:    string,
    public readonly metadata:  IdentMetadata,
    public readonly signature: string,
  ) {}

  unsignedDict(): Record<string, unknown> {
    return {
      nid:      this.nid,
      pub_key:  this.pubKey,
      metadata: this.metadata,
    };
  }

  toDict(): Record<string, unknown> {
    return { ...this.unsignedDict(), signature: this.signature };
  }

  static fromDict(data: Record<string, unknown>): IdentFrame {
    return new IdentFrame(
      data["nid"]       as string,
      data["pub_key"]   as string,
      data["metadata"]  as IdentMetadata,
      data["signature"] as string,
    );
  }
}

export class TrustFrame implements NpsFrame {
  readonly frameType     = FrameType.TRUST;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly issuerNid:  string,
    public readonly subjectNid: string,
    public readonly scopes:     readonly string[],
    public readonly expiresAt:  string,
    public readonly signature:  string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      issuer_nid:  this.issuerNid,
      subject_nid: this.subjectNid,
      scopes:      this.scopes,
      expires_at:  this.expiresAt,
      signature:   this.signature,
    };
  }

  static fromDict(data: Record<string, unknown>): TrustFrame {
    return new TrustFrame(
      data["issuer_nid"]  as string,
      data["subject_nid"] as string,
      data["scopes"]      as string[],
      data["expires_at"]  as string,
      data["signature"]   as string,
    );
  }
}

export class RevokeFrame implements NpsFrame {
  readonly frameType     = FrameType.REVOKE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly nid:       string,
    public readonly reason?:   string,
    public readonly revokedAt?: string,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      nid:        this.nid,
      reason:     this.reason     ?? null,
      revoked_at: this.revokedAt  ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): RevokeFrame {
    return new RevokeFrame(
      data["nid"]        as string,
      (data["reason"]     as string | null) ?? undefined,
      (data["revoked_at"] as string | null) ?? undefined,
    );
  }
}
