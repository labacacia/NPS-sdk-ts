// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";
import { AssuranceLevel } from "./assurance-level.js";

export interface IdentMetadata {
  issuer:       string;
  issuedAt:     string;
  expiresAt?:   string;
  capabilities?: readonly string[];
  scopes?:       readonly string[];
}

export interface IdentFrameOptions {
  assuranceLevel?: AssuranceLevel | null;   // RFC-0003
  certFormat?:     string | null;            // RFC-0002 — null treated as "v1-proprietary"
  certChain?:      readonly string[] | null; // RFC-0002 — base64url(DER), [leaf, intermediates..., root]
}

export class IdentFrame implements NpsFrame {
  readonly frameType     = FrameType.IDENT;
  readonly preferredTier = EncodingTier.MSGPACK;

  readonly assuranceLevel: AssuranceLevel | null;
  readonly certFormat:     string | null;
  readonly certChain:      readonly string[] | null;

  constructor(
    public readonly nid:       string,
    public readonly pubKey:    string,
    public readonly metadata:  IdentMetadata,
    public readonly signature: string,
    options:                    IdentFrameOptions = {},
  ) {
    this.assuranceLevel = options.assuranceLevel ?? null;
    this.certFormat     = options.certFormat     ?? null;
    this.certChain      = options.certChain      ?? null;
  }

  unsignedDict(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      nid:      this.nid,
      pub_key:  this.pubKey,
      metadata: this.metadata,
    };
    if (this.assuranceLevel !== null) out["assurance_level"] = this.assuranceLevel.wire;
    // cert_format / cert_chain deliberately excluded from the signed payload —
    // the v1 Ed25519 signature covers only (nid, pub_key, metadata, [assurance_level]).
    return out;
  }

  toDict(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...this.unsignedDict(), signature: this.signature };
    if (this.certFormat !== null) out["cert_format"] = this.certFormat;
    if (this.certChain  !== null) out["cert_chain"]  = [...this.certChain];
    return out;
  }

  static fromDict(data: Record<string, unknown>): IdentFrame {
    const lvl = data["assurance_level"];
    const assuranceLevel = typeof lvl === "string" ? AssuranceLevel.fromWire(lvl) : null;
    const chainRaw = data["cert_chain"];
    const certChain = Array.isArray(chainRaw) ? (chainRaw as string[]) : null;
    return new IdentFrame(
      data["nid"]       as string,
      data["pub_key"]   as string,
      data["metadata"]  as IdentMetadata,
      data["signature"] as string,
      {
        assuranceLevel,
        certFormat: (data["cert_format"] as string | undefined) ?? null,
        certChain,
      },
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
