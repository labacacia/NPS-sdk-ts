// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NipIdentity } from "../src/nip/identity.js";
import { IdentFrame, TrustFrame, RevokeFrame } from "../src/nip/frames.js";
import { createFullRegistry } from "../src/setup.js";
import { NpsFrameCodec } from "../src/core/index.js";

// ── NipIdentity ───────────────────────────────────────────────────────────────

describe("NipIdentity", () => {
  it("generate() creates distinct keys each time", () => {
    const a = NipIdentity.generate();
    const b = NipIdentity.generate();
    expect(Buffer.from(a.pubKey).toString("hex")).not.toBe(Buffer.from(b.pubKey).toString("hex"));
  });

  it("fromPrivateKey() derives consistent public key", () => {
    const id  = NipIdentity.generate();
    const id2 = NipIdentity.fromPrivateKey(id["_privKey"]);
    expect(Buffer.from(id2.pubKey).toString("hex")).toBe(Buffer.from(id.pubKey).toString("hex"));
  });

  it("pubKeyString returns 'ed25519:<hex>'", () => {
    const id = NipIdentity.generate();
    expect(id.pubKeyString).toMatch(/^ed25519:[0-9a-f]{64}$/);
  });

  it("sign + verify roundtrip succeeds", () => {
    const id      = NipIdentity.generate();
    const payload = { action: "announce", nid: "urn:nps:node:test:1", ts: "2026-01-01T00:00:00Z" };
    const sig     = id.sign(payload);
    expect(sig).toMatch(/^ed25519:/);
    expect(id.verify(payload, sig)).toBe(true);
  });

  it("verify returns false for tampered payload", () => {
    const id      = NipIdentity.generate();
    const payload = { foo: "bar" };
    const sig     = id.sign(payload);
    expect(id.verify({ foo: "baz" }, sig)).toBe(false);
  });

  it("verify returns false for wrong prefix", () => {
    const id      = NipIdentity.generate();
    const payload = { x: 1 };
    expect(id.verify(payload, "rsa:abc")).toBe(false);
  });

  it("verify returns false for corrupted base64", () => {
    const id      = NipIdentity.generate();
    const payload = { x: 1 };
    expect(id.verify(payload, "ed25519:!!!")).toBe(false);
  });

  it("sign is canonical — key-order independent", () => {
    const id  = NipIdentity.generate();
    const p1  = { b: 2, a: 1 };
    const p2  = { a: 1, b: 2 };
    const s1  = id.sign(p1);
    const s2  = id.sign(p2);
    expect(s1).toBe(s2);
  });

  it("save + load roundtrip", () => {
    const dir  = mkdtempSync(join(tmpdir(), "nip-test-"));
    const path = join(dir, "key.json");
    try {
      const id   = NipIdentity.generate();
      const pass = "test-passphrase-123";
      id.save(path, pass);
      const loaded = NipIdentity.load(path, pass);
      // Verify signatures from loaded key match original
      const payload = { hello: "world" };
      const sig     = id.sign(payload);
      expect(loaded.verify(payload, sig)).toBe(true);
      expect(Buffer.from(loaded.pubKey).toString("hex")).toBe(
        Buffer.from(id.pubKey).toString("hex"),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("load with wrong passphrase throws", () => {
    const dir  = mkdtempSync(join(tmpdir(), "nip-test-"));
    const path = join(dir, "key.json");
    try {
      NipIdentity.generate().save(path, "correct-pass");
      expect(() => NipIdentity.load(path, "wrong-pass")).toThrow();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

// ── IdentFrame ────────────────────────────────────────────────────────────────

describe("IdentFrame", () => {
  const NID  = "urn:nps:node:example.com:svc";
  const meta = { issuer: "urn:nps:ca:root", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" };

  it("toDict / fromDict roundtrip", () => {
    const f    = new IdentFrame(NID, "ed25519:aabbcc", meta, "ed25519:sig");
    const back = IdentFrame.fromDict(f.toDict());
    expect(back.nid).toBe(NID);
    expect(back.pubKey).toBe("ed25519:aabbcc");
    expect(back.metadata.issuer).toBe("urn:nps:ca:root");
    expect(back.signature).toBe("ed25519:sig");
  });

  it("unsignedDict omits signature", () => {
    const f = new IdentFrame(NID, "ed25519:aabbcc", meta, "ed25519:sig");
    const d = f.unsignedDict();
    expect(d["signature"]).toBeUndefined();
    expect(d["pub_key"]).toBe("ed25519:aabbcc");
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new IdentFrame(NID, "ed25519:aabbcc", meta, "ed25519:sig");
    const back     = codec.decode(codec.encode(f)) as IdentFrame;
    expect(back).toBeInstanceOf(IdentFrame);
    expect(back.nid).toBe(NID);
  });
});

// ── TrustFrame ────────────────────────────────────────────────────────────────

describe("TrustFrame", () => {
  it("toDict / fromDict roundtrip", () => {
    const f    = new TrustFrame(
      "urn:nps:node:issuer:1", "urn:nps:node:subject:1",
      ["nwp/query"], "2027-01-01T00:00:00Z", "ed25519:sig",
    );
    const back = TrustFrame.fromDict(f.toDict());
    expect(back.issuerNid).toBe("urn:nps:node:issuer:1");
    expect(back.subjectNid).toBe("urn:nps:node:subject:1");
    expect(back.scopes[0]).toBe("nwp/query");
    expect(back.expiresAt).toBe("2027-01-01T00:00:00Z");
    expect(back.signature).toBe("ed25519:sig");
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new TrustFrame("urn:nps:node:a:1", "urn:nps:node:b:1", ["nwp/query"], "2027-01-01T00:00:00Z", "ed25519:sig");
    const back     = codec.decode(codec.encode(f)) as TrustFrame;
    expect(back).toBeInstanceOf(TrustFrame);
  });
});

// ── RevokeFrame ───────────────────────────────────────────────────────────────

describe("RevokeFrame", () => {
  it("toDict / fromDict with all fields", () => {
    const f    = new RevokeFrame("urn:nps:node:a:1", "compromised", "2026-06-01T00:00:00Z");
    const back = RevokeFrame.fromDict(f.toDict());
    expect(back.nid).toBe("urn:nps:node:a:1");
    expect(back.reason).toBe("compromised");
    expect(back.revokedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("optional fields default to undefined", () => {
    const f    = new RevokeFrame("urn:nps:node:a:1");
    const back = RevokeFrame.fromDict(f.toDict());
    expect(back.reason).toBeUndefined();
    expect(back.revokedAt).toBeUndefined();
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new RevokeFrame("urn:nps:node:a:1", "expired");
    const back     = codec.decode(codec.encode(f)) as RevokeFrame;
    expect(back).toBeInstanceOf(RevokeFrame);
    expect(back.reason).toBe("expired");
  });
});
