// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  BridgeProtocols,
  BridgeNodeDescriptor,
  BridgeTarget,
  NODE_TYPE_BRIDGE,
  bridgeTargetToDict,
  bridgeTargetFromDict,
} from "../src/nwp/bridge.js";
import { AnnounceFrame } from "../src/ndp/frames.js";

// ── BridgeProtocols ───────────────────────────────────────────────────────────

describe("BridgeProtocols", () => {
  it("HTTP === 'http'", () => {
    expect(BridgeProtocols.HTTP).toBe("http");
  });

  it("GRPC === 'grpc'", () => {
    expect(BridgeProtocols.GRPC).toBe("grpc");
  });

  it("MCP === 'mcp'", () => {
    expect(BridgeProtocols.MCP).toBe("mcp");
  });

  it("A2A === 'a2a'", () => {
    expect(BridgeProtocols.A2A).toBe("a2a");
  });

  it("STANDARD contains all four protocols", () => {
    const s = BridgeProtocols.STANDARD;
    expect(s).toContain("http");
    expect(s).toContain("grpc");
    expect(s).toContain("mcp");
    expect(s).toContain("a2a");
    expect(s.length).toBe(4);
  });
});

// ── NODE_TYPE_BRIDGE ──────────────────────────────────────────────────────────

describe("NODE_TYPE_BRIDGE", () => {
  it("is 'bridge'", () => {
    expect(NODE_TYPE_BRIDGE).toBe("bridge");
  });
});

// ── BridgeNodeDescriptor ──────────────────────────────────────────────────────

describe("BridgeNodeDescriptor", () => {
  it("holds nid and supportedProtocols", () => {
    const desc: BridgeNodeDescriptor = {
      nid: "urn:nps:node:example.com:bridge",
      supportedProtocols: new Set(["http", "grpc"]),
    };
    expect(desc.nid).toBe("urn:nps:node:example.com:bridge");
    const prots = desc.supportedProtocols as ReadonlySet<string>;
    expect(prots.has("http")).toBe(true);
    expect(prots.has("grpc")).toBe(true);
  });

  it("works with array of protocols", () => {
    const desc: BridgeNodeDescriptor = {
      nid: "urn:nps:node:example.com:bridge",
      supportedProtocols: ["http", "mcp"],
    };
    expect((desc.supportedProtocols as string[]).includes("mcp")).toBe(true);
  });
});

// ── BridgeTarget round-trips ──────────────────────────────────────────────────

describe("BridgeTarget", () => {
  it("toDict / fromDict round-trip with extras", () => {
    const t: BridgeTarget = {
      protocol: "http",
      endpoint: "https://example.com/api",
      extras: { timeout: 30, auth: "bearer" },
    };
    const d    = bridgeTargetToDict(t);
    const back = bridgeTargetFromDict(d);
    expect(back.protocol).toBe("http");
    expect(back.endpoint).toBe("https://example.com/api");
    expect(back.extras).toEqual({ timeout: 30, auth: "bearer" });
  });

  it("toDict / fromDict round-trip without extras", () => {
    const t: BridgeTarget = {
      protocol: "grpc",
      endpoint: "grpc://example.com:50051",
    };
    const d    = bridgeTargetToDict(t);
    const back = bridgeTargetFromDict(d);
    expect(back.protocol).toBe("grpc");
    expect(back.endpoint).toBe("grpc://example.com:50051");
    expect(back.extras).toBeUndefined();
  });

  it("toDict omits extras key when undefined", () => {
    const t: BridgeTarget = { protocol: "mcp", endpoint: "https://mcp.example.com" };
    const d = bridgeTargetToDict(t);
    expect(Object.prototype.hasOwnProperty.call(d, "extras")).toBe(false);
  });
});

// ── AnnounceFrame node_kind alias ─────────────────────────────────────────────

describe("AnnounceFrame node_kind alias", () => {
  const BASE = {
    nid:          "urn:nps:node:example.com:data",
    addresses:    [{ host: "example.com", port: 17433, protocol: "nwp" }],
    capabilities: ["nwp/query"],
    ttl:          300,
    timestamp:    "2026-01-01T00:00:00Z",
    signature:    "ed25519:fake",
  };

  it("node_kind is parsed identically to node_roles", () => {
    const roles = ["memory", "bridge"];
    const withRoles = AnnounceFrame.fromDict({ ...BASE, node_roles: roles });
    const withKind  = AnnounceFrame.fromDict({ ...BASE, node_kind: roles });
    expect(withKind.node_roles).toEqual(withRoles.node_roles);
    expect(withKind.node_roles).toEqual(roles);
  });

  it("node_roles takes precedence over node_kind when both present", () => {
    const frame = AnnounceFrame.fromDict({
      ...BASE,
      node_roles: ["memory"],
      node_kind:  ["bridge"],
    });
    expect(frame.node_roles).toEqual(["memory"]);
  });
});
