// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// Tests for MemoryNodeServer (NPS-2 §2.1, §4, §5).

import { describe, expect, it } from "vitest";
import {
  MemoryNodeServer,
  type IMemoryNodeProvider,
  type MemoryNodeOptions,
  type MemoryNodeQueryResult,
  type MemoryNodeRequest,
} from "../src/nwp/memory-node-server.js";
import { QueryFrame } from "../src/nwp/frames.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPTS: MemoryNodeOptions = {
  nodeId:      "urn:nps:node:test.example.com:products",
  displayName: "Products",
  schema: {
    fields: [
      { name: "id",    type: "string",  nullable: false },
      { name: "name",  type: "string",  nullable: false },
      { name: "price", type: "number",  nullable: true  },
    ],
  },
  pathPrefix:   "/products",
  defaultLimit: 20,
  maxLimit:     100,
};

const ROWS = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 19.99 },
];

function makeProvider(rows = ROWS): IMemoryNodeProvider {
  return {
    async query(_frame: QueryFrame, _opts: MemoryNodeOptions): Promise<MemoryNodeQueryResult> {
      return { rows, nextCursor: undefined };
    },
  };
}

function makeRequest(opts: Partial<MemoryNodeRequest> & { subPath: string }): MemoryNodeRequest {
  return {
    method:  opts.method ?? "GET",
    subPath: opts.subPath,
    headers: opts.headers ?? {},
    body:    opts.body ?? new Uint8Array(),
  };
}

const enc = new TextEncoder();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryNodeServer", () => {

  it("GET /.nwm returns node manifest with correct fields", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({ subPath: "/.nwm" }));

    expect(resp.status).toBe(200);
    expect(resp.headers["Content-Type"]).toContain("application/json");
    const body = JSON.parse(resp.body);
    expect(body.node_id).toBe(OPTS.nodeId);
    expect(body.node_type).toBe("memory");
    expect(body.capabilities.query).toBe(true);
    expect(body.endpoints.query).toBe("/products/query");
  });

  it("GET /.schema returns schema JSON and X-NWP-Schema header", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({ subPath: "/.schema" }));

    expect(resp.status).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.fields).toHaveLength(3);
    expect(resp.headers["X-NWP-Schema"]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("anchor_id is deterministic across server instances", async () => {
    const a = new MemoryNodeServer(makeProvider(), OPTS);
    const b = new MemoryNodeServer(makeProvider(), OPTS);
    const ra = await a.handle(makeRequest({ subPath: "/.schema" }));
    const rb = await b.handle(makeRequest({ subPath: "/.schema" }));
    expect(ra.headers["X-NWP-Schema"]).toBe(rb.headers["X-NWP-Schema"]);
  });

  it("POST /query returns CapsFrame with rows", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const body = enc.encode(JSON.stringify({ anchor_ref: null, filter: {}, limit: 10 }));
    const resp = await srv.handle(makeRequest({ method: "POST", subPath: "/query", body }));

    expect(resp.status).toBe(200);
    const caps = JSON.parse(resp.body);
    expect(caps.frame).toBe("0x04");
    expect(caps.count).toBe(2);
    expect(caps.data).toHaveLength(2);
    expect(caps.anchor_ref).toMatch(/^sha256:/);
  });

  it("POST /query enforces maxLimit", async () => {
    let capturedFrame: QueryFrame | undefined;
    const provider: IMemoryNodeProvider = {
      async query(frame, _opts) {
        capturedFrame = frame;
        return { rows: ROWS };
      },
    };
    const srv  = new MemoryNodeServer(provider, { ...OPTS, maxLimit: 5 });
    const body = enc.encode(JSON.stringify({ limit: 200 }));
    await srv.handle(makeRequest({ method: "POST", subPath: "/query", body }));
    expect(capturedFrame?.limit).toBe(5);
  });

  it("POST /query rejects invalid JSON with 400", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({
      method: "POST", subPath: "/query", body: enc.encode("not-json"),
    }));
    expect(resp.status).toBe(400);
    const err = JSON.parse(resp.body);
    expect(err.frame).toBe("0xFE");
    expect(err.error).toBe("NWP-QUERY-FILTER-INVALID");
  });

  it("POST /query returns 500 when provider throws", async () => {
    const provider: IMemoryNodeProvider = {
      async query() { throw new Error("DB connection lost"); },
    };
    const srv  = new MemoryNodeServer(provider, OPTS);
    const resp = await srv.handle(makeRequest({ method: "POST", subPath: "/query",
      body: enc.encode("{}") }));
    expect(resp.status).toBe(500);
    const err = JSON.parse(resp.body);
    expect(err.error).toBe("NWP-NODE-UNAVAILABLE");
  });

  it("GET /query returns 405 Method Not Allowed", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({ method: "GET", subPath: "/query" }));
    expect(resp.status).toBe(405);
  });

  it("POST /stream returns NDJSON with sentinel final chunk", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({
      method: "POST", subPath: "/stream", body: enc.encode("{}"),
    }));
    expect(resp.status).toBe(200);
    expect(resp.headers["Content-Type"]).toContain("ndjson");
    const lines = resp.body.trim().split("\n").map(l => JSON.parse(l));
    expect(lines.at(-1)?.is_last).toBe(true);
    expect(lines[0]?.anchor_ref).toMatch(/^sha256:/);
  });

  it("requires X-NWP-Agent when requireAuth=true", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), { ...OPTS, requireAuth: true });
    const resp = await srv.handle(makeRequest({ subPath: "/.nwm" }));
    expect(resp.status).toBe(401);
  });

  it("allows request when X-NWP-Agent is present and requireAuth=true", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), { ...OPTS, requireAuth: true });
    const resp = await srv.handle(makeRequest({
      subPath: "/.nwm", headers: { "x-nwp-agent": "urn:nps:agent:test" },
    }));
    expect(resp.status).toBe(200);
  });

  it("honours X-NWP-Budget and trims rows", async () => {
    // Budget of 1 token (~4 bytes) forces empty result
    const srv  = new MemoryNodeServer(makeProvider(ROWS), OPTS);
    const resp = await srv.handle(makeRequest({
      method: "POST", subPath: "/query",
      headers: { "x-nwp-budget": "1" },
      body: enc.encode("{}"),
    }));
    const caps = JSON.parse(resp.body);
    expect(caps.count).toBe(0);
  });

  it("returns 404 for unknown sub-paths", async () => {
    const srv  = new MemoryNodeServer(makeProvider(), OPTS);
    const resp = await srv.handle(makeRequest({ subPath: "/unknown" }));
    expect(resp.status).toBe(404);
  });

  it("NWM anchor_ref matches /.schema X-NWP-Schema header", async () => {
    const srv    = new MemoryNodeServer(makeProvider(), OPTS);
    const schema = await srv.handle(makeRequest({ subPath: "/.schema" }));
    const query  = await srv.handle(makeRequest({
      method: "POST", subPath: "/query", body: enc.encode("{}"),
    }));
    const anchorFromSchema = schema.headers["X-NWP-Schema"];
    const caps = JSON.parse(query.body);
    expect(caps.anchor_ref).toBe(anchorFromSchema);
  });
});
