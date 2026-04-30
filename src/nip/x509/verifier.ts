// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Verifies NPS X.509 NID certificate chains per NPS-RFC-0002 §4.
 *
 * Stages (RFC §4.6):
 * 1. Decode chain (base64url DER → @peculiar/x509 X509Certificate).
 * 2. Leaf EKU check — critical, contains agent-identity OR node-identity OID.
 * 3. Subject CN / SAN URI match against asserted NID.
 * 4. Assurance-level extension match against asserted level (if both present).
 * 5. Chain signature verification — leaf → intermediates → trusted root.
 */

import * as x509 from "@peculiar/x509";

import { AssuranceLevel } from "../assurance-level.js";
import * as ec from "../error-codes.js";
import {
  EKU_AGENT_IDENTITY,
  EKU_NODE_IDENTITY,
  NID_ASSURANCE_LEVEL,
  OID_EXTENDED_KEY_USAGE,
} from "./oids.js";

x509.cryptoProvider.set(globalThis.crypto);

export interface NipX509VerifyResult {
  valid:       boolean;
  errorCode?:  string;
  message?:    string;
  leaf?:       x509.X509Certificate;
}

function ok(leaf: x509.X509Certificate): NipX509VerifyResult {
  return { valid: true, leaf };
}

function fail(errorCode: string, message: string): NipX509VerifyResult {
  return { valid: false, errorCode, message };
}

export interface VerifyOptions {
  certChainBase64UrlDer:    readonly string[];
  assertedNid:              string;
  assertedAssuranceLevel:   AssuranceLevel | null;
  trustedRootCerts:         readonly x509.X509Certificate[];
}

export async function verify(opts: VerifyOptions): Promise<NipX509VerifyResult> {
  // Stage 1: decode chain ─────────────────────────────────────────────────
  if (!opts.certChainBase64UrlDer.length) {
    return fail(ec.CERT_FORMAT_INVALID, "cert_chain is empty");
  }
  let chain: x509.X509Certificate[];
  try {
    chain = opts.certChainBase64UrlDer.map((s) => new x509.X509Certificate(b64uDecode(s).buffer as ArrayBuffer));
  } catch (e) {
    return fail(ec.CERT_FORMAT_INVALID, `DER decode failed: ${(e as Error).message}`);
  }

  const leaf = chain[0];

  // Stage 2: EKU check ────────────────────────────────────────────────────
  const ekuResult = checkLeafEku(leaf);
  if (!ekuResult.valid) return ekuResult;

  // Stage 3: subject CN / SAN URI match ──────────────────────────────────
  const subjectResult = checkSubjectNid(leaf, opts.assertedNid);
  if (!subjectResult.valid) return subjectResult;

  // Stage 4: assurance-level extension ───────────────────────────────────
  const assuranceResult = checkAssuranceLevel(leaf, opts.assertedAssuranceLevel);
  if (!assuranceResult.valid) return assuranceResult;

  // Stage 5: chain signature verification ────────────────────────────────
  const chainResult = await checkChainSignature(chain, opts.trustedRootCerts);
  if (!chainResult.valid) return chainResult;

  return ok(leaf);
}

// ── Stage helpers ──────────────────────────────────────────────────────────

function checkLeafEku(leaf: x509.X509Certificate): NipX509VerifyResult {
  const ekuExt = leaf.extensions.find(
    (e) => e.type === OID_EXTENDED_KEY_USAGE,
  ) as x509.ExtendedKeyUsageExtension | undefined;
  if (!ekuExt) {
    return fail(ec.CERT_EKU_MISSING, "leaf has no ExtendedKeyUsage extension");
  }
  if (!ekuExt.critical) {
    return fail(ec.CERT_EKU_MISSING, "ExtendedKeyUsage extension is not marked critical");
  }
  const usages = ekuExt.usages as readonly string[];
  if (!usages.includes(EKU_AGENT_IDENTITY) && !usages.includes(EKU_NODE_IDENTITY)) {
    return fail(ec.CERT_EKU_MISSING,
      "ExtendedKeyUsage does not contain agent-identity or node-identity OID");
  }
  return ok(leaf);
}

function checkSubjectNid(leaf: x509.X509Certificate, assertedNid: string): NipX509VerifyResult {
  // @peculiar/x509 parses the subject DN; iterate to find CN.
  const cn = extractCn(leaf.subject);
  if (cn !== assertedNid) {
    return fail(ec.CERT_SUBJECT_NID_MISMATCH,
      `leaf subject CN (${cn ?? "<missing>"}) does not match asserted NID (${assertedNid})`);
  }

  const sanExt = leaf.getExtension(x509.SubjectAlternativeNameExtension);
  if (!sanExt) {
    return fail(ec.CERT_SUBJECT_NID_MISMATCH, "leaf has no Subject Alternative Name extension");
  }
  // SubjectAlternativeNameExtension exposes general-name objects with `type: "url"` for URIs.
  const uris = sanExt.names
    .toJSON()
    .filter((n: { type: string }) => n.type === "url")
    .map((n: { value: string }) => n.value);
  if (!uris.includes(assertedNid)) {
    return fail(ec.CERT_SUBJECT_NID_MISMATCH, "no SAN URI matches asserted NID");
  }
  return ok(leaf);
}

function checkAssuranceLevel(
  leaf: x509.X509Certificate, asserted: AssuranceLevel | null,
): NipX509VerifyResult {
  if (asserted === null) return ok(leaf);
  const ext = leaf.extensions.find((e) => e.type === NID_ASSURANCE_LEVEL);
  if (!ext) {
    // Optional in v0.1 — pass silently.
    return ok(leaf);
  }
  const der = new Uint8Array(ext.value);
  // Decode ASN.1 ENUMERATED: tag=0x0A, len=0x01, content=<rank>.
  if (der.length !== 3 || der[0] !== 0x0A || der[1] !== 0x01) {
    return fail(ec.CERT_FORMAT_INVALID,
      `malformed assurance-level extension: ${Buffer.from(der).toString("hex")}`);
  }
  const rank = der[2];
  let certLevel: AssuranceLevel;
  try {
    certLevel = AssuranceLevel.fromRank(rank);
  } catch {
    return fail(ec.ASSURANCE_UNKNOWN,
      `assurance-level extension contains unknown value: ${rank}`);
  }
  if (certLevel !== asserted) {
    return fail(ec.ASSURANCE_MISMATCH,
      `cert assurance-level (${certLevel.wire}) does not match asserted (${asserted.wire})`);
  }
  return ok(leaf);
}

async function checkChainSignature(
  chain: readonly x509.X509Certificate[],
  trustedRoots: readonly x509.X509Certificate[],
): Promise<NipX509VerifyResult> {
  if (!trustedRoots.length) {
    return fail(ec.CERT_FORMAT_INVALID, "no trusted X.509 roots configured");
  }
  try {
    // Walk leaf → intermediates: each must be signed by its successor.
    for (let i = 0; i < chain.length - 1; i++) {
      const okStep = await chain[i].verify({ publicKey: await chain[i + 1].publicKey.export(), signatureOnly: true });
      if (!okStep) {
        return fail(ec.CERT_FORMAT_INVALID, `chain link ${i} signature did not verify`);
      }
    }
    // The last cert in the chain MUST chain to a trusted root.
    const last = chain[chain.length - 1];
    for (const root of trustedRoots) {
      if (Buffer.from(last.rawData).equals(Buffer.from(root.rawData))) {
        return ok(chain[0]);
      }
      try {
        const okStep = await last.verify({ publicKey: await root.publicKey.export(), signatureOnly: true });
        if (okStep) return ok(chain[0]);
      } catch {
        /* try next root */
      }
    }
    return fail(ec.CERT_FORMAT_INVALID, "chain does not anchor to any trusted root");
  } catch (e) {
    return fail(ec.CERT_FORMAT_INVALID,
      `chain signature verification error: ${(e as Error).message}`);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function extractCn(dn: string): string | null {
  // @peculiar/x509 returns DN strings in RFC 4514 format ("CN=...,O=...").
  for (const rdn of dn.split(",")) {
    const trimmed = rdn.trim();
    if (trimmed.startsWith("CN=")) {
      let value = trimmed.slice(3);
      // Strip surrounding quotes if any.
      if (value.startsWith("\"") && value.endsWith("\"")) {
        value = value.slice(1, -1);
      }
      // Unescape.
      return value.replace(/\\([",+;<>\\])/g, "$1");
    }
  }
  return null;
}

function b64uDecode(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(std, "base64"));
}
