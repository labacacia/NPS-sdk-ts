// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NipIdentVerifier — Phase 1 dual-trust IdentFrame verifier per NPS-RFC-0002 §8.1.
 *
 * Steps:
 *   1.  v1 Ed25519 signature check against the issuer's CA public key.
 *   2.  Optional minimum assurance level check.
 *   3b. X.509 chain validation (only if `cert_format === "v2-x509"` AND
 *       `trustedX509Roots` is configured).
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import type { X509Certificate } from "@peculiar/x509";

import { AssuranceLevel } from "./assurance-level.js";
import * as cf from "./cert-format.js";
import * as ec from "./error-codes.js";
import type { IdentFrame } from "./frames.js";
import { verify as verifyX509 } from "./x509/verifier.js";

// noble/ed25519 needs sha512 wired up.
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export interface NipVerifierOptions {
  /** Map of issuer NID → CA public key string (`ed25519:<hex>`). */
  trustedCaPublicKeys?: Readonly<Record<string, string>>;
  /** X.509 trust anchors. Empty/undefined makes Step 3b reject v2 frames. */
  trustedX509Roots?:    readonly X509Certificate[];
  /** Minimum required assurance level (NPS-RFC-0003). */
  minAssuranceLevel?:   AssuranceLevel;
}

export interface NipIdentVerifyResult {
  valid:      boolean;
  stepFailed: number;       // 0 = none, 1 = sig, 2 = assurance, 3 = X.509
  errorCode?: string;
  message?:   string;
}

function ok(): NipIdentVerifyResult { return { valid: true, stepFailed: 0 }; }

function fail(stepFailed: number, errorCode: string, message: string): NipIdentVerifyResult {
  return { valid: false, stepFailed, errorCode, message };
}

export class NipIdentVerifier {
  constructor(public readonly options: NipVerifierOptions) {}

  async verify(frame: IdentFrame, issuerNid: string): Promise<NipIdentVerifyResult> {
    // Step 1: v1 Ed25519 signature check ────────────────────────────────
    const caPubKeyStr = this.options.trustedCaPublicKeys?.[issuerNid];
    if (caPubKeyStr === undefined) {
      return fail(1, ec.CERT_UNTRUSTED_ISSUER,
        `no trusted CA public key for issuer: ${issuerNid}`);
    }
    if (!frame.signature?.startsWith("ed25519:")) {
      return fail(1, ec.CERT_SIGNATURE_INVALID, "missing or malformed signature");
    }
    try {
      const caPubBytes = parsePubKeyString(caPubKeyStr);
      const sigBytes   = Buffer.from(frame.signature.slice("ed25519:".length), "base64");
      const canonical  = canonicalJson(frame.unsignedDict());
      const msg        = new TextEncoder().encode(canonical);
      if (!ed25519.verify(sigBytes, msg, caPubBytes)) {
        return fail(1, ec.CERT_SIGNATURE_INVALID,
          "v1 Ed25519 signature did not verify against issuer CA key");
      }
    } catch (e) {
      return fail(1, ec.CERT_SIGNATURE_INVALID,
        `v1 signature verification error: ${(e as Error).message}`);
    }

    // Step 2: minimum assurance level ───────────────────────────────────
    const minLevel = this.options.minAssuranceLevel;
    if (minLevel !== undefined) {
      const got = frame.assuranceLevel ?? AssuranceLevel.ANONYMOUS;
      if (!got.meetsOrExceeds(minLevel)) {
        return fail(2, ec.ASSURANCE_MISMATCH,
          `assurance_level (${got.wire}) below required minimum (${minLevel.wire})`);
      }
    }

    // Step 3b: X.509 chain check (only if both opt-ins present) ──────────
    const trustedRoots = this.options.trustedX509Roots ?? [];
    const hasV2Trust = trustedRoots.length > 0;
    const isV2Frame  = frame.certFormat === cf.V2_X509;
    if (hasV2Trust && isV2Frame) {
      const x509Result = await verifyX509({
        certChainBase64UrlDer:  frame.certChain ?? [],
        assertedNid:            frame.nid,
        assertedAssuranceLevel: frame.assuranceLevel,
        trustedRootCerts:       trustedRoots,
      });
      if (!x509Result.valid) {
        return fail(3,
          x509Result.errorCode ?? ec.CERT_FORMAT_INVALID,
          x509Result.message   ?? "X.509 chain validation failed");
      }
    }

    return ok();
  }
}

/**
 * Canonical JSON matching NipIdentity.sign — top-level keys filtered/ordered
 * via `Object.keys(payload).sort()` as JSON.stringify replacer.
 */
function canonicalJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

/** Parse `ed25519:<hex>` into a 32-byte Uint8Array public key. */
function parsePubKeyString(s: string): Uint8Array {
  if (!s.startsWith("ed25519:")) {
    throw new Error(`Unsupported public key format: ${s}`);
  }
  return new Uint8Array(Buffer.from(s.slice("ed25519:".length), "hex"));
}
