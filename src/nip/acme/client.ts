// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * ACME client implementing the `agent-01` challenge type per NPS-RFC-0002 §4.4.
 *
 * Flow: newNonce → newAccount → newOrder → fetch authz → sign challenge token →
 * finalize with CSR → fetch leaf cert.
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as x509 from "@peculiar/x509";

import * as Jws from "./jws.js";
import type {
  Authorization, Challenge, Directory, FinalizePayload,
  Identifier, NewAccountPayload, NewOrderPayload, Order,
} from "./messages.js";
import * as wire from "./wire.js";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
x509.cryptoProvider.set(globalThis.crypto);

export interface AcmeClientOptions {
  /** ACME directory URL. */
  directoryUrl: string;
  /** Account/agent Ed25519 private key (32-byte raw). */
  privateKey:   Uint8Array;
  /** Account/agent Ed25519 public key (32-byte raw). */
  publicKey:    Uint8Array;
  /** Web Crypto Ed25519 keypair for CSR signing (must match privateKey). */
  webCryptoKeys: CryptoKeyPair;
}

export class AcmeClient {
  private directory:  Directory | null = null;
  private accountUrl: string    | null = null;
  private lastNonce:  string    | null = null;

  constructor(public readonly options: AcmeClientOptions) {}

  /** Drive the full agent-01 flow for `nid`. Returns issued PEM cert chain. */
  async issueAgentCert(nid: string): Promise<string> {
    await this.ensureDirectory();
    if (this.accountUrl === null) await this.newAccount();
    const order = await this.newOrder(nid);
    const authz = await this.fetchAuthz(order.authorizations[0]);
    await this.respondAgent01(authz);
    const finalized = await this.finalizeOrder(order, nid);
    return this.downloadPem(finalized.certificate!);
  }

  // ── Stages ───────────────────────────────────────────────────────────────

  private async ensureDirectory(): Promise<void> {
    if (this.directory !== null) return;
    const resp = await fetch(this.options.directoryUrl);
    ensureSuccess(resp);
    this.directory = await resp.json() as Directory;
    await this.refreshNonce();
  }

  private async refreshNonce(): Promise<void> {
    const resp = await fetch(this.directory!.newNonce, { method: "HEAD" });
    ensureSuccess(resp);
    this.lastNonce = resp.headers.get("Replay-Nonce");
    if (this.lastNonce === null) {
      throw new Error("server omitted Replay-Nonce");
    }
  }

  private async newAccount(): Promise<void> {
    const jwk = Jws.jwkFromPublicKey(this.options.publicKey);
    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url: this.directory!.newAccount, jwk },
      { termsOfServiceAgreed: true } as NewAccountPayload,
      this.options.privateKey);

    const resp = await this.post(this.directory!.newAccount, env);
    ensureSuccess(resp);
    this.accountUrl = resp.headers.get("Location");
    if (this.accountUrl === null) throw new Error("server omitted account Location");
    this.captureNonce(resp);
  }

  private async newOrder(nid: string): Promise<Order> {
    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url: this.directory!.newOrder, kid: this.accountUrl! },
      {
        identifiers: [{ type: wire.IDENTIFIER_TYPE_NID, value: nid } as Identifier],
      } as NewOrderPayload,
      this.options.privateKey);

    const resp = await this.post(this.directory!.newOrder, env);
    ensureSuccess(resp);
    this.captureNonce(resp);
    return await resp.json() as Order;
  }

  private async fetchAuthz(url: string): Promise<Authorization> {
    // POST-as-GET (RFC 8555 §6.3).
    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url, kid: this.accountUrl! },
      null,
      this.options.privateKey);
    const resp = await this.post(url, env);
    ensureSuccess(resp);
    this.captureNonce(resp);
    return await resp.json() as Authorization;
  }

  private async respondAgent01(authz: Authorization): Promise<void> {
    const challenge = authz.challenges.find((c) => c.type === wire.CHALLENGE_AGENT_01);
    if (!challenge) throw new Error("authz has no agent-01 challenge");

    // Sign the challenge token with the account/NID private key.
    const tokenBytes = new TextEncoder().encode(challenge.token);
    const sig = ed25519.sign(tokenBytes, this.options.privateKey);

    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url: challenge.url, kid: this.accountUrl! },
      { agent_signature: Jws.b64uEncode(sig) },
      this.options.privateKey);
    const resp = await this.post(challenge.url, env);
    ensureSuccess(resp);
    this.captureNonce(resp);
  }

  private async finalizeOrder(order: Order, nid: string): Promise<Order> {
    const csrDer = await this.buildCsr(nid);
    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url: order.finalize, kid: this.accountUrl! },
      { csr: Jws.b64uEncode(csrDer) } as FinalizePayload,
      this.options.privateKey);
    const resp = await this.post(order.finalize, env);
    ensureSuccess(resp);
    this.captureNonce(resp);
    return await resp.json() as Order;
  }

  private async downloadPem(certUrl: string): Promise<string> {
    const env = Jws.sign(
      { alg: Jws.ALG_EDDSA, nonce: this.lastNonce!, url: certUrl, kid: this.accountUrl! },
      null,
      this.options.privateKey);
    const resp = await this.post(certUrl, env);
    ensureSuccess(resp);
    this.captureNonce(resp);
    return await resp.text();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async post(url: string, env: Jws.Envelope): Promise<Response> {
    return await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": wire.CONTENT_TYPE_JOSE_JSON },
      body:    JSON.stringify(env),
    });
  }

  private captureNonce(resp: Response): void {
    const nonce = resp.headers.get("Replay-Nonce");
    if (nonce !== null) this.lastNonce = nonce;
  }

  private async buildCsr(nid: string): Promise<Uint8Array> {
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${nid.replace(/([",+;<>\\])/g, "\\$1")}`,
      keys: this.options.webCryptoKeys,
      signingAlgorithm: { name: "Ed25519" },
      extensions: [
        new x509.SubjectAlternativeNameExtension([{ type: "url", value: nid }], false),
      ],
    });
    return new Uint8Array(csr.rawData);
  }
}

function ensureSuccess(resp: Response): void {
  if (!resp.ok) {
    throw new Error(`ACME ${resp.url} HTTP ${resp.status}`);
  }
}
