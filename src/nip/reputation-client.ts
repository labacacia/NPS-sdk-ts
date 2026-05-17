// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * ReputationLogClient — NPS-RFC-0004 reputation log HTTP client, signing
 * helpers, and Merkle inclusion verification.
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";

// noble/ed25519 requires sha512 to be set explicitly in Node environments
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// ── Base64url helpers ────────────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(s: string): Uint8Array {
  // Re-pad to a multiple of 4
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return new Uint8Array(Buffer.from(padded + "=".repeat(pad), "base64"));
}

// ── Sorted-key canonical JSON ────────────────────────────────────────────────

/**
 * Returns a value where every object in the tree has its keys sorted
 * alphabetically (deeply). Arrays and primitives pass through unchanged.
 */
function sortedValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortedValue);
  const obj = v as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortedValue(obj[k]);
  }
  return sorted;
}

/** Canonical JSON with all object keys sorted recursively. */
function sortedJson(obj: unknown): string {
  return JSON.stringify(sortedValue(obj));
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ObservationWindow {
  start: string;
  end: string;
}

export const IncidentType = {
  Other:               "other",
  CertRevoked:         "cert-revoked",
  RateLimitViolation:  "rate-limit-violation",
  TosViolation:        "tos-violation",
  ScrapingPattern:     "scraping-pattern",
  PaymentDefault:      "payment-default",
  ContractDispute:     "contract-dispute",
  ImpersonationClaim:  "impersonation-claim",
  PositiveAttestation: "positive-attestation",
} as const;
export type IncidentType = typeof IncidentType[keyof typeof IncidentType];

export const Severity = {
  Info:     0,
  Minor:    1,
  Moderate: 2,
  Major:    3,
  Critical: 4,
} as const;
export type Severity = typeof Severity[keyof typeof Severity];

/** Maps wire severity strings to numeric values. Throws on unknown values. */
const SEVERITY_WIRE: Record<string, Severity> = {
  info:     Severity.Info,
  minor:    Severity.Minor,
  moderate: Severity.Moderate,
  major:    Severity.Major,
  critical: Severity.Critical,
};

/** Known incident wire strings for forward-compat mapping. */
const KNOWN_INCIDENTS = new Set<string>(Object.values(IncidentType).filter(v => v !== "other"));

export interface ReputationLogEntry {
  v:             number;
  log_id:        string;
  seq:           number;
  timestamp:     string;
  subject_nid:   string;
  incident:      string;        // wire string
  incidentRaw?:  string;        // set when incident is unknown (forward compat)
  severity:      string;        // wire string e.g. "major"
  window?:       ObservationWindow;
  observation?:  unknown;
  evidence_ref?: string;
  evidence_sha256?: string;
  issuer_nid:    string;
  signature:     string;
}

export interface SignedTreeHead {
  log_id:          string;
  tree_size:       number;
  timestamp:       string;
  sha256_root_hash: string;    // base64url
  signature:       string;    // "ed25519:<base64url>"
}

export interface InclusionProof {
  seq:        number;
  leaf_index: number;
  tree_size:  number;
  leaf_hash:  string;          // base64url
  audit_path: string[];        // base64url[]
}

// ── Signing helpers ──────────────────────────────────────────────────────────

/**
 * Build the canonical bytes to sign for a ReputationLogEntry.
 * The `signature` field is excluded; all remaining keys are sorted recursively.
 */
function entrySigningBytes(entry: ReputationLogEntry): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, ...rest } = entry;
  return new TextEncoder().encode(sortedJson(rest));
}

/**
 * Sign a ReputationLogEntry and return a new entry with `signature` set.
 * The private key must be a 32-byte raw Ed25519 private key.
 */
export function signEntry(privKey: Uint8Array, entry: ReputationLogEntry): ReputationLogEntry {
  const bytes = entrySigningBytes(entry);
  const sig   = ed25519.sign(bytes, privKey);
  return { ...entry, signature: `ed25519:${base64urlEncode(sig)}` };
}

/**
 * Verify the `signature` field of a ReputationLogEntry against the given
 * Ed25519 public key (32-byte raw).
 */
export function verifyEntry(pubKey: Uint8Array, entry: ReputationLogEntry): boolean {
  if (!entry.signature.startsWith("ed25519:")) return false;
  try {
    const sigBytes = base64urlDecode(entry.signature.slice("ed25519:".length));
    const bytes    = entrySigningBytes(entry);
    return ed25519.verify(sigBytes, bytes, pubKey);
  } catch {
    return false;
  }
}

// ── Severity / incident parsing ──────────────────────────────────────────────

/**
 * Parse a wire severity string.  Throws an Error for unknown values
 * (no forward-compat — callers must upgrade to handle new severity levels).
 */
export function parseSeverity(wire: string): Severity {
  const v = SEVERITY_WIRE[wire.toLowerCase()];
  if (v === undefined) throw new Error(`Unknown NPS severity value: "${wire}"`);
  return v;
}

/**
 * Parse a wire incident string.  Unknown values map to `IncidentType.Other`
 * (forward-compat); the original string is returned as `incidentRaw`.
 */
export function parseIncident(wire: string): { incident: IncidentType; incidentRaw?: string } {
  if (KNOWN_INCIDENTS.has(wire)) return { incident: wire as IncidentType };
  return { incident: IncidentType.Other, incidentRaw: wire };
}

// ── Merkle verification ──────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── HTTP client ──────────────────────────────────────────────────────────────

export class ReputationLogException extends Error {
  constructor(
    public readonly nipErrorCode: string,
    public readonly npsStatus:    string,
    message?: string,
  ) {
    super(message);
    this.name = "ReputationLogException";
  }
}

/** Throw a ReputationLogException for non-ok HTTP responses. */
async function ensureOk(resp: Response): Promise<void> {
  if (resp.ok) return;
  let nipCode  = "NIP-UNKNOWN";
  let npsStatus = String(resp.status);
  let message   = resp.statusText;
  try {
    const body = await resp.json() as { error?: string; status?: string; message?: string };
    if (body.error)   nipCode   = body.error;
    if (body.status)  npsStatus = body.status;
    if (body.message) message   = body.message;
  } catch { /* ignore parse failures */ }
  throw new ReputationLogException(nipCode, npsStatus, message);
}

export class ReputationLogClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash for consistent path construction
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * POST /v1/log/entries — submit a signed entry.
   * Returns the server-echoed entry with seq/timestamp/log_id filled in.
   */
  async submit(entry: ReputationLogEntry): Promise<ReputationLogEntry> {
    const resp = await fetch(`${this.baseUrl}/v1/log/entries`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(entry),
    });
    await ensureOk(resp);
    return resp.json() as Promise<ReputationLogEntry>;
  }

  /**
   * GET /v1/log/entries — query entries.
   * @param options.nid      Filter by subject NID.
   * @param options.sinceSeq Return only entries with seq > sinceSeq.
   */
  async query(options?: { nid?: string; sinceSeq?: number }): Promise<ReputationLogEntry[]> {
    const params = new URLSearchParams();
    if (options?.nid      !== undefined) params.set("nid",   options.nid);
    if (options?.sinceSeq !== undefined) params.set("since", String(options.sinceSeq));
    const qs   = params.size > 0 ? `?${params.toString()}` : "";
    const resp = await fetch(`${this.baseUrl}/v1/log/entries${qs}`);
    await ensureOk(resp);
    const body = await resp.json() as { entries: ReputationLogEntry[] };
    return body.entries;
  }

  /** GET /v1/log/sth — current SignedTreeHead. */
  async getSth(): Promise<SignedTreeHead> {
    const resp = await fetch(`${this.baseUrl}/v1/log/sth`);
    await ensureOk(resp);
    return resp.json() as Promise<SignedTreeHead>;
  }

  /** GET /v1/log/proof?seq=<seq> — InclusionProof for a log entry. */
  async getProof(seq: number): Promise<InclusionProof> {
    const resp = await fetch(`${this.baseUrl}/v1/log/proof?seq=${seq}`);
    await ensureOk(resp);
    return resp.json() as Promise<InclusionProof>;
  }

  /** GET /v1/log/gossip/sth — gossip SignedTreeHead. */
  async getGossipSth(): Promise<SignedTreeHead> {
    const resp = await fetch(`${this.baseUrl}/v1/log/gossip/sth`);
    await ensureOk(resp);
    return resp.json() as Promise<SignedTreeHead>;
  }

  /**
   * Verify that `entry` is included in the log at the position described by
   * `proof`, under the given `sth`.
   *
   * Merkle construction (RFC 9162):
   *   leaf_hash = SHA256(0x00 || utf8(canonical_all_sorted_json_of_entry))
   *   node_hash = SHA256(0x01 || left_bytes || right_bytes)
   */
  static verifyInclusion(
    proof: InclusionProof,
    sth:   SignedTreeHead,
    entry: ReputationLogEntry,
  ): boolean {
    // Leaf hash includes the signature field
    const leafBytes = new TextEncoder().encode(sortedJson(entry));
    const leafBuf   = new Uint8Array(1 + leafBytes.length);
    leafBuf[0] = 0x00;
    leafBuf.set(leafBytes, 1);
    const computedLeafHash = sha256(leafBuf);

    // Verify that the computed leaf hash matches the proof's leaf_hash
    const proofLeafHash = base64urlDecode(proof.leaf_hash);
    if (!bytesEqual(computedLeafHash, proofLeafHash)) return false;

    // RFC 9162 fold up the audit path
    let nodeHash = computedLeafHash;
    for (let i = 0; i < proof.audit_path.length; i++) {
      const sibling = base64urlDecode(proof.audit_path[i]);
      const buf = new Uint8Array(65);
      buf[0] = 0x01;
      if (((BigInt(proof.leaf_index) >> BigInt(i)) & 1n) === 0n) {
        buf.set(nodeHash, 1);
        buf.set(sibling, 33);
      } else {
        buf.set(sibling, 1);
        buf.set(nodeHash, 33);
      }
      nodeHash = sha256(buf);
    }

    return bytesEqual(nodeHash, base64urlDecode(sth.sha256_root_hash));
  }
}
