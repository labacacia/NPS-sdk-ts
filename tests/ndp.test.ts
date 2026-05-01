// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { AnnounceFrame, ResolveFrame, GraphFrame } from "../src/ndp/frames.js";
import { InMemoryNdpRegistry } from "../src/ndp/ndp-registry.js";
import { NdpAnnounceValidator, NdpAnnounceResult } from "../src/ndp/validator.js";
import { parseNpsTxtRecord, extractHostFromTarget, type DnsTxtLookup } from "../src/ndp/dns-txt.js";
import { NipIdentity } from "../src/nip/identity.js";
import { createFullRegistry } from "../src/setup.js";
import { NpsFrameCodec } from "../src/core/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const NID   = "urn:nps:node:example.com:data";
const ADDRS = [{ host: "example.com", port: 17433, protocol: "nwp" }];
const CAPS  = ["nwp/query", "nwp/stream"];

function makeAnnounce(nid = NID, ttl = 300, id?: NipIdentity): AnnounceFrame {
  const ident     = id ?? NipIdentity.generate();
  const timestamp = "2026-01-01T00:00:00Z";
  const unsigned  = {
    nid, addresses: ADDRS, capabilities: CAPS, ttl, timestamp, node_type: null,
  };
  const sig = ident.sign(unsigned);
  return new AnnounceFrame(nid, ADDRS, CAPS, ttl, timestamp, sig);
}

// ── AnnounceFrame round-trip ──────────────────────────────────────────────────

describe("AnnounceFrame", () => {
  it("toDict / fromDict roundtrip", () => {
    const f    = makeAnnounce();
    const back = AnnounceFrame.fromDict(f.toDict());
    expect(back.nid).toBe(NID);
    expect(back.ttl).toBe(300);
    expect(back.addresses[0]?.port).toBe(17433);
    expect(back.capabilities).toContain("nwp/query");
  });

  it("unsignedDict omits signature", () => {
    const f   = makeAnnounce();
    const d   = f.unsignedDict();
    expect(d["signature"]).toBeUndefined();
    expect(d["nid"]).toBe(NID);
  });

  it("codec roundtrip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = makeAnnounce();
    const back     = codec.decode(codec.encode(f)) as AnnounceFrame;
    expect(back).toBeInstanceOf(AnnounceFrame);
    expect(back.nid).toBe(NID);
  });
});

// ── ResolveFrame round-trip ───────────────────────────────────────────────────

describe("ResolveFrame", () => {
  it("toDict / fromDict with resolved", () => {
    const f    = new ResolveFrame("nwp://example.com/data", "urn:nps:node:a:b", { host: "example.com", port: 17433, ttl: 300 });
    const back = ResolveFrame.fromDict(f.toDict());
    expect(back.target).toBe("nwp://example.com/data");
    expect(back.requesterNid).toBe("urn:nps:node:a:b");
    expect(back.resolved?.port).toBe(17433);
  });

  it("toDict / fromDict without optional fields", () => {
    const f    = new ResolveFrame("nwp://example.com/data");
    const back = ResolveFrame.fromDict(f.toDict());
    expect(back.requesterNid).toBeUndefined();
    expect(back.resolved).toBeUndefined();
  });
});

// ── GraphFrame round-trip ─────────────────────────────────────────────────────

describe("GraphFrame", () => {
  it("toDict / fromDict with nodes", () => {
    const nodes = [{ nid: NID, addresses: ADDRS, capabilities: CAPS }];
    const f     = new GraphFrame(1, true, nodes);
    const back  = GraphFrame.fromDict(f.toDict());
    expect(back.seq).toBe(1);
    expect(back.initialSync).toBe(true);
    expect(back.nodes?.[0]?.nid).toBe(NID);
    expect(back.patch).toBeUndefined();
  });
});

// ── InMemoryNdpRegistry ───────────────────────────────────────────────────────

describe("InMemoryNdpRegistry", () => {
  it("announce + getByNid", () => {
    const reg = new InMemoryNdpRegistry();
    const f   = makeAnnounce();
    reg.announce(f);
    expect(reg.getByNid(NID)).toBe(f);
  });

  it("getByNid returns undefined for unknown NID", () => {
    const reg = new InMemoryNdpRegistry();
    expect(reg.getByNid("urn:nps:node:unknown:x")).toBeUndefined();
  });

  it("announce with ttl=0 removes entry", () => {
    const reg = new InMemoryNdpRegistry();
    reg.announce(makeAnnounce(NID, 300));
    expect(reg.getByNid(NID)).toBeDefined();
    reg.announce(makeAnnounce(NID, 0));
    expect(reg.getByNid(NID)).toBeUndefined();
  });

  it("TTL expiry — getByNid returns undefined after expiry", () => {
    const reg = new InMemoryNdpRegistry();
    let   now = 0;
    reg.clock = () => now;
    reg.announce(makeAnnounce(NID, 10));
    now = 11_000;
    expect(reg.getByNid(NID)).toBeUndefined();
  });

  it("resolve returns host/port for matching target", () => {
    const reg = new InMemoryNdpRegistry();
    reg.announce(makeAnnounce());
    const r = reg.resolve("nwp://example.com/data/sub");
    expect(r).toBeDefined();
    expect(r?.host).toBe("example.com");
    expect(r?.port).toBe(17433);
  });

  it("resolve returns undefined for non-matching target", () => {
    const reg = new InMemoryNdpRegistry();
    reg.announce(makeAnnounce());
    expect(reg.resolve("nwp://other.com/data")).toBeUndefined();
  });

  it("getAll returns active entries", () => {
    const reg = new InMemoryNdpRegistry();
    let   now = 0;
    reg.clock = () => now;
    reg.announce(makeAnnounce("urn:nps:node:a.com:x", 100));
    reg.announce(makeAnnounce("urn:nps:node:b.com:y", 1));
    now = 2_000; // b expired
    const all = reg.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.nid).toBe("urn:nps:node:a.com:x");
  });

  it("resolve skips expired entries", () => {
    const reg = new InMemoryNdpRegistry();
    let   now = 0;
    reg.clock = () => now;
    reg.announce(makeAnnounce(NID, 5));
    now = 10_000;
    expect(reg.resolve("nwp://example.com/data")).toBeUndefined();
  });
});

// ── nwpTargetMatchesNid ───────────────────────────────────────────────────────

describe("InMemoryNdpRegistry.nwpTargetMatchesNid", () => {
  const match = InMemoryNdpRegistry.nwpTargetMatchesNid;

  it("exact match", () => {
    expect(match("urn:nps:node:example.com:data", "nwp://example.com/data")).toBe(true);
  });

  it("sub-path match", () => {
    expect(match("urn:nps:node:example.com:data", "nwp://example.com/data/sub")).toBe(true);
  });

  it("different authority does not match", () => {
    expect(match("urn:nps:node:other.com:data", "nwp://example.com/data")).toBe(false);
  });

  it("sibling path does not match", () => {
    expect(match("urn:nps:node:example.com:data", "nwp://example.com/dataset")).toBe(false);
  });

  it("invalid NID format returns false", () => {
    expect(match("invalid-nid", "nwp://example.com/data")).toBe(false);
  });

  it("non-nwp:// target returns false", () => {
    expect(match("urn:nps:node:example.com:data", "http://example.com/data")).toBe(false);
  });

  it("target without path slash returns false", () => {
    expect(match("urn:nps:node:example.com:data", "nwp://example.com")).toBe(false);
  });
});

// ── NdpAnnounceResult ─────────────────────────────────────────────────────────

describe("NdpAnnounceResult", () => {
  it("ok() returns isValid=true", () => {
    const r = NdpAnnounceResult.ok();
    expect(r.isValid).toBe(true);
    expect(r.errorCode).toBeUndefined();
  });

  it("fail() returns isValid=false with code + message", () => {
    const r = NdpAnnounceResult.fail("NDP-ERR", "bad sig");
    expect(r.isValid).toBe(false);
    expect(r.errorCode).toBe("NDP-ERR");
    expect(r.message).toBe("bad sig");
  });
});

// ── NdpAnnounceValidator ──────────────────────────────────────────────────────

describe("NdpAnnounceValidator", () => {
  it("fails when no key registered", () => {
    const v   = new NdpAnnounceValidator();
    const r   = v.validate(makeAnnounce());
    expect(r.isValid).toBe(false);
    expect(r.errorCode).toBe("NDP-ANNOUNCE-NID-MISMATCH");
  });

  it("validates a correctly signed frame", () => {
    const ident = NipIdentity.generate();
    const v     = new NdpAnnounceValidator();
    v.registerPublicKey(NID, ident.pubKeyString);
    const f = makeAnnounce(NID, 300, ident);
    expect(v.validate(f).isValid).toBe(true);
  });

  it("rejects tampered frame (wrong signature)", () => {
    const ident = NipIdentity.generate();
    const v     = new NdpAnnounceValidator();
    v.registerPublicKey(NID, ident.pubKeyString);
    // Build frame signed by a different key
    const other = NipIdentity.generate();
    const f     = makeAnnounce(NID, 300, other);
    expect(v.validate(f).isValid).toBe(false);
  });

  it("rejects signature with wrong prefix", () => {
    const ident = NipIdentity.generate();
    const v     = new NdpAnnounceValidator();
    v.registerPublicKey(NID, ident.pubKeyString);
    const f = new AnnounceFrame(NID, ADDRS, CAPS, 300, "2026-01-01T00:00:00Z", "rsa:invalid");
    const r = v.validate(f);
    expect(r.isValid).toBe(false);
    expect(r.errorCode).toBe("NDP-ANNOUNCE-SIG-INVALID");
  });

  it("rejects corrupted base64 signature", () => {
    const ident = NipIdentity.generate();
    const v     = new NdpAnnounceValidator();
    v.registerPublicKey(NID, ident.pubKeyString);
    const f = new AnnounceFrame(NID, ADDRS, CAPS, 300, "2026-01-01T00:00:00Z", "ed25519:!!!garbage!!!");
    const r = v.validate(f);
    expect(r.isValid).toBe(false);
  });

  it("removePublicKey removes registration", () => {
    const ident = NipIdentity.generate();
    const v     = new NdpAnnounceValidator();
    v.registerPublicKey(NID, ident.pubKeyString);
    v.removePublicKey(NID);
    expect(v.knownPublicKeys.has(NID)).toBe(false);
    expect(v.validate(makeAnnounce(NID, 300, ident)).isValid).toBe(false);
  });

  it("knownPublicKeys is readonly view", () => {
    const v = new NdpAnnounceValidator();
    v.registerPublicKey("urn:nps:node:a:1", "ed25519:aabb");
    expect(v.knownPublicKeys.size).toBe(1);
  });
});

// ── DnsTxtResolution ──────────────────────────────────────────────────────────

describe("DnsTxtResolution", () => {
  // ── parseNpsTxtRecord ───────────────────────────────────────────────────────

  it("parseNpsTxtRecord - valid full record", () => {
    const parts = ["v=nps1 type=memory port=17434 nid=urn:nps:node:api.example.com:products fp=sha256:a3f9"];
    const result = parseNpsTxtRecord(parts, "api.example.com");
    expect(result).toBeDefined();
    expect(result?.host).toBe("api.example.com");
    expect(result?.port).toBe(17434);
    expect(result?.ttl).toBe(300);
    expect(result?.certFingerprint).toBe("sha256:a3f9");
  });

  it("parseNpsTxtRecord - missing v returns undefined", () => {
    const parts = ["type=memory port=17434 nid=urn:nps:node:api.example.com:products"];
    expect(parseNpsTxtRecord(parts, "api.example.com")).toBeUndefined();
  });

  it("parseNpsTxtRecord - wrong v returns undefined", () => {
    const parts = ["v=nps2 nid=urn:nps:node:api.example.com:products"];
    expect(parseNpsTxtRecord(parts, "api.example.com")).toBeUndefined();
  });

  it("parseNpsTxtRecord - missing nid returns undefined", () => {
    const parts = ["v=nps1 type=memory port=17434"];
    expect(parseNpsTxtRecord(parts, "api.example.com")).toBeUndefined();
  });

  it("parseNpsTxtRecord - default port", () => {
    const parts = ["v=nps1 nid=urn:nps:node:api.example.com:products"];
    const result = parseNpsTxtRecord(parts, "api.example.com");
    expect(result).toBeDefined();
    expect(result?.port).toBe(17433);
  });

  it("parseNpsTxtRecord - with fingerprint", () => {
    const parts = ["v=nps1 nid=urn:nps:node:api.example.com:products fp=sha256:deadbeef"];
    const result = parseNpsTxtRecord(parts, "api.example.com");
    expect(result?.certFingerprint).toBe("sha256:deadbeef");
  });

  // ── resolveWithDns ──────────────────────────────────────────────────────────

  it("resolveWithDns - uses registry first (dns not called)", async () => {
    const reg = new InMemoryNdpRegistry();
    reg.announce(makeAnnounce("urn:nps:node:example.com:data", 300));

    let dnsCalled = false;
    const mockDns: DnsTxtLookup = {
      resolveTxt: async (_hostname: string) => {
        dnsCalled = true;
        return [];
      },
    };

    const result = await reg.resolveWithDns("nwp://example.com/data", mockDns);
    expect(result).toBeDefined();
    expect(result?.host).toBe("example.com");
    expect(dnsCalled).toBe(false);
  });

  it("resolveWithDns - falls back to dns when registry empty", async () => {
    const reg = new InMemoryNdpRegistry();

    const mockDns: DnsTxtLookup = {
      resolveTxt: async (hostname: string) => {
        expect(hostname).toBe("_nps-node.api.example.com");
        return [["v=nps1 nid=urn:nps:node:api.example.com:products port=17434"]];
      },
    };

    const result = await reg.resolveWithDns("nwp://api.example.com/products", mockDns);
    expect(result).toBeDefined();
    expect(result?.host).toBe("api.example.com");
    expect(result?.port).toBe(17434);
  });

  it("resolveWithDns - invalid txt returns undefined", async () => {
    const reg = new InMemoryNdpRegistry();

    const mockDns: DnsTxtLookup = {
      resolveTxt: async (_hostname: string) => {
        // Missing v=nps1 and nid — invalid record
        return [["type=memory port=17434"]];
      },
    };

    const result = await reg.resolveWithDns("nwp://api.example.com/products", mockDns);
    expect(result).toBeUndefined();
  });

  it("resolveWithDns - empty records returns undefined", async () => {
    const reg = new InMemoryNdpRegistry();

    const mockDns: DnsTxtLookup = {
      resolveTxt: async (_hostname: string) => [],
    };

    const result = await reg.resolveWithDns("nwp://api.example.com/products", mockDns);
    expect(result).toBeUndefined();
  });
});
