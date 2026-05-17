// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import {
  IncidentType,
  Severity,
  ReputationLogEntry,
  InclusionProof,
  SignedTreeHead,
  signEntry,
  verifyEntry,
  ReputationLogClient,
} from "../src/nip/reputation-client.js";

// noble/ed25519 requires sha512 to be set explicitly in Node environments
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// ── Merkle helper functions (mirror reputation-client.ts internals) ────────────

/** Recursively sort all object keys alphabetically (same algorithm as sortedValue in client). */
function sortedValueFull(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return (v as unknown[]).map(sortedValueFull);
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortedValueFull(obj[k]);
  }
  return sorted;
}

/** Canonical JSON with all keys sorted (including signature field). */
function sortedJsonFull(entry: ReputationLogEntry): string {
  return JSON.stringify(sortedValueFull(entry));
}

function leafHash(entry: ReputationLogEntry): Buffer {
  const canonical = sortedJsonFull(entry);
  const input = Buffer.concat([Buffer.from([0x00]), Buffer.from(canonical, "utf-8")]);
  return createHash("sha256").update(input).digest();
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([0x01]), left, right]))
    .digest();
}

function b64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Shared helper to build a signed entry ─────────────────────────────────────

async function makeSignedEntry(
  subjectNid = "urn:nps:agent:test:subject",
): Promise<ReputationLogEntry> {
  const privKey = ed25519.utils.randomPrivateKey();
  const unsigned: ReputationLogEntry = {
    v: 1,
    log_id: "urn:nps:org:log.test",
    seq: 1,
    timestamp: "2026-01-01T00:00:00Z",
    subject_nid: subjectNid,
    incident: "cert-revoked",
    severity: "info",
    issuer_nid: "urn:nps:org:issuer.test",
    signature: "",
  };
  return signEntry(privKey, unsigned);
}

// ── Part 1 — IncidentType constants ───────────────────────────────────────────

describe("IncidentType constants", () => {
  it("cert-revoked has the correct wire value", () => {
    expect(IncidentType.CertRevoked).toBe("cert-revoked");
  });

  it("rate-limit-violation has the correct wire value", () => {
    expect(IncidentType.RateLimitViolation).toBe("rate-limit-violation");
  });

  it("tos-violation has the correct wire value", () => {
    expect(IncidentType.TosViolation).toBe("tos-violation");
  });

  it("scraping-pattern has the correct wire value", () => {
    expect(IncidentType.ScrapingPattern).toBe("scraping-pattern");
  });

  it("payment-default has the correct wire value", () => {
    expect(IncidentType.PaymentDefault).toBe("payment-default");
  });

  it("contract-dispute has the correct wire value", () => {
    expect(IncidentType.ContractDispute).toBe("contract-dispute");
  });

  it("impersonation-claim has the correct wire value", () => {
    expect(IncidentType.ImpersonationClaim).toBe("impersonation-claim");
  });

  it("positive-attestation has the correct wire value", () => {
    expect(IncidentType.PositiveAttestation).toBe("positive-attestation");
  });

  it("all 8 known kebab-case wire strings are present", () => {
    const wires = Object.values(IncidentType).filter((v) => v !== "other");
    const expected = [
      "cert-revoked",
      "rate-limit-violation",
      "tos-violation",
      "scraping-pattern",
      "payment-default",
      "contract-dispute",
      "impersonation-claim",
      "positive-attestation",
    ];
    expect(wires.sort()).toEqual(expected.sort());
  });
});

// ── Part 2 — Severity constants ───────────────────────────────────────────────

describe("Severity constants", () => {
  it("Info is 0", () => {
    expect(Severity.Info).toBe(0);
  });

  it("Minor is 1", () => {
    expect(Severity.Minor).toBe(1);
  });

  it("Moderate is 2", () => {
    expect(Severity.Moderate).toBe(2);
  });

  it("Major is 3", () => {
    expect(Severity.Major).toBe(3);
  });

  it("Critical is 4", () => {
    expect(Severity.Critical).toBe(4);
  });

  it("values are strictly ordered Info < Minor < Moderate < Major < Critical", () => {
    expect(Severity.Info).toBeLessThan(Severity.Minor);
    expect(Severity.Minor).toBeLessThan(Severity.Moderate);
    expect(Severity.Moderate).toBeLessThan(Severity.Major);
    expect(Severity.Major).toBeLessThan(Severity.Critical);
  });
});

// ── Part 3 — ReputationLogEntry JSON round-trip ───────────────────────────────

describe("ReputationLogEntry JSON round-trip", () => {
  it("serializes to snake_case JSON with all required fields", () => {
    const entry: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 42,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:subject",
      incident: "tos-violation",
      severity: "major",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "ed25519:abc123",
    };
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed["v"]).toBe(1);
    expect(parsed["log_id"]).toBe("urn:nps:org:log.test");
    expect(parsed["seq"]).toBe(42);
    expect(parsed["timestamp"]).toBe("2026-01-01T00:00:00Z");
    expect(parsed["subject_nid"]).toBe("urn:nps:agent:test:subject");
    expect(parsed["incident"]).toBe("tos-violation");
    expect(parsed["severity"]).toBe("major");
    expect(parsed["issuer_nid"]).toBe("urn:nps:org:issuer.test");
    expect(parsed["signature"]).toBe("ed25519:abc123");
  });

  it("deserialized entry preserves all optional fields", () => {
    const entry: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 7,
      timestamp: "2026-06-01T12:00:00Z",
      subject_nid: "urn:nps:agent:test:sub",
      incident: "scraping-pattern",
      severity: "moderate",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "ed25519:xyz",
      evidence_ref: "https://example.com/evidence/1",
      evidence_sha256: "abc123deadbeef",
      window: { start: "2026-05-01T00:00:00Z", end: "2026-06-01T00:00:00Z" },
      observation: { request_count: 9999 },
    };
    const back = JSON.parse(JSON.stringify(entry)) as ReputationLogEntry;
    expect(back.evidence_ref).toBe("https://example.com/evidence/1");
    expect(back.evidence_sha256).toBe("abc123deadbeef");
    expect(back.window?.start).toBe("2026-05-01T00:00:00Z");
    expect(back.window?.end).toBe("2026-06-01T00:00:00Z");
    expect((back.observation as Record<string, unknown>)["request_count"]).toBe(9999);
  });

  it("null/undefined optional fields are omitted from JSON", () => {
    const entry: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 1,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:sub",
      incident: "cert-revoked",
      severity: "info",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "ed25519:sig",
      // optional fields intentionally absent
    };
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect("evidence_ref" in parsed).toBe(false);
    expect("evidence_sha256" in parsed).toBe(false);
    expect("window" in parsed).toBe(false);
    expect("observation" in parsed).toBe(false);
    expect("incidentRaw" in parsed).toBe(false);
  });
});

// ── Part 4 — signEntry / verifyEntry ─────────────────────────────────────────

describe("signEntry / verifyEntry", () => {
  it("sign → verifyEntry returns true with the correct public key", async () => {
    const privKey = ed25519.utils.randomPrivateKey();
    const pubKey = await ed25519.getPublicKeyAsync(privKey);

    const unsigned: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 1,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:subject",
      incident: "cert-revoked",
      severity: "info",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "",
    };
    const signed = signEntry(privKey, unsigned);
    expect(signed.signature).toMatch(/^ed25519:/);
    expect(verifyEntry(pubKey, signed)).toBe(true);
  });

  it("verifyEntry returns false when subject_nid is tampered", async () => {
    const privKey = ed25519.utils.randomPrivateKey();
    const pubKey = await ed25519.getPublicKeyAsync(privKey);

    const unsigned: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 1,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:original",
      incident: "cert-revoked",
      severity: "info",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "",
    };
    const signed = signEntry(privKey, unsigned);
    const tampered = { ...signed, subject_nid: "urn:nps:agent:test:attacker" };
    expect(verifyEntry(pubKey, tampered)).toBe(false);
  });

  it("verifyEntry returns false with a different (attacker) public key", async () => {
    const privKey = ed25519.utils.randomPrivateKey();
    const attackerPrivKey = ed25519.utils.randomPrivateKey();
    const attackerPubKey = await ed25519.getPublicKeyAsync(attackerPrivKey);

    const unsigned: ReputationLogEntry = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 1,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:subject",
      incident: "cert-revoked",
      severity: "info",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "",
    };
    const signed = signEntry(privKey, unsigned);
    expect(verifyEntry(attackerPubKey, signed)).toBe(false);
  });

  it("signEntry is canonical: same signature regardless of field insertion order", async () => {
    const privKey = ed25519.utils.randomPrivateKey();

    const baseFields = {
      v: 1,
      log_id: "urn:nps:org:log.test",
      seq: 1,
      timestamp: "2026-01-01T00:00:00Z",
      subject_nid: "urn:nps:agent:test:subject",
      incident: "cert-revoked",
      severity: "info",
      issuer_nid: "urn:nps:org:issuer.test",
      signature: "",
    };

    // Build two entry objects with different key insertion orders
    const entryABC: ReputationLogEntry = {
      v: baseFields.v,
      log_id: baseFields.log_id,
      seq: baseFields.seq,
      timestamp: baseFields.timestamp,
      subject_nid: baseFields.subject_nid,
      incident: baseFields.incident,
      severity: baseFields.severity,
      issuer_nid: baseFields.issuer_nid,
      signature: baseFields.signature,
    };

    const entryZYX: ReputationLogEntry = {
      signature: baseFields.signature,
      issuer_nid: baseFields.issuer_nid,
      severity: baseFields.severity,
      incident: baseFields.incident,
      subject_nid: baseFields.subject_nid,
      timestamp: baseFields.timestamp,
      seq: baseFields.seq,
      log_id: baseFields.log_id,
      v: baseFields.v,
    };

    const signedABC = signEntry(privKey, entryABC);
    const signedZYX = signEntry(privKey, entryZYX);
    expect(signedABC.signature).toBe(signedZYX.signature);
  });
});

// ── Part 5 — verifyInclusion (Merkle, Phase 2) ────────────────────────────────

describe("ReputationLogClient.verifyInclusion", () => {
  it("1-leaf tree verifies correctly", async () => {
    const entry = await makeSignedEntry();
    const lh = leafHash(entry);

    const proof: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 1,
      leaf_hash: b64url(lh),
      audit_path: [],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 1,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(lh),
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proof, sth, entry)).toBe(true);
  });

  it("2-leaf tree: leaf A verifies", async () => {
    const entryA = await makeSignedEntry("urn:nps:agent:test:a");
    const entryB = await makeSignedEntry("urn:nps:agent:test:b");
    const lhA = leafHash(entryA);
    const lhB = leafHash(entryB);
    const root = nodeHash(lhA, lhB);

    const proofA: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 2,
      leaf_hash: b64url(lhA),
      audit_path: [b64url(lhB)],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 2,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(root),
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proofA, sth, entryA)).toBe(true);
  });

  it("2-leaf tree: leaf B verifies", async () => {
    const entryA = await makeSignedEntry("urn:nps:agent:test:a");
    const entryB = await makeSignedEntry("urn:nps:agent:test:b");
    const lhA = leafHash(entryA);
    const lhB = leafHash(entryB);
    const root = nodeHash(lhA, lhB);

    const proofB: InclusionProof = {
      seq: 2,
      leaf_index: 1,
      tree_size: 2,
      leaf_hash: b64url(lhB),
      audit_path: [b64url(lhA)],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 2,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(root),
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proofB, sth, entryB)).toBe(true);
  });

  it("4-leaf tree: all 4 leaves verify", async () => {
    const entries = await Promise.all([
      makeSignedEntry("urn:nps:agent:test:0"),
      makeSignedEntry("urn:nps:agent:test:1"),
      makeSignedEntry("urn:nps:agent:test:2"),
      makeSignedEntry("urn:nps:agent:test:3"),
    ]);
    const lhs = entries.map(leafHash);

    // Build full 4-leaf binary tree:
    //       root
    //      /    \
    //    n01    n23
    //   /   \  /   \
    //  l0  l1 l2  l3
    const n01 = nodeHash(lhs[0], lhs[1]);
    const n23 = nodeHash(lhs[2], lhs[3]);
    const root = nodeHash(n01, n23);

    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 4,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(root),
      signature: "ed25519:placeholder",
    };

    // leaf 0: audit path = [lh1, n23]
    const proof0: InclusionProof = {
      seq: 1, leaf_index: 0, tree_size: 4,
      leaf_hash: b64url(lhs[0]),
      audit_path: [b64url(lhs[1]), b64url(n23)],
    };
    expect(ReputationLogClient.verifyInclusion(proof0, sth, entries[0])).toBe(true);

    // leaf 1: audit path = [lh0, n23]
    const proof1: InclusionProof = {
      seq: 2, leaf_index: 1, tree_size: 4,
      leaf_hash: b64url(lhs[1]),
      audit_path: [b64url(lhs[0]), b64url(n23)],
    };
    expect(ReputationLogClient.verifyInclusion(proof1, sth, entries[1])).toBe(true);

    // leaf 2: audit path = [lh3, n01]
    const proof2: InclusionProof = {
      seq: 3, leaf_index: 2, tree_size: 4,
      leaf_hash: b64url(lhs[2]),
      audit_path: [b64url(lhs[3]), b64url(n01)],
    };
    expect(ReputationLogClient.verifyInclusion(proof2, sth, entries[2])).toBe(true);

    // leaf 3: audit path = [lh2, n01]
    const proof3: InclusionProof = {
      seq: 4, leaf_index: 3, tree_size: 4,
      leaf_hash: b64url(lhs[3]),
      audit_path: [b64url(lhs[2]), b64url(n01)],
    };
    expect(ReputationLogClient.verifyInclusion(proof3, sth, entries[3])).toBe(true);
  });

  it("tampered entry returns false", async () => {
    const entry = await makeSignedEntry();
    const lh = leafHash(entry);

    const proof: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 1,
      leaf_hash: b64url(lh),
      audit_path: [],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 1,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(lh),
      signature: "ed25519:placeholder",
    };

    const tampered = { ...entry, subject_nid: "urn:nps:agent:test:attacker" };
    expect(ReputationLogClient.verifyInclusion(proof, sth, tampered)).toBe(false);
  });

  it("wrong root in STH returns false", async () => {
    const entry = await makeSignedEntry();
    const lh = leafHash(entry);
    const wrongRoot = createHash("sha256").update(Buffer.from("not-the-root")).digest();

    const proof: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 1,
      leaf_hash: b64url(lh),
      audit_path: [],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 1,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(wrongRoot),
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proof, sth, entry)).toBe(false);
  });

  it("wrong leaf_hash in proof returns false", async () => {
    const entry = await makeSignedEntry();
    const lh = leafHash(entry);
    const wrongLeafHash = createHash("sha256").update(Buffer.from("wrong-leaf")).digest();

    const proof: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 1,
      leaf_hash: b64url(wrongLeafHash),  // doesn't match computed hash
      audit_path: [],
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 1,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(lh),  // real root
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proof, sth, entry)).toBe(false);
  });

  it("corrupted audit_path element returns false", async () => {
    const entryA = await makeSignedEntry("urn:nps:agent:test:a");
    const entryB = await makeSignedEntry("urn:nps:agent:test:b");
    const lhA = leafHash(entryA);
    const lhB = leafHash(entryB);
    const root = nodeHash(lhA, lhB);

    const corruptedSibling = createHash("sha256").update(Buffer.from("corrupted")).digest();

    const proofA: InclusionProof = {
      seq: 1,
      leaf_index: 0,
      tree_size: 2,
      leaf_hash: b64url(lhA),
      audit_path: [b64url(corruptedSibling)],  // should be lhB
    };
    const sth: SignedTreeHead = {
      log_id: "urn:nps:org:log.test",
      tree_size: 2,
      timestamp: "2026-01-01T00:00:00Z",
      sha256_root_hash: b64url(root),
      signature: "ed25519:placeholder",
    };

    expect(ReputationLogClient.verifyInclusion(proofA, sth, entryA)).toBe(false);
  });
});
