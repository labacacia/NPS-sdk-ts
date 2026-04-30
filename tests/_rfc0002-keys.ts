// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

// Shared key-generation helper for RFC-0002 tests. Underscore prefix keeps
// vitest's `*.test.ts` discovery pattern from picking this up as a suite.

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// PKCS8 / SPKI prefixes for Ed25519 are fixed-length and well-defined
// (RFC 8410). Concatenating them with raw key bytes lets us shuttle a noble
// keypair through Web Crypto's importKey for use with @peculiar/x509.
const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);
const SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00,
]);

export interface DualKeyPair {
  privRaw:  Uint8Array;       // 32 bytes — for noble signing
  pubRaw:   Uint8Array;       // 32 bytes — for IdentFrame.pub_key + JWK
  webCrypto: CryptoKeyPair;   // for @peculiar/x509 signing / CSR generation
}

export async function generateDualKeyPair(): Promise<DualKeyPair> {
  const privRaw = ed25519.utils.randomPrivateKey();
  const pubRaw  = ed25519.getPublicKey(privRaw);

  const pkcs8 = concat(PKCS8_PREFIX, privRaw);
  const spki  = concat(SPKI_PREFIX,  pubRaw);

  const subtle = globalThis.crypto.subtle;
  const privateKey = await subtle.importKey(
    "pkcs8", pkcs8.buffer as ArrayBuffer, { name: "Ed25519" }, true, ["sign"]);
  const publicKey  = await subtle.importKey(
    "spki",  spki.buffer  as ArrayBuffer, { name: "Ed25519" }, true, ["verify"]);

  return { privRaw, pubRaw, webCrypto: { privateKey, publicKey } };
}

export function randomHexSerial(): string {
  const buf = new Uint8Array(20);
  globalThis.crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("hex");
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
