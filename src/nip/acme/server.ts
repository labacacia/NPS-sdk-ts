// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

/**
 * In-process ACME server implementing the `agent-01` challenge for NPS-RFC-0002 §4.4.
 *
 * Backed by Node's stdlib `http.createServer`. Suitable for tests and reference
 * deployments. State is kept in memory.
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import * as x509 from "@peculiar/x509";

import { AssuranceLevel } from "../assurance-level.js";
import { ACME_CHALLENGE_FAILED } from "../error-codes.js";
import { issueLeaf } from "../x509/builder.js";
import * as Jws from "./jws.js";
import type {
  Authorization, Challenge, ChallengeRespondPayload, Directory,
  FinalizePayload, Identifier, NewOrderPayload, Order, ProblemDetail,
} from "./messages.js";
import * as wire from "./wire.js";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
x509.cryptoProvider.set(globalThis.crypto);

export interface AcmeServerOptions {
  caNid:           string;
  caKeys:          CryptoKeyPair;        // Web Crypto Ed25519 keypair (for issuing X.509 leaves).
  caRootCert:      x509.X509Certificate;
  certValidityMs:  number;
}

interface OrderState {
  id:              string;
  identifier:      Identifier;
  status:          string;
  authzId:         string;
  finalizeUrl:     string;
  accountUrl:      string;
  certificateUrl?: string;
}

interface AuthzState {
  id:           string;
  identifier:   Identifier;
  status:       string;
  challengeIds: string[];
  accountUrl:   string;
}

interface ChallengeState {
  id:          string;
  type:        string;
  status:      string;
  token:       string;
  authzId:     string;
  accountUrl:  string;
}

export class AcmeServer {
  private readonly server: Server;
  private readonly nonces       = new Set<string>();
  private readonly accountJwks  = new Map<string, Jws.Jwk>();
  private readonly orders       = new Map<string, OrderState>();
  private readonly authzs       = new Map<string, AuthzState>();
  private readonly challenges   = new Map<string, ChallengeState>();
  private readonly certs        = new Map<string, string>();
  private boundPort: number    = 0;

  constructor(public readonly options: AcmeServerOptions) {
    this.server = createServer((req, res) => this.dispatch(req, res));
  }

  async start(): Promise<this> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address();
    this.boundPort = typeof addr === "object" && addr !== null ? addr.port : 0;
    return this;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  get baseUrl():       string { return `http://127.0.0.1:${this.boundPort}`; }
  get directoryUrl():  string { return `${this.baseUrl}/directory`; }

  // ── Routing ──────────────────────────────────────────────────────────────

  private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url    = req.url ?? "/";
    const method = req.method ?? "GET";
    try {
      if (method === "GET" && url === "/directory")        return this.handleDirectory(res);
      if (url === "/new-nonce")                              return this.handleNewNonce(method, res);
      if (method === "POST" && url === "/new-account")     return await this.handleNewAccount(req, res);
      if (method === "POST" && url === "/new-order")       return await this.handleNewOrder(req, res);
      if (method === "POST" && url.startsWith("/authz/"))    return await this.handleAuthz(req, res, url);
      if (method === "POST" && url.startsWith("/chall/"))    return await this.handleChallenge(req, res, url);
      if (method === "POST" && url.startsWith("/finalize/")) return await this.handleFinalize(req, res, url);
      if (method === "POST" && url.startsWith("/cert/"))     return await this.handleCert(req, res, url);
      if (method === "POST" && url.startsWith("/order/"))    return await this.handleOrder(req, res, url);
      this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no such resource");
    } catch (e) {
      this.sendProblem(res, 500, "urn:ietf:params:acme:error:serverInternal",
        (e as Error).message);
    }
  }

  // ── Endpoint handlers ────────────────────────────────────────────────────

  private handleDirectory(res: ServerResponse): void {
    const dir: Directory = {
      newNonce:   `${this.baseUrl}/new-nonce`,
      newAccount: `${this.baseUrl}/new-account`,
      newOrder:   `${this.baseUrl}/new-order`,
    };
    this.sendJson(res, 200, dir);
  }

  private handleNewNonce(method: string, res: ServerResponse): void {
    res.statusCode = method === "HEAD" ? 200 : 204;
    res.setHeader("Replay-Nonce", this.mintNonce());
    res.setHeader("Cache-Control", "no-store");
    res.end();
  }

  private async handleNewAccount(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const env = await this.readEnvelope(req, res);
    if (!env) return;
    const header = this.parseHeader(env, res);
    if (!header) return;
    if (!header.jwk) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed",
        "newAccount must include a 'jwk' member");
      return;
    }
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce");
      return;
    }
    const pub = Jws.publicKeyFromJwk(header.jwk);
    if (Jws.verify(env, pub) === null) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed",
        "JWS signature verify failed");
      return;
    }

    const accountId  = `acc-${shortId()}`;
    const accountUrl = `${this.baseUrl}/account/${accountId}`;
    this.accountJwks.set(accountUrl, header.jwk);

    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Location",     accountUrl);
    res.setHeader("Replay-Nonce", this.mintNonce());
    res.end(JSON.stringify({ status: wire.Status.VALID }));
  }

  private async handleNewOrder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const env = await this.readEnvelope(req, res);
    if (!env) return;
    const header = this.parseHeader(env, res);
    if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    if (!this.verifyAccount(env, header)) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:accountDoesNotExist",
        `unknown kid: ${header.kid ?? "<missing>"}`);
      return;
    }

    const payload = Jws.decodePayload<NewOrderPayload>(env);
    if (!payload || !payload.identifiers?.length) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed", "missing identifiers");
      return;
    }
    const ident = payload.identifiers[0];
    const orderId = `ord-${shortId()}`;
    const authzId = `az-${shortId()}`;
    const challId = `ch-${shortId()}`;
    const token   = Jws.b64uEncode(new Uint8Array(randomBytes(32)));

    const orderUrl    = `${this.baseUrl}/order/${orderId}`;
    const authzUrl    = `${this.baseUrl}/authz/${authzId}`;
    const challUrl    = `${this.baseUrl}/chall/${challId}`;
    const finalizeUrl = `${this.baseUrl}/finalize/${orderId}`;

    this.challenges.set(challId, {
      id: challId, type: wire.CHALLENGE_AGENT_01, status: wire.Status.PENDING,
      token, authzId, accountUrl: header.kid ?? "",
    });
    this.authzs.set(authzId, {
      id: authzId, identifier: ident, status: wire.Status.PENDING,
      challengeIds: [challId], accountUrl: header.kid ?? "",
    });
    this.orders.set(orderId, {
      id: orderId, identifier: ident, status: wire.Status.PENDING,
      authzId, finalizeUrl, accountUrl: header.kid ?? "",
    });

    const order: Order = {
      status:         wire.Status.PENDING,
      identifiers:    [ident],
      authorizations: [authzUrl],
      finalize:       finalizeUrl,
    };
    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Location",     orderUrl);
    res.setHeader("Replay-Nonce", this.mintNonce());
    res.end(JSON.stringify(order));
  }

  private async handleAuthz(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const env = await this.readEnvelope(req, res); if (!env) return;
    const header = this.parseHeader(env, res); if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    if (!this.verifyAccount(env, header)) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:unauthorized", "bad sig"); return;
    }
    const id = url.replace(/^\/authz\//, "");
    const az = this.authzs.get(id);
    if (!az) { this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no authz"); return; }

    const challenges: Challenge[] = az.challengeIds.map((cid) => {
      const cs = this.challenges.get(cid)!;
      return {
        type: cs.type, url: `${this.baseUrl}/chall/${cs.id}`,
        status: cs.status, token: cs.token,
      };
    });
    const authz: Authorization = {
      status: az.status, identifier: az.identifier, challenges,
    };
    res.setHeader("Replay-Nonce", this.mintNonce());
    this.sendJson(res, 200, authz);
  }

  private async handleChallenge(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const env = await this.readEnvelope(req, res); if (!env) return;
    const header = this.parseHeader(env, res); if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    const accountJwk = this.accountJwks.get(header.kid ?? "");
    if (!accountJwk) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:accountDoesNotExist", "unknown kid");
      return;
    }
    const accountPub = Jws.publicKeyFromJwk(accountJwk);
    if (Jws.verify(env, accountPub) === null) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed", "JWS sig fail"); return;
    }

    const id = url.replace(/^\/chall\//, "");
    const ch = this.challenges.get(id);
    if (!ch) { this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no chall"); return; }

    const payload = Jws.decodePayload<ChallengeRespondPayload>(env);
    if (!payload?.agent_signature) {
      ch.status = wire.Status.INVALID;
      this.sendProblem(res, 400, ACME_CHALLENGE_FAILED,
        "missing agent_signature in challenge response");
      return;
    }
    try {
      const sigBytes = Jws.b64uDecode(payload.agent_signature);
      const tokenBytes = new TextEncoder().encode(ch.token);
      if (!ed25519.verify(sigBytes, tokenBytes, accountPub)) {
        ch.status = wire.Status.INVALID;
        this.sendProblem(res, 400, ACME_CHALLENGE_FAILED,
          "agent-01 signature did not verify");
        return;
      }
    } catch (e) {
      ch.status = wire.Status.INVALID;
      this.sendProblem(res, 400, ACME_CHALLENGE_FAILED,
        `agent-01 verification error: ${(e as Error).message}`);
      return;
    }

    ch.status = wire.Status.VALID;
    const az = this.authzs.get(ch.authzId);
    if (az) az.status = wire.Status.VALID;
    for (const o of this.orders.values()) {
      if (o.authzId === ch.authzId) o.status = wire.Status.READY;
    }

    res.setHeader("Replay-Nonce", this.mintNonce());
    this.sendJson(res, 200, {
      type: ch.type, url: `${this.baseUrl}/chall/${ch.id}`,
      status: ch.status, token: ch.token,
    } as Challenge);
  }

  private async handleFinalize(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const env = await this.readEnvelope(req, res); if (!env) return;
    const header = this.parseHeader(env, res); if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    if (!this.verifyAccount(env, header)) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:unauthorized", "bad sig"); return;
    }
    const orderId = url.replace(/^\/finalize\//, "");
    const os = this.orders.get(orderId);
    if (!os) { this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no order"); return; }
    if (os.status !== wire.Status.READY) {
      this.sendProblem(res, 403, "urn:ietf:params:acme:error:orderNotReady",
        `order is in state '${os.status}', not 'ready'`);
      return;
    }
    const fp = Jws.decodePayload<FinalizePayload>(env);
    if (!fp?.csr) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed", "missing csr"); return;
    }

    try {
      const csrDer = Jws.b64uDecode(fp.csr);
      const csr = new x509.Pkcs10CertificateRequest(csrDer.buffer as ArrayBuffer);
      const subjectCn = (() => {
        for (const rdn of csr.subject.split(",")) {
          const t = rdn.trim();
          if (t.startsWith("CN=")) return t.slice(3).replace(/\\([",+;<>\\])/g, "$1");
        }
        return null as string | null;
      })();
      if (subjectCn !== os.identifier.value) {
        this.sendProblem(res, 400, "NIP-CERT-SUBJECT-NID-MISMATCH",
          `CSR subject CN '${subjectCn ?? ""}' does not match order identifier '${os.identifier.value}'`);
        return;
      }
      const subjectPub = await csr.publicKey.export();
      const now = new Date();
      const leaf = await issueLeaf({
        subjectNid:       os.identifier.value,
        subjectPublicKey: subjectPub,
        caKeys:           this.options.caKeys,
        issuerNid:        this.options.caNid,
        role:             "agent",
        assuranceLevel:   AssuranceLevel.ANONYMOUS,
        notBefore:        new Date(now.getTime() - 60_000),
        notAfter:         new Date(now.getTime() + this.options.certValidityMs),
        serialNumber:     randomHexSerial(),
      });
      const certId = `crt-${shortId()}`;
      const certUrl = `${this.baseUrl}/cert/${certId}`;
      const pem = leaf.toString("pem") + this.options.caRootCert.toString("pem");
      this.certs.set(certId, pem);
      os.status         = wire.Status.VALID;
      os.certificateUrl = certUrl;
    } catch (e) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badCSR",
        `CSR processing failed: ${(e as Error).message}`);
      return;
    }

    const authzUrl = `${this.baseUrl}/authz/${os.authzId}`;
    res.setHeader("Replay-Nonce", this.mintNonce());
    this.sendJson(res, 200, {
      status: os.status, identifiers: [os.identifier],
      authorizations: [authzUrl], finalize: os.finalizeUrl,
      certificate: os.certificateUrl,
    } as Order);
  }

  private async handleCert(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const env = await this.readEnvelope(req, res); if (!env) return;
    const header = this.parseHeader(env, res); if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    if (!this.verifyAccount(env, header)) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:unauthorized", "bad sig"); return;
    }
    const certId = url.replace(/^\/cert\//, "");
    const pem = this.certs.get(certId);
    if (!pem) { this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no cert"); return; }

    res.statusCode = 200;
    res.setHeader("Content-Type", wire.CONTENT_TYPE_PEM_CERT);
    res.setHeader("Replay-Nonce", this.mintNonce());
    res.end(pem);
  }

  private async handleOrder(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const env = await this.readEnvelope(req, res); if (!env) return;
    const header = this.parseHeader(env, res); if (!header) return;
    if (!this.consumeNonce(header.nonce)) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:badNonce", "invalid nonce"); return;
    }
    if (!this.verifyAccount(env, header)) {
      this.sendProblem(res, 401, "urn:ietf:params:acme:error:unauthorized", "bad sig"); return;
    }
    const orderId = url.replace(/^\/order\//, "");
    const os = this.orders.get(orderId);
    if (!os) { this.sendProblem(res, 404, "urn:ietf:params:acme:error:malformed", "no order"); return; }
    const authzUrl = `${this.baseUrl}/authz/${os.authzId}`;
    res.setHeader("Replay-Nonce", this.mintNonce());
    this.sendJson(res, 200, {
      status: os.status, identifiers: [os.identifier],
      authorizations: [authzUrl], finalize: os.finalizeUrl,
      certificate: os.certificateUrl,
    } as Order);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private mintNonce(): string {
    const n = Jws.b64uEncode(new Uint8Array(randomBytes(16)));
    this.nonces.add(n);
    return n;
  }

  private consumeNonce(nonce: string): boolean {
    return this.nonces.delete(nonce);
  }

  private verifyAccount(env: Jws.Envelope, header: Jws.ProtectedHeader): boolean {
    if (!header.kid) return false;
    const jwk = this.accountJwks.get(header.kid);
    if (!jwk) return false;
    return Jws.verify(env, Jws.publicKeyFromJwk(jwk)) !== null;
  }

  private async readEnvelope(req: IncomingMessage, res: ServerResponse): Promise<Jws.Envelope | null> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      return JSON.parse(body) as Jws.Envelope;
    } catch (e) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed",
        `body read/parse failed: ${(e as Error).message}`);
      return null;
    }
  }

  private parseHeader(env: Jws.Envelope, res: ServerResponse): Jws.ProtectedHeader | null {
    try {
      return JSON.parse(new TextDecoder().decode(Jws.b64uDecode(env.protected))) as Jws.ProtectedHeader;
    } catch (e) {
      this.sendProblem(res, 400, "urn:ietf:params:acme:error:malformed",
        `malformed protected header: ${(e as Error).message}`);
      return null;
    }
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }

  private sendProblem(res: ServerResponse, status: number, type: string, detail: string): void {
    res.statusCode = status;
    res.setHeader("Content-Type", wire.CONTENT_TYPE_PROBLEM);
    res.end(JSON.stringify({ type, detail, status } as ProblemDetail));
  }
}

function shortId(): string {
  return Buffer.from(randomBytes(8)).toString("hex");
}

function randomHexSerial(): string {
  return Buffer.from(randomBytes(20)).toString("hex");
}
