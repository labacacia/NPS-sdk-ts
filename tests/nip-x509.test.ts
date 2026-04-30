// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

// TypeScript parallel of Java NipX509Tests / .NET NipX509Tests per NPS-RFC-0002 §4.
// Covers the 5 verification scenarios documented in the .NET reference.

import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as x509 from "@peculiar/x509";

import { AssuranceLevel } from "../src/nip/assurance-level.js";
import { V2_X509 } from "../src/nip/cert-format.js";
import * as ec from "../src/nip/error-codes.js";
import { IdentFrame } from "../src/nip/frames.js";
import { NipIdentVerifier } from "../src/nip/verifier.js";
import { issueLeaf, issueRoot } from "../src/nip/x509/builder.js";
import { generateDualKeyPair, randomHexSerial, type DualKeyPair } from "./_rfc0002-keys.js";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
x509.cryptoProvider.set(globalThis.crypto);

describe("NipX509 — RFC-0002 §4 verifier scenarios", () => {

  it("registerX509 round-trip — dual-trust verifier accepts", async () => {
    const caNid    = "urn:nps:ca:test";
    const agentNid = "urn:nps:agent:happy:1";

    const ca    = await generateDualKeyPair();
    const agent = await generateDualKeyPair();

    const root = await issueRoot({
      caNid, caKeys: ca.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });
    const leaf = await issueLeaf({
      subjectNid: agentNid, subjectPublicKey: agent.webCrypto.publicKey,
      caKeys: ca.webCrypto, issuerNid: caNid, role: "agent",
      assuranceLevel: AssuranceLevel.ATTESTED,
      notBefore: minutesAgo(1), notAfter: daysFromNow(30),
      serialNumber: "02",
    });

    const frame = await buildV2Frame(agentNid, agent.pubRaw, ca.privRaw,
      AssuranceLevel.ATTESTED, leaf, root);

    const verifier = new NipIdentVerifier({
      trustedCaPublicKeys: { [caNid]: pubKeyHex(ca.pubRaw) },
      trustedX509Roots:    [root],
    });
    const result = await verifier.verify(frame, caNid);

    expect(result.valid).toBe(true);
    expect(result.stepFailed).toBe(0);
  });

  it("leaf without EKU extension — verifier rejects with NIP-CERT-EKU-MISSING", async () => {
    const caNid    = "urn:nps:ca:test";
    const agentNid = "urn:nps:agent:eku-stripped:1";

    const ca    = await generateDualKeyPair();
    const agent = await generateDualKeyPair();

    const root = await issueRoot({
      caNid, caKeys: ca.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });
    const tampered = await buildLeafWithoutEku(
      agentNid, agent.webCrypto.publicKey, ca.webCrypto, caNid, "63");

    const frame = await buildV2Frame(agentNid, agent.pubRaw, ca.privRaw,
      null, tampered, root);

    const verifier = new NipIdentVerifier({
      trustedCaPublicKeys: { [caNid]: pubKeyHex(ca.pubRaw) },
      trustedX509Roots:    [root],
    });
    const result = await verifier.verify(frame, caNid);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ec.CERT_EKU_MISSING);
    expect(result.stepFailed).toBe(3);
  });

  it("leaf for different NID — verifier rejects with NIP-CERT-SUBJECT-NID-MISMATCH", async () => {
    const caNid    = "urn:nps:ca:test";
    const victimNid = "urn:nps:agent:victim:1";
    const forgedNid = "urn:nps:agent:attacker:9";

    const ca    = await generateDualKeyPair();
    const agent = await generateDualKeyPair();

    const root = await issueRoot({
      caNid, caKeys: ca.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });
    // Issue a leaf whose CN/SAN are the *forged* NID, but splice it into a
    // frame asserting the *victim* NID. The v1 Ed25519 sig still asserts victim.
    const forgedLeaf = await issueLeaf({
      subjectNid: forgedNid, subjectPublicKey: agent.webCrypto.publicKey,
      caKeys: ca.webCrypto, issuerNid: caNid, role: "agent",
      assuranceLevel: AssuranceLevel.ANONYMOUS,
      notBefore: minutesAgo(1), notAfter: daysFromNow(30),
      serialNumber: "4d",
    });

    const frame = await buildV2Frame(victimNid, agent.pubRaw, ca.privRaw,
      null, forgedLeaf, root);

    const verifier = new NipIdentVerifier({
      trustedCaPublicKeys: { [caNid]: pubKeyHex(ca.pubRaw) },
      trustedX509Roots:    [root],
    });
    const result = await verifier.verify(frame, caNid);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ec.CERT_SUBJECT_NID_MISMATCH);
    expect(result.stepFailed).toBe(3);
  });

  it("v1-only verifier ignores cert_chain and accepts v2 frames (Phase 1 backward compat)", async () => {
    const caNid    = "urn:nps:ca:test";
    const agentNid = "urn:nps:agent:v1-compat:1";

    const ca    = await generateDualKeyPair();
    const agent = await generateDualKeyPair();

    const root = await issueRoot({
      caNid, caKeys: ca.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });
    const leaf = await issueLeaf({
      subjectNid: agentNid, subjectPublicKey: agent.webCrypto.publicKey,
      caKeys: ca.webCrypto, issuerNid: caNid, role: "agent",
      assuranceLevel: AssuranceLevel.ANONYMOUS,
      notBefore: minutesAgo(1), notAfter: daysFromNow(30),
      serialNumber: "02",
    });

    const frame = await buildV2Frame(agentNid, agent.pubRaw, ca.privRaw,
      null, leaf, root);

    // Verifier WITHOUT trustedX509Roots — Step 3b is skipped entirely.
    const verifier = new NipIdentVerifier({
      trustedCaPublicKeys: { [caNid]: pubKeyHex(ca.pubRaw) },
    });
    const result = await verifier.verify(frame, caNid);

    expect(result.valid).toBe(true);
    expect(result.stepFailed).toBe(0);
  });

  it("v2 verifier with unrelated trust root rejects with NIP-CERT-FORMAT-INVALID", async () => {
    const caNid    = "urn:nps:ca:test";
    const agentNid = "urn:nps:agent:wrong-trust:1";

    const ca    = await generateDualKeyPair();
    const agent = await generateDualKeyPair();

    const root = await issueRoot({
      caNid, caKeys: ca.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });
    const leaf = await issueLeaf({
      subjectNid: agentNid, subjectPublicKey: agent.webCrypto.publicKey,
      caKeys: ca.webCrypto, issuerNid: caNid, role: "agent",
      assuranceLevel: AssuranceLevel.ANONYMOUS,
      notBefore: minutesAgo(1), notAfter: daysFromNow(30),
      serialNumber: "02",
    });

    const frame = await buildV2Frame(agentNid, agent.pubRaw, ca.privRaw,
      null, leaf, root);

    // Different unrelated CA root — chain won't anchor.
    const otherCa   = await generateDualKeyPair();
    const otherRoot = await issueRoot({
      caNid: "urn:nps:ca:other", caKeys: otherCa.webCrypto,
      notBefore: minutesAgo(1), notAfter: daysFromNow(365),
      serialNumber: "01",
    });

    const verifier = new NipIdentVerifier({
      trustedCaPublicKeys: { [caNid]: pubKeyHex(ca.pubRaw) },
      trustedX509Roots:    [otherRoot],
    });
    const result = await verifier.verify(frame, caNid);

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ec.CERT_FORMAT_INVALID);
    expect(result.stepFailed).toBe(3);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a v2 IdentFrame including a v1 Ed25519 CA signature over the canonical
 * unsigned dict (matches IdentFrame.unsignedDict + NipIdentVerifier signing path).
 */
async function buildV2Frame(
  subjectNid:  string,
  subjectPub:  Uint8Array,
  caPriv:      Uint8Array,
  level:       AssuranceLevel | null,
  leaf:        x509.X509Certificate,
  root:        x509.X509Certificate,
): Promise<IdentFrame> {
  const pubKeyStr = pubKeyHex(subjectPub);
  const metadata  = { issued_by: "test-ca" };

  const unsigned: Record<string, unknown> = {
    nid:      subjectNid,
    pub_key:  pubKeyStr,
    metadata,
  };
  if (level !== null) unsigned["assurance_level"] = level.wire;

  const canonical = JSON.stringify(unsigned, Object.keys(unsigned).sort());
  const sig       = ed25519.sign(new TextEncoder().encode(canonical), caPriv);
  const sigWire   = "ed25519:" + Buffer.from(sig).toString("base64");

  const chain = [
    b64uEncode(new Uint8Array(leaf.rawData)),
    b64uEncode(new Uint8Array(root.rawData)),
  ];

  return new IdentFrame(subjectNid, pubKeyStr, metadata, sigWire, {
    assuranceLevel: level,
    certFormat:     V2_X509,
    certChain:      chain,
  });
}

/** Issue a leaf cert with EKU extension deliberately omitted. */
async function buildLeafWithoutEku(
  subjectNid:  string,
  subjectPub:  CryptoKey,
  caKeys:      CryptoKeyPair,
  caNid:       string,
  serial:      string,
): Promise<x509.X509Certificate> {
  const escape = (v: string) => v.replace(/([",+;<>\\])/g, "\\$1");
  return x509.X509CertificateGenerator.create({
    serialNumber: serial,
    issuer:       `CN=${escape(caNid)}`,
    subject:      `CN=${escape(subjectNid)}`,
    notBefore:    minutesAgo(1),
    notAfter:     daysFromNow(30),
    publicKey:    subjectPub,
    signingAlgorithm: { name: "Ed25519" },
    signingKey:   caKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      // ★ Deliberately NO ExtendedKeyUsage extension.
      new x509.SubjectAlternativeNameExtension([{ type: "url", value: subjectNid }], false),
    ],
  });
}

function pubKeyHex(raw: Uint8Array): string {
  return "ed25519:" + Buffer.from(raw).toString("hex");
}

function b64uEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "")
    .replace(/\+/g, "-").replace(/\//g, "_");
}

function minutesAgo(n: number):    Date { return new Date(Date.now() - n * 60_000); }
function daysFromNow(n: number):   Date { return new Date(Date.now() + n * 24 * 3600_000); }

// Touch the type so TS doesn't tree-shake the import in declaration emit.
type _ = DualKeyPair;
