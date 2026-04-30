// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * Issues NPS X.509 NID certificates per NPS-RFC-0002 §4.
 *
 * Backed by @peculiar/x509 + Web Crypto Ed25519 (Node 22+).
 *
 * Two factory functions:
 * - {@link issueLeaf} — leaf cert with critical NPS EKU + SAN URI = NID + assurance-level extension.
 * - {@link issueRoot} — self-signed root for testing / private-CA use.
 */

import * as x509 from "@peculiar/x509";

import { AssuranceLevel } from "../assurance-level.js";
import { EKU_AGENT_IDENTITY, EKU_NODE_IDENTITY, NID_ASSURANCE_LEVEL } from "./oids.js";

// Initialize @peculiar/x509 cryptoProvider once on first import. Web Crypto
// (globalThis.crypto) supports Ed25519 in Node 18+.
x509.cryptoProvider.set(globalThis.crypto);

export type LeafRole = "agent" | "node";

export interface IssueLeafOptions {
  subjectNid:         string;
  subjectPublicKey:   CryptoKey;        // Ed25519 public key (Web Crypto)
  caKeys:             CryptoKeyPair;    // CA's keypair (we need privateKey to sign)
  issuerNid:          string;
  role:               LeafRole;
  assuranceLevel:     AssuranceLevel;
  notBefore:          Date;
  notAfter:           Date;
  serialNumber:       string;           // hex string, no "0x" prefix
}

export interface IssueRootOptions {
  caNid:              string;
  caKeys:             CryptoKeyPair;
  notBefore:          Date;
  notAfter:           Date;
  serialNumber:       string;
}

/** Issue a leaf NPS NID certificate (RFC-0002 §4.1). */
export async function issueLeaf(opts: IssueLeafOptions): Promise<x509.X509Certificate> {
  const ekuOid = opts.role === "node" ? EKU_NODE_IDENTITY : EKU_AGENT_IDENTITY;

  // ASN.1 ENUMERATED encoding of assurance level: tag=0x0A, len=0x01, value=<rank>.
  const assuranceDer = new Uint8Array([0x0A, 0x01, opts.assuranceLevel.rank]);

  return x509.X509CertificateGenerator.create({
    serialNumber: opts.serialNumber,
    issuer:       `CN=${escapeDn(opts.issuerNid)}`,
    subject:      `CN=${escapeDn(opts.subjectNid)}`,
    notBefore:    opts.notBefore,
    notAfter:     opts.notAfter,
    publicKey:    opts.subjectPublicKey,
    signingAlgorithm: { name: "Ed25519" },
    signingKey:   opts.caKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([ekuOid], true),
      new x509.SubjectAlternativeNameExtension([{ type: "url", value: opts.subjectNid }], false),
      new x509.Extension(NID_ASSURANCE_LEVEL, false, assuranceDer),
    ],
  });
}

/** Issue a self-signed CA root cert (testing / private CA). */
export async function issueRoot(opts: IssueRootOptions): Promise<x509.X509Certificate> {
  return x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: opts.serialNumber,
    name:         `CN=${escapeDn(opts.caNid)}`,
    notBefore:    opts.notBefore,
    notAfter:     opts.notAfter,
    signingAlgorithm: { name: "Ed25519" },
    keys:         opts.caKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
    ],
  });
}

function escapeDn(value: string): string {
  // Escape characters that have special meaning in RFC 4514 DN syntax.
  return value.replace(/([",+;<>\\])/g, "\\$1");
}
