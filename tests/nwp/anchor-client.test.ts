// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// Vitest test suite for AnchorNodeClient
// Covers: getSnapshot, subscribe, error handling, URL normalisation, wire body

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AnchorNodeClient,
  AnchorTopologyError,
  type TopologySnapshot,
  type TopologyEvent,
} from "../../src/nwp/anchor-client.js";

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Mock `fetch` to respond once with a JSON body and optional extra headers.
 */
function mockFetchOnce(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(body, {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

/**
 * Build a streaming Response whose body is the provided NDJSON lines.
 * The ReadableStream enqueues all lines in a single chunk, matching
 * how a small HTTP response might arrive.
 */
function ndjsonResponse(lines: string[]): Response {
  const body = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

// ── Fixture data ──────────────────────────────────────────────────────────────

const SNAPSHOT_FIXTURE: TopologySnapshot = {
  version: 42,
  anchor_nid: "anchor-abc123",
  cluster_size: 3,
  members: [
    {
      nid: "node-1",
      node_roles: ["worker"],
      activation_mode: "auto",
    },
    {
      nid: "node-2",
      node_roles: ["anchor", "worker"],
      activation_mode: "manual",
    },
  ],
};

const ACK_LINE = JSON.stringify({ type: "subscribed", stream_id: "test-stream-id" });

// ── beforeEach / afterEach ────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getSnapshot ───────────────────────────────────────────────────────────────

describe("getSnapshot — success path", () => {
  it("returns the first data element with correct fields", async () => {
    const capsBody = JSON.stringify({ data: [SNAPSHOT_FIXTURE] });
    mockFetchOnce(200, capsBody);

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const snap = await client.getSnapshot();

    expect(snap.version).toBe(42);
    expect(snap.anchor_nid).toBe("anchor-abc123");
    expect(snap.cluster_size).toBe(3);
    expect(snap.members).toHaveLength(2);
    expect(snap.members[0].nid).toBe("node-1");
  });

  it("sends correct wire body type and default topology fields", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
      );
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await client.getSnapshot();

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.type).toBe("topology.snapshot");
    expect(wireBody.topology.scope).toBe("cluster");
    expect(wireBody.topology.include).toContain("members");
  });

  it("sends scope=member and target_nid when targetNid is provided", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
      );
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await client.getSnapshot({ scope: "member", targetNid: "node-42" });

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.topology.scope).toBe("member");
    expect(wireBody.topology.target_nid).toBe("node-42");
  });

  it("sends depth field in wire body when provided", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
      );
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await client.getSnapshot({ depth: 2 });

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.topology.depth).toBe(2);
  });
});

describe("getSnapshot — error path", () => {
  it("throws AnchorTopologyError with nwpErrorCode and npsStatus for NPS error JSON on 404", async () => {
    const errBody = JSON.stringify({
      error: "NWP-TOPOLOGY-NOT-FOUND",
      status: "NPS-NOT-FOUND",
      message: "Cluster not found",
    });
    mockFetchOnce(404, errBody);

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await expect(client.getSnapshot()).rejects.toSatisfy((e: unknown) => {
      return (
        e instanceof AnchorTopologyError &&
        e.nwpErrorCode === "NWP-TOPOLOGY-NOT-FOUND" &&
        e.npsStatus === "NPS-NOT-FOUND"
      );
    });
  });

  it("throws AnchorTopologyError with npsStatus=HTTP-503 for plain body 503", async () => {
    mockFetchOnce(503, "Service Unavailable");

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await expect(client.getSnapshot()).rejects.toSatisfy((e: unknown) => {
      return (
        e instanceof AnchorTopologyError &&
        e.npsStatus === "HTTP-503"
      );
    });
  });

  it("throws an error when data array is empty", async () => {
    mockFetchOnce(200, JSON.stringify({ data: [] }));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await expect(client.getSnapshot()).rejects.toThrow();
  });

  it("throws when data array has more than one element", async () => {
    mockFetchOnce(200, JSON.stringify({ data: [SNAPSHOT_FIXTURE, SNAPSHOT_FIXTURE] }));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    await expect(client.getSnapshot()).rejects.toThrow();
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe("subscribe — success path", () => {
  it("emits member_joined, member_left, member_updated, anchor_state (4 events, ack skipped)", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_joined", seq: 1, payload: { nid: "n1", node_roles: ["worker"], activation_mode: "auto" } }),
      JSON.stringify({ event_type: "member_left",   seq: 2, payload: { nid: "n1" } }),
      JSON.stringify({ event_type: "member_updated", seq: 3, payload: { nid: "n2", changes: { activation_mode: "manual" } } }),
      JSON.stringify({ event_type: "anchor_state",   seq: 4, payload: { field: "leader", details: { nid: "n2" } } }),
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) {
      events.push(ev);
    }

    expect(events).toHaveLength(4);
    expect(events[0].kind).toBe("member_joined");
    expect(events[1].kind).toBe("member_left");
    expect(events[2].kind).toBe("member_updated");
    expect(events[3].kind).toBe("anchor_state");
  });

  it("terminates generator after resync_required event", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_joined", seq: 1, payload: { nid: "n1", node_roles: [], activation_mode: "auto" } }),
      JSON.stringify({ event_type: "resync_required", seq: 0, payload: { reason: "epoch_reset" } }),
      // This line should never be yielded
      JSON.stringify({ event_type: "member_joined", seq: 2, payload: { nid: "n2", node_roles: [], activation_mode: "auto" } }),
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) {
      events.push(ev);
    }

    expect(events).toHaveLength(2);
    expect(events[1].kind).toBe("resync_required");
  });

  it("throws AnchorTopologyError on mid-stream error envelope", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_joined", seq: 1, payload: { nid: "n1", node_roles: [], activation_mode: "auto" } }),
      JSON.stringify({ error: "NWP-TOPOLOGY-STREAM-ERROR", status: "NPS-INTERNAL", message: "stream died" }),
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const gen = client.subscribe();
    const firstEv = await gen.next();
    expect(firstEv.value?.kind).toBe("member_joined");

    await expect(gen.next()).rejects.toSatisfy((e: unknown) => {
      return (
        e instanceof AnchorTopologyError &&
        e.nwpErrorCode === "NWP-TOPOLOGY-STREAM-ERROR" &&
        e.npsStatus === "NPS-INTERNAL"
      );
    });
  });

  it("includes topology.filter in wire body when filter is provided", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(ndjsonResponse([ACK_LINE]));
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const filter = { node_roles: ["worker"], tags_any: ["gpu"] };
    // Drain generator
    for await (const _ of client.subscribe({ filter })) { /* empty */ }

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.topology.filter).toEqual(filter);
  });

  it("includes topology.since_version in wire body when sinceVersion is provided", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(ndjsonResponse([ACK_LINE]));
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    for await (const _ of client.subscribe({ sinceVersion: 99 })) { /* empty */ }

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.topology.since_version).toBe(99);
  });

  it("throws on non-2xx subscribe response", async () => {
    mockFetchOnce(503, "unavailable");

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const gen = client.subscribe();
    await expect(gen.next()).rejects.toBeInstanceOf(AnchorTopologyError);
  });

  it("wire body has type=topology.stream, action=subscribe, and a stream_id field", async () => {
    let captured: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      captured = init;
      return Promise.resolve(ndjsonResponse([ACK_LINE]));
    });

    const client = new AnchorNodeClient("http://anchor.local:8080");
    for await (const _ of client.subscribe()) { /* empty */ }

    const wireBody = JSON.parse(captured!.body as string);
    expect(wireBody.type).toBe("topology.stream");
    expect(wireBody.action).toBe("subscribe");
    expect(typeof wireBody.stream_id).toBe("string");
    expect(wireBody.stream_id.length).toBeGreaterThan(0);
  });
});

// ── URL normalisation ─────────────────────────────────────────────────────────

describe("URL normalisation", () => {
  it("strips trailing slash from baseUrl before building query URL", async () => {
    let capturedUrl: string | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((url) => {
      capturedUrl = url as string;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
      );
    });

    const client = new AnchorNodeClient("http://anchor.local:8080/");
    await client.getSnapshot();

    expect(capturedUrl).toBe("http://anchor.local:8080/query");
  });

  it("prepends pathPrefix to /query and /subscribe", async () => {
    let queryUrl: string | undefined;
    let subscribeUrl: string | undefined;

    vi.spyOn(global, "fetch")
      .mockImplementationOnce((url) => {
        queryUrl = url as string;
        return Promise.resolve(
          new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
        );
      })
      .mockImplementationOnce((url) => {
        subscribeUrl = url as string;
        return Promise.resolve(ndjsonResponse([ACK_LINE]));
      });

    const client = new AnchorNodeClient("http://anchor.local:8080", "/anchor");
    await client.getSnapshot();
    for await (const _ of client.subscribe()) { /* empty */ }

    expect(queryUrl).toBe("http://anchor.local:8080/anchor/query");
    expect(subscribeUrl).toBe("http://anchor.local:8080/anchor/subscribe");
  });

  it("strips trailing slash from pathPrefix", async () => {
    let capturedUrl: string | undefined;
    vi.spyOn(global, "fetch").mockImplementationOnce((url) => {
      capturedUrl = url as string;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [SNAPSHOT_FIXTURE] }), { status: 200 }),
      );
    });

    const client = new AnchorNodeClient("http://anchor.local:8080", "/anchor/");
    await client.getSnapshot();

    expect(capturedUrl).toBe("http://anchor.local:8080/anchor/query");
  });
});

// ── Discriminated union payload details ───────────────────────────────────────

describe("member_joined payload", () => {
  it("carries member.nid, member.node_roles, member.activation_mode", async () => {
    const payload = { nid: "node-xyz", node_roles: ["anchor"], activation_mode: "manual", joined_at: "2026-01-01T00:00:00Z" };
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_joined", seq: 5, payload }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind !== "member_joined") throw new Error("unexpected kind");
    expect(ev.member.nid).toBe("node-xyz");
    expect(ev.member.node_roles).toEqual(["anchor"]);
    expect(ev.member.activation_mode).toBe("manual");
    expect(ev.version).toBe(5);
  });
});

describe("member_left payload", () => {
  it("carries nid of the departing member", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_left", seq: 10, payload: { nid: "node-gone" } }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    const ev = events[0];
    if (ev.kind !== "member_left") throw new Error("unexpected kind");
    expect(ev.nid).toBe("node-gone");
    expect(ev.version).toBe(10);
  });
});

describe("member_updated payload", () => {
  it("carries nid and changes object", async () => {
    const changes = { activation_mode: "manual", tags: ["gpu"] };
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "member_updated", seq: 7, payload: { nid: "node-upd", changes } }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    const ev = events[0];
    if (ev.kind !== "member_updated") throw new Error("unexpected kind");
    expect(ev.nid).toBe("node-upd");
    expect(ev.changes.activation_mode).toBe("manual");
    expect(ev.changes.tags).toEqual(["gpu"]);
    expect(ev.version).toBe(7);
  });
});

describe("anchor_state payload", () => {
  it("carries field and details", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "anchor_state", seq: 3, payload: { field: "leader", details: { nid: "node-lead" } } }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    const ev = events[0];
    if (ev.kind !== "anchor_state") throw new Error("unexpected kind");
    expect(ev.field).toBe("leader");
    expect(ev.details).toEqual({ nid: "node-lead" });
    expect(ev.version).toBe(3);
  });
});

describe("resync_required payload", () => {
  it("carries reason string and version=0", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "resync_required", seq: 0, payload: { reason: "epoch_reset" } }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind !== "resync_required") throw new Error("unexpected kind");
    expect(ev.reason).toBe("epoch_reset");
    expect(ev.version).toBe(0);
  });
});

// ── Unknown event_type ────────────────────────────────────────────────────────

describe("unknown event_type", () => {
  it("silently skips unknown event_type and still yields the next valid event", async () => {
    const lines = [
      ACK_LINE,
      JSON.stringify({ event_type: "future_unknown_event", seq: 1, payload: {} }),
      JSON.stringify({ event_type: "member_left", seq: 2, payload: { nid: "n-valid" } }),
    ];
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ndjsonResponse(lines));

    const client = new AnchorNodeClient("http://anchor.local:8080");
    const events: TopologyEvent[] = [];
    for await (const ev of client.subscribe()) events.push(ev);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("member_left");
  });
});
