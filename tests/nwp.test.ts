// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryFrame, ActionFrame, SubscribeFrame, asyncActionResponseFromDict } from "../src/nwp/frames.js";
import { NwpClient } from "../src/nwp/client.js";
import { createDefaultRegistry } from "../src/setup.js";
import { NpsFrameCodec, EncodingTier } from "../src/core/index.js";
import { AnchorFrame, CapsFrame, StreamFrame } from "../src/ncp/frames.js";

// ── QueryFrame ────────────────────────────────────────────────────────────────

describe("QueryFrame", () => {
  it("round-trips via toDict / fromDict", () => {
    const f = new QueryFrame({
      anchorRef:    "sha256:" + "a".repeat(64),
      filter:       { name: { $eq: "Alice" } },
      limit:        10,
      cursor:       "tok_abc",
      order:        [{ field: "name", dir: "ASC" }],
      fields:       ["id", "name"],
      vectorSearch: { vector: [0.1, 0.2], top_k: 5, field: "embedding" },
      depth:        2,
    });
    const back = QueryFrame.fromDict(f.toDict());
    expect(back.anchorRef).toBe(f.anchorRef);
    expect(back.limit).toBe(10);
    expect(back.cursor).toBe("tok_abc");
    expect(back.order?.[0]?.field).toBe("name");
    expect(back.fields?.[1]).toBe("name");
    expect(back.vectorSearch?.top_k).toBe(5);
    expect(back.vectorSearch?.field).toBe("embedding");
    expect(back.depth).toBe(2);
  });

  it("round-trips optional fields: type, requestId, tokenBudget, stream", () => {
    const f = new QueryFrame({
      anchorRef:   "sha256:" + "c".repeat(64),
      type:        "topology.snapshot",
      requestId:   "550e8400-e29b-41d4-a716-446655440001",
      tokenBudget: 800,
      stream:      true,
      autoAnchor:  false,
    });
    const back = QueryFrame.fromDict(f.toDict());
    expect(back.type).toBe("topology.snapshot");
    expect(back.requestId).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(back.tokenBudget).toBe(800);
    expect(back.stream).toBe(true);
    expect(back.autoAnchor).toBe(false);
  });

  it("handles all-optional constructor (empty query)", () => {
    const f    = new QueryFrame();
    const back = QueryFrame.fromDict(f.toDict());
    expect(back.anchorRef).toBeUndefined();
    expect(back.limit).toBeUndefined();
  });
});

// ── ActionFrame ───────────────────────────────────────────────────────────────

describe("ActionFrame", () => {
  it("round-trips via toDict / fromDict", () => {
    const f = new ActionFrame({
      actionId:       "search",
      params:         { q: "test" },
      async_:         true,
      idempotencyKey: "idem-key-1",
      timeoutMs:      5000,
    });
    const back = ActionFrame.fromDict(f.toDict());
    expect(back.actionId).toBe("search");
    expect(back.params?.["q"]).toBe("test");
    expect(back.async_).toBe(true);
    expect(back.idempotencyKey).toBe("idem-key-1");
    expect(back.timeoutMs).toBe(5000);
  });

  it("round-trips optional fields: callbackUrl, priority, requestId", () => {
    const f = new ActionFrame({
      actionId:    "order.create",
      callbackUrl: "https://agent.example.com/cb",
      priority:    "high",
      requestId:   "550e8400-e29b-41d4-a716-446655440002",
    });
    const back = ActionFrame.fromDict(f.toDict());
    expect(back.callbackUrl).toBe("https://agent.example.com/cb");
    expect(back.priority).toBe("high");
    expect(back.requestId).toBe("550e8400-e29b-41d4-a716-446655440002");
  });

  it("defaults async to false when not provided", () => {
    const f    = new ActionFrame({ actionId: "do-thing" });
    const back = ActionFrame.fromDict(f.toDict());
    expect(back.async_).toBeFalsy();
  });
});

// ── SubscribeFrame ────────────────────────────────────────────────────────────

describe("SubscribeFrame", () => {
  it("round-trips subscribe action via toDict / fromDict", () => {
    const f = new SubscribeFrame({
      action:            "subscribe",
      streamId:          "550e8400-e29b-41d4-a716-446655440003",
      anchorRef:         "sha256:" + "d".repeat(64),
      heartbeatInterval: 30,
      resumeFromSeq:     42n,
    });
    const back = SubscribeFrame.fromDict(f.toDict());
    expect(back.action).toBe("subscribe");
    expect(back.streamId).toBe("550e8400-e29b-41d4-a716-446655440003");
    expect(back.anchorRef).toBe(f.anchorRef);
    expect(back.heartbeatInterval).toBe(30);
    expect(back.resumeFromSeq).toBe(42n);
  });

  it("round-trips type field for reserved subscribe types", () => {
    const f    = new SubscribeFrame({ action: "subscribe", streamId: "sid1", type: "topology.stream" });
    const back = SubscribeFrame.fromDict(f.toDict());
    expect(back.type).toBe("topology.stream");
  });

  it("round-trips unsubscribe action", () => {
    const f    = new SubscribeFrame({ action: "unsubscribe", streamId: "sid2" });
    const back = SubscribeFrame.fromDict(f.toDict());
    expect(back.action).toBe("unsubscribe");
    expect(back.resumeFromSeq).toBeUndefined();
  });
});

// ── asyncActionResponseFromDict ───────────────────────────────────────────────

describe("asyncActionResponseFromDict", () => {
  it("parses full response", () => {
    const r = asyncActionResponseFromDict({ task_id: "t1", status: "accepted", poll_url: "/poll/t1" });
    expect(r.taskId).toBe("t1");
    expect(r.status).toBe("accepted");
    expect(r.pollUrl).toBe("/poll/t1");
  });

  it("omits pollUrl when null", () => {
    const r = asyncActionResponseFromDict({ task_id: "t2", status: "accepted", poll_url: null });
    expect(r.pollUrl).toBeUndefined();
  });
});

// ── NwpClient ─────────────────────────────────────────────────────────────────

describe("NwpClient", () => {
  const registry = createDefaultRegistry();
  const codec    = new NpsFrameCodec(registry);
  const aid      = "sha256:" + "b".repeat(64);
  const schema   = { fields: [{ name: "id", type: "uint64" }] };

  beforeEach(() => { vi.restoreAllMocks(); });

  it("trailing slash stripped from baseUrl", async () => {
    const capsFrame = new CapsFrame(aid, 1, [{ id: 1 }]);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test/");
    await client.query(new QueryFrame({ anchorRef: aid }));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/query",
      expect.anything(),
    );
  });

  it("query — decodes CapsFrame response", async () => {
    const capsFrame = new CapsFrame(aid, 1, [{ id: 42 }]);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.query(new QueryFrame({ anchorRef: aid }));
    expect(result).toBeInstanceOf(CapsFrame);
    expect(result.count).toBe(1);
  });

  it("query — sends application/nwp-frame Content-Type", async () => {
    const capsFrame = new CapsFrame(aid, 0, []);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    await client.query(new QueryFrame({ anchorRef: aid }));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/nwp-frame" }),
      }),
    );
  });

  it("query — throws when response is not CapsFrame", async () => {
    const anchorFrame = new AnchorFrame(aid, schema);
    const wire        = codec.encode(anchorFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    await expect(client.query(new QueryFrame({ anchorRef: aid }))).rejects.toThrow(TypeError);
  });

  it("query — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const client = new NwpClient("http://node.test");
    await expect(client.query(new QueryFrame({ anchorRef: aid }))).rejects.toThrow("404");
  });

  it("invoke — sync NWP capsule response", async () => {
    const capsFrame = new CapsFrame(aid, 0, []);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      headers:     { get: () => "application/nwp-capsule" },
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(new ActionFrame({ actionId: "list" }));
    expect(result).toBeInstanceOf(CapsFrame);
  });

  it("invoke — async response returns AsyncActionResponse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "t99", status: "queued" }),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(
      new ActionFrame({ actionId: "heavy", async_: true }),
    ) as { taskId: string };
    expect(result.taskId).toBe("t99");
  });

  it("invoke — sync JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:      true,
      headers: { get: () => "application/json" },
      json:    () => Promise.resolve({ result: "ok" }),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(
      new ActionFrame({ actionId: "ping" }),
    ) as { result: string };
    expect(result.result).toBe("ok");
  });

  it("invoke — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = new NwpClient("http://node.test");
    await expect(client.invoke(new ActionFrame({ actionId: "ping" }))).rejects.toThrow("500");
  });

  it("stream — yields StreamFrames and stops at isLast", async () => {
    const s0   = new StreamFrame("s1", 0, false, [{ id: 1 }]);
    const s1   = new StreamFrame("s1", 1, true,  [{ id: 2 }]);
    const w0   = codec.encode(s0);
    const w1   = codec.encode(s1);

    async function* mockBody() { yield w0; yield w1; }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: mockBody() }));
    const client  = new NwpClient("http://node.test");
    const frames: StreamFrame[] = [];
    for await (const f of client.stream(new QueryFrame({ anchorRef: aid }))) {
      frames.push(f);
    }
    expect(frames).toHaveLength(2);
    expect(frames[0]!.seq).toBe(0);
    expect(frames[1]!.isLast).toBe(true);
  });

  it("stream — throws when chunk is not a StreamFrame", async () => {
    const anchor = new AnchorFrame(aid, schema);
    const wire   = codec.encode(anchor);
    async function* mockBody() { yield wire; }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: mockBody() }));
    const client = new NwpClient("http://node.test");
    await expect(async () => {
      for await (const _ of client.stream(new QueryFrame({ anchorRef: aid }))) { /* consume */ }
    }).rejects.toThrow(TypeError);
  });

  it("stream — returns immediately when body is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: null }));
    const client = new NwpClient("http://node.test");
    const frames: StreamFrame[] = [];
    for await (const f of client.stream(new QueryFrame({ anchorRef: aid }))) frames.push(f);
    expect(frames).toHaveLength(0);
  });

  it("stream — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const client = new NwpClient("http://node.test");
    await expect(async () => {
      for await (const _ of client.stream(new QueryFrame({ anchorRef: aid }))) { /* consume */ }
    }).rejects.toThrow("400");
  });

  it("subscribe — returns CapsFrame ack", async () => {
    const ackFrame = new CapsFrame("nps:system:subscribe:ack", 1, [{ stream_id: "sid1", status: "subscribed" }]);
    const wire     = codec.encode(ackFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.subscribe(
      new SubscribeFrame({ action: "subscribe", streamId: "sid1", anchorRef: aid }),
    );
    expect(result).toBeInstanceOf(CapsFrame);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fetchManifest — parses JSON from /.nwm", async () => {
    const manifest = { nwp: "0.2", node_id: "urn:nps:node:test:node1", node_type: "memory" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(manifest),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.fetchManifest();
    expect(result.nwp).toBe("0.2");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/.nwm",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/nwp-manifest+json" }) }),
    );
  });

  it("listActions — returns JSON from /actions", async () => {
    const actions = [{ action_id: "search" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(actions),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.listActions();
    expect(result).toEqual(actions);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/actions",
      expect.anything(),
    );
  });
});
