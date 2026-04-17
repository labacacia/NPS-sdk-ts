// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 LabAcacia / INNO LOTUS PTY LTD
//
// CryptoProvider interface — async crypto abstraction for Node + browser.
// NPS-3 §10 / Q10 resolution in nps-ts-sdk-step7-plan.
//
// Implementations (NodeCryptoProvider, WebCryptoProvider) land at P3
// alongside NIP tests. This file is structural scaffold only.

/**
 * Async crypto operations used across NPS protocols.
 * All keys, IVs, and byte payloads are Uint8Array.
 */
export interface CryptoProvider {
  /** Generate cryptographically secure random bytes. */
  randomBytes(n: number): Uint8Array;

  /** Generate an Ed25519 keypair. */
  ed25519GenerateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }>;

  /** Sign data with an Ed25519 private key. Returns 64-byte signature. */
  ed25519Sign(privateKey: Uint8Array, data: Uint8Array): Promise<Uint8Array>;

  /** Verify an Ed25519 signature. */
  ed25519Verify(publicKey: Uint8Array, data: Uint8Array, sig: Uint8Array): Promise<boolean>;

  /**
   * AES-256-GCM encrypt.
   * Returns ciphertext || 16-byte tag (single contiguous buffer, matching
   * Web Crypto subtle.encrypt output and Python pycryptodome layout).
   */
  aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;

  /**
   * AES-256-GCM decrypt.
   * Input is ciphertext || 16-byte tag (same layout as aesGcmEncrypt output).
   */
  aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array>;

  /** PBKDF2-SHA256 key derivation. */
  pbkdf2Sha256(
    passphrase: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keyLen: number,
  ): Promise<Uint8Array>;
}
