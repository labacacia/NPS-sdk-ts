// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnchorActionError,
  AnchorNodeApp,
  InMemoryAnchorTopologyService,
  type AnchorInvokeHandler,
  type AnchorNodeOptions,
} from "../src/nwp/anchor-server.js";
import { AnchorNodeClient, type MemberInfo, type TopologyEvent } from "../src/nwp/anchor-client.js";
import { defaultReputationEvaluator, type ReputationPolicy } from "../src/nwp/reputation.js";
import * as EC from "../src/nwp/nwp-error-codes.js";

const PREFIX = "/gw";
const ANCHOR_NID = "urn:nps:node:anchor.example.com:svc";
const AGENT = "urn:nps:agent:tester";

function baseOptions(over: Partial<AnchorNodeOptions> = {}): AnchorNodeOptions {
  return {
    nodeId: ANCHOR_NID,
    pathPrefix: PREFIX,
    actions: { "orders.create": { resultAnchor: "nps:orders:result", estimatedCgn: 10 } },
    ...over,
  };
}

function members(): MemberInfo[] {
  return [
    { nid: "urn:nps:node:w1", node_roles: ["worker"], activation_mode: "resident" },
    { nid: "urn:nps:node:w2", node_roles: ["worker"], activation_mode: "ephemeral", tags: ["gpu"] },
  ];
}

function req(app: AnchorNodeApp, path: string, init?: RequestInit & { agent?: string | null }): Promise<Response> {
  const agent = init?.agent === undefined ? AGENT : init.agent;
  const headers = new Headers(init?.headers);
  if (agent) headers.set("X-NWP-Agent", agent);
  return app.fetch(new Request(`http://anchor${path}`, { ...init, headers }));
}

const okHandler: AnchorInvokeHandler = async (actionId, _frame, ctx) =>
  ({ order_id: "o-123", action: actionId, agent: ctx.agentNid });

describe("anchor-server: manifest", () => {
  it("nwm basic shape", async () => {
    const app = new AnchorNodeApp(baseOptions({ displayName: "Svc" }));
    const r = await req(app, `${PREFIX}/.nwm`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/nwp-manifest+json");
    expect(r.headers.get("x-nwp-node-type")).toBe("anchor");
    const m = await r.json();
    expect(m.nwp).toBe("0.4");
    expect(m.node_type).toBe("anchor");
    expect(m.auth).toEqual({ required: true, identity_type: "nip-cert" });
    expect(m.endpoints).toEqual({ invoke: `${PREFIX}/invoke`, schema: `${PREFIX}/.schema` });
    expect(m.actions[0].action_id).toBe("orders.create");
  });

  it("splices cgn / reputation / trust", async () => {
    const policy: ReputationPolicy = { logSources: ["https://log"], banOn: [{ incident: "*", severity: ">=critical" }] };
    const app = new AnchorNodeApp(baseOptions({ cgnLimit: 500, reputationPolicy: policy, trustAnchors: ["urn:nps:ca:root"] }));
    const m = await (await req(app, `${PREFIX}/.nwm`)).json();
    expect(m.token_budget).toEqual({ cgn_limit: 500, profile: "cgn.v1" });
    expect(m.reputation_policy.log_sources).toEqual(["https://log"]);
    expect(m.trust_anchors).toEqual(["urn:nps:ca:root"]);
  });
});

describe("anchor-server: auth", () => {
  it("missing agent → 401", async () => {
    const app = new AnchorNodeApp(baseOptions());
    const r = await req(app, `${PREFIX}/.nwm`, { agent: null });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe(EC.NWP_AUTH_NID_SCOPE_VIOLATION);
  });
  it("auth disabled allows anonymous", async () => {
    const app = new AnchorNodeApp(baseOptions({ requireAuth: false }));
    const r = await req(app, `${PREFIX}/.nwm`, { agent: null });
    expect(r.status).toBe(200);
    expect((await r.json()).auth.identity_type).toBe("none");
  });
  it("unknown path → 404", async () => {
    const app = new AnchorNodeApp(baseOptions());
    expect((await req(app, `${PREFIX}/nope`)).status).toBe(404);
  });
});

describe("anchor-server: topology via real AnchorNodeClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetchTo(app: AnchorNodeApp): void {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input as string, init)));
  }

  it("snapshot round-trip", async () => {
    const topo = new InMemoryAnchorTopologyService(ANCHOR_NID, members(), 7);
    const app = new AnchorNodeApp(baseOptions({ requireAuth: false }), { topologyService: topo });
    stubFetchTo(app);
    const client = new AnchorNodeClient("http://anchor", PREFIX);
    const snap = await client.getSnapshot();
    expect(snap.version).toBe(7);
    expect(snap.anchor_nid).toBe(ANCHOR_NID);
    expect(snap.cluster_size).toBe(2);
    expect(snap.members.map((m) => m.nid).sort()).toEqual(["urn:nps:node:w1", "urn:nps:node:w2"]);
  });

  it("stream round-trip yields events then resync", async () => {
    const events: TopologyEvent[] = [
      { kind: "member_joined", version: 8, member: members()[0] },
      { kind: "resync_required", version: 0, reason: "rebased" },
    ];
    const topo = new InMemoryAnchorTopologyService(ANCHOR_NID, members(), 1, events);
    const app = new AnchorNodeApp(baseOptions({ requireAuth: false }), { topologyService: topo });
    stubFetchTo(app);
    const client = new AnchorNodeClient("http://anchor", PREFIX);
    const received: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) received.push(ev);
    expect(received.length).toBe(2);
    expect(received[0].kind).toBe("member_joined");
    expect(received[1].kind).toBe("resync_required");
  });

  it("reserved type unsupported → 501", async () => {
    const topo = new InMemoryAnchorTopologyService(ANCHOR_NID, members());
    const app = new AnchorNodeApp(baseOptions(), { topologyService: topo });
    const r = await req(app, `${PREFIX}/query`, {
      method: "POST", body: JSON.stringify({ type: "topology.bogus", topology: {} }),
    });
    expect(r.status).toBe(501);
    expect((await r.json()).error).toBe(EC.NWP_RESERVED_TYPE_UNSUPPORTED);
  });

  it("no topology service → 501", async () => {
    const app = new AnchorNodeApp(baseOptions());
    const r = await req(app, `${PREFIX}/query`, {
      method: "POST", body: JSON.stringify({ type: "topology.snapshot", topology: { scope: "cluster" } }),
    });
    expect(r.status).toBe(501);
    expect((await r.json()).error).toBe(EC.NWP_NODE_UNAVAILABLE);
  });

  it("member scope requires target_nid", async () => {
    const topo = new InMemoryAnchorTopologyService(ANCHOR_NID, members());
    const app = new AnchorNodeApp(baseOptions(), { topologyService: topo });
    const r = await req(app, `${PREFIX}/query`, {
      method: "POST", body: JSON.stringify({ type: "topology.snapshot", topology: { scope: "member" } }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe(EC.NWP_TOPOLOGY_UNSUPPORTED_SCOPE);
  });

  it("capability gate", async () => {
    const topo = new InMemoryAnchorTopologyService(ANCHOR_NID, members());
    const app = new AnchorNodeApp(baseOptions({ requireTopologyCapability: true }), { topologyService: topo });
    const denied = await req(app, `${PREFIX}/query`, {
      method: "POST", body: JSON.stringify({ type: "topology.snapshot", topology: {} }),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe(EC.NWP_TOPOLOGY_UNAUTHORIZED);
    const ok = await req(app, `${PREFIX}/query`, {
      method: "POST",
      headers: { "X-NWP-Capabilities": "topology:read" },
      body: JSON.stringify({ type: "topology.snapshot", topology: {} }),
    });
    expect(ok.status).toBe(200);
  });
});

describe("anchor-server: invoke", () => {
  it("sync invoke returns caps", async () => {
    const app = new AnchorNodeApp(baseOptions(), { invokeHandler: okHandler });
    const r = await req(app, `${PREFIX}/invoke`, {
      method: "POST", body: JSON.stringify({ action_id: "orders.create", params: { x: 1 } }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/nwp-capsule");
    const body = await r.json();
    expect(body.count).toBe(1);
    expect(body.data[0].order_id).toBe("o-123");
    expect(body.data[0].agent).toBe(AGENT);
  });

  it("unknown action → 404", async () => {
    const app = new AnchorNodeApp(baseOptions(), { invokeHandler: okHandler });
    const r = await req(app, `${PREFIX}/invoke`, { method: "POST", body: JSON.stringify({ action_id: "nope.verb" }) });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe(EC.NWP_ACTION_NOT_FOUND);
  });

  it("handler error envelope", async () => {
    const bad: AnchorInvokeHandler = async () => {
      throw new AnchorActionError(422, "NPS-CLIENT-BAD-REQUEST", EC.NWP_ACTION_PARAMS_INVALID, "bad params");
    };
    const app = new AnchorNodeApp(baseOptions(), { invokeHandler: bad });
    const r = await req(app, `${PREFIX}/invoke`, { method: "POST", body: JSON.stringify({ action_id: "orders.create" }) });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toBe(EC.NWP_ACTION_PARAMS_INVALID);
  });

  it("cgn limit pre-check", async () => {
    const app = new AnchorNodeApp(baseOptions(), { invokeHandler: okHandler });
    const r = await req(app, `${PREFIX}/invoke`, {
      method: "POST", headers: { "X-NWP-Budget": "5" }, body: JSON.stringify({ action_id: "orders.create" }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe(EC.NWP_CGN_LIMIT_EXCEEDED);
  });

  it("no handler → 501", async () => {
    const app = new AnchorNodeApp(baseOptions());
    const r = await req(app, `${PREFIX}/invoke`, { method: "POST", body: JSON.stringify({ action_id: "orders.create" }) });
    expect(r.status).toBe(501);
  });

  it("async invoke → 202", async () => {
    const app = new AnchorNodeApp(
      { nodeId: ANCHOR_NID, pathPrefix: PREFIX, actions: { "orders.create": { async_: true } } },
      { invokeHandler: okHandler },
    );
    const r = await req(app, `${PREFIX}/invoke`, {
      method: "POST", body: JSON.stringify({ action_id: "orders.create", async: true }),
    });
    expect(r.status).toBe(202);
    expect((await r.json()).status).toBe("pending");
  });

  it("method not allowed → 405", async () => {
    const app = new AnchorNodeApp(baseOptions(), { invokeHandler: okHandler });
    expect((await req(app, `${PREFIX}/invoke`)).status).toBe(405);
  });

  it("reputation ban blocks invoke", async () => {
    const evaluator = defaultReputationEvaluator();
    // Seed the reference evaluator's in-process cache with a raw log entry so the NID resolves
    // without an HTTP log query (cache shape: { expiresAt, entries: [{incident,severity,timestamp}] }).
    (evaluator as unknown as { _cache: Map<string, unknown> })._cache.set(AGENT, {
      expiresAt: Date.now() + 3_600_000,
      entries: [{ incident: "impersonation-claim", severity: "critical", timestamp: new Date().toISOString() }],
    });
    const policy: ReputationPolicy = { cacheTtlSeconds: 300, banOn: [{ incident: "*", severity: ">=critical" }] };
    const app = new AnchorNodeApp(baseOptions({ reputationPolicy: policy }),
      { invokeHandler: okHandler, reputationEvaluator: evaluator });
    const r = await req(app, `${PREFIX}/invoke`, { method: "POST", body: JSON.stringify({ action_id: "orders.create" }) });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(EC.NWP_REPUTATION_BANNED);
  });
});
