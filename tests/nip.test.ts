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
  const meta = { issuer: "urn:nps:org:root", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" };

  it("toDict / fromDict roundtrip", () => {
    const f    = new IdentFrame(NID, "ed25519:aabbcc", meta, "ed25519:sig");
    const back = IdentFrame.fromDict(f.toDict());
    expect(back.nid).toBe(NID);
    expect(back.pubKey).toBe("ed25519:aabbcc");
    expect(back.metadata.issuer).toBe("urn:nps:org:root");
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
      "urn:nps:org:org-a.com",
      "urn:nps:org:org-b.com",
      ["nwp:query"],
      ["nwp://api.org-a.com/public/**"],
      "2026-05-11T00:00:00Z",
      "2027-01-01T00:00:00Z",
      "00000000000A3F9C",
      "urn:nps:org:org-a.com",
      "ed25519:sig",
    );
    const back = TrustFrame.fromDict(f.toDict());
    expect(back.grantorNid).toBe("urn:nps:org:org-a.com");
    expect(back.granteeCa).toBe("urn:nps:org:org-b.com");
    expect(back.trustScope[0]).toBe("nwp:query");
    expect(back.nodes[0]).toBe("nwp://api.org-a.com/public/**");
    expect(back.issuedAt).toBe("2026-05-11T00:00:00Z");
    expect(back.expiresAt).toBe("2027-01-01T00:00:00Z");
    expect(back.serial).toBe("00000000000A3F9C");
    expect(back.signerNid).toBe("urn:nps:org:org-a.com");
    expect(back.signature).toBe("ed25519:sig");
    expect(back.unsignedDict()).not.toHaveProperty("signature");
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new TrustFrame(
      "urn:nps:org:a.com",
      "urn:nps:org:b.com",
      ["nwp:query"],
      ["nwp://api.a.com/public/**"],
      "2026-05-11T00:00:00Z",
      "2027-01-01T00:00:00Z",
      "00000000000A3F9D",
      "urn:nps:org:a.com",
      "ed25519:sig",
    );
    const back     = codec.decode(codec.encode(f)) as TrustFrame;
    expect(back).toBeInstanceOf(TrustFrame);
    expect(back.granteeCa).toBe("urn:nps:org:b.com");
  });
});

// ── RevokeFrame ───────────────────────────────────────────────────────────────

describe("RevokeFrame", () => {
  it("toDict / fromDict with all fields", () => {
    const f    = new RevokeFrame(
      "urn:nps:agent:ca.example.com:session-1",
      "parent_revoked",
      "2026-06-01T00:00:00Z",
      "urn:nps:org:ca.example.com",
      "ed25519:sig",
      "0x0A3F9C",
      "urn:nps:agent:ca.example.com:group-1",
    );
    const back = RevokeFrame.fromDict(f.toDict());
    expect(back.targetNid).toBe("urn:nps:agent:ca.example.com:session-1");
    expect(back.serial).toBe("0x0A3F9C");
    expect(back.reason).toBe("parent_revoked");
    expect(back.revokedAt).toBe("2026-06-01T00:00:00Z");
    expect(back.parentNid).toBe("urn:nps:agent:ca.example.com:group-1");
    expect(back.signerNid).toBe("urn:nps:org:ca.example.com");
    expect(back.unsignedDict()).not.toHaveProperty("signature");
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new RevokeFrame(
      "urn:nps:agent:ca.example.com:old",
      "key_compromise",
      "2026-06-01T00:00:00Z",
      "urn:nps:org:ca.example.com",
      "ed25519:sig",
    );
    const back     = codec.decode(codec.encode(f)) as RevokeFrame;
    expect(back).toBeInstanceOf(RevokeFrame);
    expect(back.reason).toBe("key_compromise");
    expect(back.serial).toBeUndefined();
  });

  it("rejects parent_revoked without parent_nid", () => {
    expect(() => RevokeFrame.fromDict({
      frame:      "0x22",
      target_nid: "urn:nps:agent:ca.example.com:session-1",
      reason:     "parent_revoked",
      revoked_at: "2026-06-01T00:00:00Z",
      signer_nid: "urn:nps:org:ca.example.com",
      signature:  "ed25519:sig",
    })).toThrow(/NIP-REVOKE-FRAME-INVALID/);
  });

  it("rejects parent_nid unless reason is parent_revoked", () => {
    expect(() => RevokeFrame.fromDict({
      frame:      "0x22",
      target_nid: "urn:nps:agent:ca.example.com:old",
      reason:     "key_compromise",
      revoked_at: "2026-06-01T00:00:00Z",
      parent_nid: "urn:nps:agent:ca.example.com:group-1",
      signer_nid: "urn:nps:org:ca.example.com",
      signature:  "ed25519:sig",
    })).toThrow(/NIP-REVOKE-FRAME-INVALID/);
  });
});
