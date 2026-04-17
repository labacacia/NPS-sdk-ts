// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * NipIdentity — Ed25519 key management and signing for NPS NID identity.
 * Uses @noble/ed25519 for signing; node:crypto for key storage encryption.
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// noble/ed25519 requires sha512 to be set explicitly in Node environments
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

const KEY_FILE_VERSION = 1;
const PBKDF2_ITERS     = 600_000;
const SALT_BYTES       = 16;
const IV_BYTES         = 12;
const KEY_BYTES        = 32;

interface KeyFileEnvelope {
  version:    number;
  salt:       string; // hex
  iv:         string; // hex
  ciphertext: string; // hex
  pubKey:     string; // hex
}

export class NipIdentity {
  private constructor(
    private readonly _privKey: Uint8Array,
    public  readonly pubKey:   Uint8Array,
  ) {}

  // ── Factory ───────────────────────────────────────────────────────────────

  static generate(): NipIdentity {
    const priv = ed25519.utils.randomPrivateKey();
    const pub  = ed25519.getPublicKey(priv);
    return new NipIdentity(priv, pub);
  }

  static fromPrivateKey(privKey: Uint8Array): NipIdentity {
    const pub = ed25519.getPublicKey(privKey);
    return new NipIdentity(privKey, pub);
  }

  /** Load from an AES-256-GCM encrypted key file. */
  static load(path: string, passphrase: string): NipIdentity {
    const envelope = JSON.parse(readFileSync(path, "utf8")) as KeyFileEnvelope;
    const salt      = Buffer.from(envelope.salt,       "hex");
    const iv        = Buffer.from(envelope.iv,         "hex");
    const ct        = Buffer.from(envelope.ciphertext, "hex");

    const dk = pbkdf2Sync(passphrase, salt, PBKDF2_ITERS, KEY_BYTES, "sha256");
    const decipher = createDecipheriv("aes-256-gcm", dk, iv);
    // Last 16 bytes of ciphertext are the GCM auth tag
    const authTag = ct.slice(ct.length - 16);
    const body    = ct.slice(0, ct.length - 16);
    (decipher as ReturnType<typeof createDecipheriv> & { setAuthTag(tag: Buffer): void }).setAuthTag(authTag);
    const priv = Buffer.concat([decipher.update(body), decipher.final()]);
    return NipIdentity.fromPrivateKey(new Uint8Array(priv));
  }

  /** Save to an AES-256-GCM encrypted key file. */
  save(path: string, passphrase: string): void {
    const salt   = randomBytes(SALT_BYTES);
    const iv     = randomBytes(IV_BYTES);
    const dk     = pbkdf2Sync(passphrase, salt, PBKDF2_ITERS, KEY_BYTES, "sha256");
    const cipher = createCipheriv("aes-256-gcm", dk, iv);
    const body   = Buffer.concat([cipher.update(Buffer.from(this._privKey)), cipher.final()]);
    const tag    = (cipher as ReturnType<typeof createCipheriv> & { getAuthTag(): Buffer }).getAuthTag();

    const envelope: KeyFileEnvelope = {
      version:    KEY_FILE_VERSION,
      salt:       salt.toString("hex"),
      iv:         iv.toString("hex"),
      ciphertext: Buffer.concat([body, tag]).toString("hex"),
      pubKey:     Buffer.from(this.pubKey).toString("hex"),
    };
    writeFileSync(path, JSON.stringify(envelope, null, 2), "utf8");
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  /** Sign a dict payload. Returns `ed25519:<base64url>`. */
  sign(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const bytes     = new TextEncoder().encode(canonical);
    const sig       = ed25519.sign(bytes, this._privKey);
    return `ed25519:${Buffer.from(sig).toString("base64")}`;
  }

  /** Verify a signature string against a dict payload. */
  verify(payload: Record<string, unknown>, signature: string): boolean {
    if (!signature.startsWith("ed25519:")) return false;
    try {
      const canonical = JSON.stringify(payload, Object.keys(payload).sort());
      const bytes     = new TextEncoder().encode(canonical);
      const sigBytes  = Buffer.from(signature.slice("ed25519:".length), "base64");
      return ed25519.verify(sigBytes, bytes, this.pubKey);
    } catch {
      return false;
    }
  }

  /** Public key as `ed25519:<hex>` string. */
  get pubKeyString(): string {
    return `ed25519:${Buffer.from(this.pubKey).toString("hex")}`;
  }
}
