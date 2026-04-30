// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

// TypeScript parallel of Java AcmeAgent01Tests / .NET AcmeAgent01Tests
// per NPS-RFC-0002 §4.4. End-to-end agent-01 round-trip plus tampered-signature
// negative path.

import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as x509 from "@peculiar/x509";

import { AssuranceLevel } from "../src/nip/assurance-level.js";
import * as ec from "../src/nip/error-codes.js";
import { issueRoot } from "../src/nip/x509/builder.js";
import { verify as verifyX509 } from "../src/nip/x509/verifier.js";
import { AcmeClient } from "../src/nip/acme/client.js";
import { AcmeServer } from "../src/nip/acme/server.js";
import * as Jws from "../src/nip/acme/jws.js";
import * as wire from "../src/nip/acme/wire.js";
import type {
  Authorization, ChallengeRespondPayload, Directory, NewAccountPayload,
  NewOrderPayload, Order, ProblemDetail,
} from "../src/nip/acme/messages.js";
import { generateDualKeyPair, randomHexSerial } from "./_rfc0002-keys.js";

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
x509.cryptoProvider.set(globalThis.crypto);

interface Fixture {
  caNid:     string;
  agentNid:  string;
  caRoot:    x509.X509Certificate;
  agentKeys: Awaited<ReturnType<typeof generateDualKeyPair>>;
  server:    AcmeServer;
}

async function createFixture(): Promise<Fixture> {
  const caNid    = "urn:nps:ca:acme-test";
  const agentNid = "urn:nps:agent:acme-test:1";

  const caKeys = await generateDualKeyPair();
  const caRoot = await issueRoot({
    caNid, caKeys: caKeys.webCrypto,
    notBefore: new Date(Date.now() - 60_000),
    notAfter:  new Date(Date.now() + 365 * 24 * 3600_000),
    serialNumber: "01",
  });

  const agentKeys = await generateDualKeyPair();

  const server = new AcmeServer({
    caNid, caKeys: caKeys.webCrypto, caRootCert: caRoot,
    certValidityMs: 30 * 24 * 3600_000,
  });
  await server.start();

  return { caNid, agentNid, caRoot, agentKeys, server };
}

describe("ACME agent-01 — RFC-0002 §4.4 round-trip", () => {

  it("issueAgentCert round-trip returns a PEM chain that verifies against the CA root", async () => {
    const fx = await createFixture();
    try {
      const client = new AcmeClient({
        directoryUrl:  fx.server.directoryUrl,
        privateKey:    fx.agentKeys.privRaw,
        publicKey:     fx.agentKeys.pubRaw,
        webCryptoKeys: fx.agentKeys.webCrypto,
      });

      const pem = await client.issueAgentCert(fx.agentNid);
      expect(pem).toContain("BEGIN CERTIFICATE");

      // Parse PEM chain and re-encode as base64url DER for the X.509 verifier.
      const certs = x509.PemConverter.decode(pem)
        .map((buf) => new x509.X509Certificate(buf));
      expect(certs.length).toBeGreaterThan(0);
      const chainB64 = certs.map((c) => b64uEncode(new Uint8Array(c.rawData)));

      const result = await verifyX509({
        certChainBase64UrlDer:  chainB64,
        assertedNid:            fx.agentNid,
        assertedAssuranceLevel: AssuranceLevel.ANONYMOUS,
        trustedRootCerts:       [fx.caRoot],
      });
      expect(result.valid).toBe(true);
      expect(extractCn(result.leaf!.subject)).toBe(fx.agentNid);
    } finally {
      await fx.server.close();
    }
  });

  it("respondAgent01 with tampered agent_signature → server returns NIP-ACME-CHALLENGE-FAILED", async () => {
    const fx = await createFixture();
    try {
      // Drive the flow manually so we can splice in a forged challenge response.
      const dirResp = await fetch(fx.server.directoryUrl);
      expect(dirResp.ok).toBe(true);
      const dir = await dirResp.json() as Directory;

      const nonceResp = await fetch(dir.newNonce, { method: "HEAD" });
      let nonce = nonceResp.headers.get("Replay-Nonce")!;
      expect(nonce).not.toBeNull();

      // newAccount.
      const jwk = Jws.jwkFromPublicKey(fx.agentKeys.pubRaw);
      const acctEnv = Jws.sign(
        { alg: Jws.ALG_EDDSA, nonce, url: dir.newAccount, jwk },
        { termsOfServiceAgreed: true } as NewAccountPayload,
        fx.agentKeys.privRaw);
      const acctResp = await postJose(dir.newAccount, acctEnv);
      expect(acctResp.status).toBe(201);
      const accountUrl = acctResp.headers.get("Location")!;
      nonce = acctResp.headers.get("Replay-Nonce")!;

      // newOrder.
      const orderEnv = Jws.sign(
        { alg: Jws.ALG_EDDSA, nonce, url: dir.newOrder, kid: accountUrl },
        {
          identifiers: [{ type: wire.IDENTIFIER_TYPE_NID, value: fx.agentNid }],
        } as NewOrderPayload,
        fx.agentKeys.privRaw);
      const orderResp = await postJose(dir.newOrder, orderEnv);
      expect(orderResp.status).toBe(201);
      const order = await orderResp.json() as Order;
      nonce = orderResp.headers.get("Replay-Nonce")!;

      // POST-as-GET on authz to discover the challenge URL + token.
      const authzEnv = Jws.sign(
        { alg: Jws.ALG_EDDSA, nonce, url: order.authorizations[0], kid: accountUrl },
        null, fx.agentKeys.privRaw);
      const authzResp = await postJose(order.authorizations[0], authzEnv);
      const authz = await authzResp.json() as Authorization;
      nonce = authzResp.headers.get("Replay-Nonce")!;

      const challenge = authz.challenges.find((c) => c.type === wire.CHALLENGE_AGENT_01);
      expect(challenge).toBeDefined();

      // ★ Tampered: sign challenge token with a *different* keypair, but submit
      //   the JWS envelope under the registered account's key — server verifies
      //   the JWS sig (passes with account key) and then verifies the agent
      //   signature against the account key (fails).
      const forger = await generateDualKeyPair();
      const tokenBytes = new TextEncoder().encode(challenge!.token);
      const forgedSig  = ed25519.sign(tokenBytes, forger.privRaw);

      const chEnv = Jws.sign(
        { alg: Jws.ALG_EDDSA, nonce, url: challenge!.url, kid: accountUrl },
        { agent_signature: Jws.b64uEncode(forgedSig) } as ChallengeRespondPayload,
        fx.agentKeys.privRaw);
      const chResp = await postJose(challenge!.url, chEnv);

      expect(chResp.status).toBe(400);
      const problem = await chResp.json() as ProblemDetail;
      expect(problem.type).toBe(ec.ACME_CHALLENGE_FAILED);
    } finally {
      await fx.server.close();
    }
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function postJose(url: string, env: Jws.Envelope): Promise<Response> {
  return await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": wire.CONTENT_TYPE_JOSE_JSON },
    body:    JSON.stringify(env),
  });
}

function b64uEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "")
    .replace(/\+/g, "-").replace(/\//g, "_");
}

function extractCn(dn: string): string | null {
  for (const rdn of dn.split(",")) {
    const t = rdn.trim();
    if (t.startsWith("CN=")) {
      let v = t.slice(3);
      if (v.startsWith("\"") && v.endsWith("\"")) v = v.slice(1, -1);
      return v.replace(/\\([",+;<>\\])/g, "$1");
    }
  }
  return null;
}

// Touch the import so unused-symbol lint doesn't trip.
void randomHexSerial;
