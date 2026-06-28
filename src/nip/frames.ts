// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { EncodingTier, FrameType } from "../core/frames.js";
import type { NpsFrame } from "../core/codec.js";
import { REVOKE_FRAME_INVALID } from "./error-codes.js";

const REASON_PARENT_REVOKED = "parent_revoked";

function validateRevokeParentRule(reason: string, parentNid?: string): void {
  if (reason === REASON_PARENT_REVOKED) {
    if (!parentNid) {
      throw new Error(`${REVOKE_FRAME_INVALID}: parent_nid is required when reason=parent_revoked`);
    }
  } else if (parentNid !== undefined) {
    throw new Error(`${REVOKE_FRAME_INVALID}: parent_nid must be omitted unless reason=parent_revoked`);
  }
}
import { AssuranceLevel } from "./assurance-level.js";

export interface IdentReputationPolicyHint {
  log_sources?: string[];
  consent?:     boolean;
}

export interface IdentMetadata {
  issuer:             string;
  issuedAt:           string;
  expiresAt?:         string;
  capabilities?:      readonly string[];
  scopes?:            readonly string[];
  reputation_policy?: IdentReputationPolicyHint;
}

export interface IdentFrameOptions {
  assuranceLevel?: AssuranceLevel | null;   // RFC-0003
  certFormat?:     string | null;            // RFC-0002 — null treated as "v1-proprietary"
  certChain?:      readonly string[] | null; // RFC-0002 — base64url(DER), [leaf, intermediates..., root]
  ocspStaple?:     string | null;            // alpha.11 — DER-encoded OCSP response, base64url
  nodeRoles?:      readonly string[] | null; // alpha.13 NIP v0.10 — self-declared node-role tags
}

export class IdentFrame implements NpsFrame {
  readonly frameType     = FrameType.IDENT;
  readonly preferredTier = EncodingTier.MSGPACK;

  readonly assuranceLevel: AssuranceLevel | null;
  readonly certFormat:     string | null;
  readonly certChain:      readonly string[] | null;
  readonly ocsp_staple:    string | null;
  readonly nodeRoles:      readonly string[] | null;

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
    this.ocsp_staple    = options.ocspStaple     ?? null;
    this.nodeRoles      = options.nodeRoles      ?? null;
  }

  unsignedDict(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      nid:      this.nid,
      pub_key:  this.pubKey,
      metadata: this.metadata,
    };
    if (this.assuranceLevel !== null) out["assurance_level"] = this.assuranceLevel.wire;
    // cert_format / cert_chain / ocsp_staple deliberately excluded from the signed payload —
    // the v1 Ed25519 signature covers only (nid, pub_key, metadata, [assurance_level]).
    return out;
  }

  toDict(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...this.unsignedDict(), signature: this.signature };
    if (this.certFormat  !== null) out["cert_format"]  = this.certFormat;
    if (this.certChain   !== null) out["cert_chain"]   = [...this.certChain];
    if (this.ocsp_staple !== null) out["ocsp_staple"]  = this.ocsp_staple;
    if (this.nodeRoles   !== null) out["node_roles"]   = [...this.nodeRoles!];
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
        certFormat:  (data["cert_format"] as string | undefined) ?? null,
        certChain,
        ocspStaple:  (data["ocsp_staple"] as string | undefined) ?? null,
        nodeRoles:   Array.isArray(data["node_roles"]) ? (data["node_roles"] as string[]) : null,
      },
    );
  }
}

export class TrustFrame implements NpsFrame {
  readonly frameType     = FrameType.TRUST;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly grantorNid:  string,
    public readonly granteeCa:   string,
    public readonly trustScope:  readonly string[],
    public readonly nodes:       readonly string[],
    public readonly issuedAt:    string,
    public readonly expiresAt:   string,
    public readonly serial:      string,
    public readonly signerNid:   string,
    public readonly signature:   string,
  ) {}

  unsignedDict(): Record<string, unknown> {
    return {
      frame:       "0x21",
      grantor_nid: this.grantorNid,
      grantee_ca:  this.granteeCa,
      trust_scope: this.trustScope,
      nodes:       this.nodes,
      issued_at:   this.issuedAt,
      expires_at:  this.expiresAt,
      serial:      this.serial,
      signer_nid:  this.signerNid,
    };
  }

  toDict(): Record<string, unknown> {
    return {
      ...this.unsignedDict(),
      signature:   this.signature,
    };
  }

  static fromDict(data: Record<string, unknown>): TrustFrame {
    return new TrustFrame(
      (data["grantor_nid"] ?? data["issuer_nid"]) as string,
      (data["grantee_ca"]  ?? data["subject_nid"]) as string,
      (data["trust_scope"] ?? data["scopes"] ?? []) as string[],
      (data["nodes"] ?? []) as string[],
      (data["issued_at"] ?? "") as string,
      data["expires_at"] as string,
      (data["serial"] ?? "") as string,
      (data["signer_nid"] ?? data["grantor_nid"] ?? data["issuer_nid"] ?? "") as string,
      data["signature"] as string,
    );
  }
}

export class RevokeFrame implements NpsFrame {
  readonly frameType     = FrameType.REVOKE;
  readonly preferredTier = EncodingTier.MSGPACK;

  constructor(
    public readonly targetNid:  string,
    public readonly reason:     string,
    public readonly revokedAt:  string,
    public readonly signerNid:  string,
    public readonly signature:  string,
    public readonly serial?:    string,
    public readonly parentNid?: string,
  ) {
    validateRevokeParentRule(reason, parentNid);
  }

  unsignedDict(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      frame:      "0x22",
      target_nid: this.targetNid,
      reason:     this.reason,
      revoked_at: this.revokedAt,
      signer_nid: this.signerNid,
    };
    if (this.serial !== undefined) out["serial"] = this.serial;
    if (this.parentNid !== undefined) out["parent_nid"] = this.parentNid;
    return out;
  }

  toDict(): Record<string, unknown> {
    return {
      ...this.unsignedDict(),
      signature: this.signature,
    };
  }

  static fromDict(data: Record<string, unknown>): RevokeFrame {
    return new RevokeFrame(
      (data["target_nid"] ?? data["nid"]) as string,
      data["reason"] as string,
      data["revoked_at"] as string,
      (data["signer_nid"] ?? "") as string,
      (data["signature"] ?? "") as string,
      (data["serial"] as string | undefined) ?? undefined,
      (data["parent_nid"] as string | undefined) ?? undefined,
    );
  }
}
