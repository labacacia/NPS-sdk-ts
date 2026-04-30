// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * JWS signing helpers for ACME with Ed25519 (`alg: "EdDSA"` per RFC 8037).
 *
 * Wire shape (RFC 8555 §6.2 + RFC 7515 flattened JWS JSON serialization):
 * {
 *   "protected": base64url(JSON({alg, nonce, url, [jwk|kid]})),
 *   "payload":   base64url(JSON(payload)),
 *   "signature": base64url(Ed25519(protected || "." || payload))
 * }
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha2";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export const ALG_EDDSA   = "EdDSA";   // RFC 8037 §3.1
export const KTY_OKP     = "OKP";     // RFC 8037 §2
export const CRV_ED25519 = "Ed25519"; // RFC 8037 §2

export interface Jwk {
  kty: string;
  crv: string;
  x:   string;
}

export interface ProtectedHeader {
  alg:    string;
  nonce:  string;
  url:    string;
  jwk?:   Jwk;
  kid?:   string;
}

export interface Envelope {
  protected: string;
  payload:   string;
  signature: string;
}

export function jwkFromPublicKey(rawPubKey: Uint8Array): Jwk {
  if (rawPubKey.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${rawPubKey.length}`);
  }
  return { kty: KTY_OKP, crv: CRV_ED25519, x: b64uEncode(rawPubKey) };
}

export function publicKeyFromJwk(jwk: Jwk): Uint8Array {
  if (jwk.kty !== KTY_OKP || jwk.crv !== CRV_ED25519) {
    throw new Error(`JWK is not OKP/Ed25519: kty=${jwk.kty} crv=${jwk.crv}`);
  }
  return b64uDecode(jwk.x);
}

/** RFC 7638 §3 thumbprint of an Ed25519 JWK (lex-sorted compact JSON, SHA-256, base64url). */
export function thumbprint(jwk: Jwk): string {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  return b64uEncode(sha256(new TextEncoder().encode(canonical)));
}

export function sign(
  header:   ProtectedHeader,
  payload:  unknown | null,
  privKey:  Uint8Array,
): Envelope {
  const headerBytes  = new TextEncoder().encode(JSON.stringify(header));
  const headerB64u   = b64uEncode(headerBytes);
  const payloadB64u  = payload === null
    ? ""
    : b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = new TextEncoder().encode(`${headerB64u}.${payloadB64u}`);
  const sig          = ed25519.sign(signingInput, privKey);
  return { protected: headerB64u, payload: payloadB64u, signature: b64uEncode(sig) };
}

/** Verify a JWS envelope. Returns the parsed protected header on success, else null. */
export function verify(envelope: Envelope, pubKey: Uint8Array): ProtectedHeader | null {
  try {
    const signingInput = new TextEncoder().encode(`${envelope.protected}.${envelope.payload}`);
    const sigBytes     = b64uDecode(envelope.signature);
    if (!ed25519.verify(sigBytes, signingInput, pubKey)) return null;
    const headerJson = new TextDecoder().decode(b64uDecode(envelope.protected));
    return JSON.parse(headerJson) as ProtectedHeader;
  } catch {
    return null;
  }
}

export function decodePayload<T = unknown>(envelope: Envelope): T | null {
  if (!envelope.payload) return null;
  return JSON.parse(new TextDecoder().decode(b64uDecode(envelope.payload))) as T;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function b64uEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "")
    .replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64uDecode(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(std, "base64"));
}
