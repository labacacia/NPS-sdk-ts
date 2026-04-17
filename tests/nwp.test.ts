// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryFrame, ActionFrame, asyncActionResponseFromDict } from "../src/nwp/frames.js";
import { NwpClient } from "../src/nwp/client.js";
import { createDefaultRegistry } from "../src/setup.js";
import { NpsFrameCodec, EncodingTier } from "../src/core/index.js";
import { AnchorFrame, CapsFrame, StreamFrame } from "../src/ncp/frames.js";

// ── QueryFrame ────────────────────────────────────────────────────────────────

describe("QueryFrame", () => {
  it("round-trips via toDict / fromDict", () => {
    const f = new QueryFrame(
      "sha256:" + "a".repeat(64),
      { name: { $eq: "Alice" } },
      10,
      0,
      [{ field: "name", dir: "asc" }],
      ["id", "name"],
      { vector: [0.1, 0.2], topK: 5 },
      2,
    );
    const back = QueryFrame.fromDict(f.toDict());
    expect(back.anchorRef).toBe(f.anchorRef);
    expect(back.limit).toBe(10);
    expect(back.offset).toBe(0);
    expect(back.orderBy?.[0]?.field).toBe("name");
    expect(back.fields?.[1]).toBe("name");
    expect(back.vectorSearch?.topK).toBe(5);
    expect(back.depth).toBe(2);
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
    const f = new ActionFrame(
      "search",
      { q: "test" },
      true,
      "idem-key-1",
      5000,
    );
    const back = ActionFrame.fromDict(f.toDict());
    expect(back.actionId).toBe("search");
    expect(back.params?.["q"]).toBe("test");
    expect(back.async_).toBe(true);
    expect(back.idempotencyKey).toBe("idem-key-1");
    expect(back.timeoutMs).toBe(5000);
  });

  it("defaults async to false when not provided", () => {
    const f    = new ActionFrame("do-thing");
    const back = ActionFrame.fromDict(f.toDict());
    expect(back.async_).toBeFalsy();
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

  it("sendAnchor — POSTs and resolves on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new NwpClient("http://node.test");
    await expect(client.sendAnchor(new AnchorFrame(aid, schema))).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/anchor",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sendAnchor — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const client = new NwpClient("http://node.test");
    await expect(client.sendAnchor(new AnchorFrame(aid, schema))).rejects.toThrow("503");
  });

  it("query — decodes CapsFrame response", async () => {
    const capsFrame = new CapsFrame(aid, 1, [{ id: 42 }]);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.query(new QueryFrame(aid));
    expect(result).toBeInstanceOf(CapsFrame);
    expect(result.count).toBe(1);
  });

  it("query — throws when response is not CapsFrame", async () => {
    const anchorFrame = new AnchorFrame(aid, schema);
    const wire        = codec.encode(anchorFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    await expect(client.query(new QueryFrame(aid))).rejects.toThrow(TypeError);
  });

  it("query — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const client = new NwpClient("http://node.test");
    await expect(client.query(new QueryFrame(aid))).rejects.toThrow("404");
  });

  it("invoke — sync NPS frame response", async () => {
    const capsFrame = new CapsFrame(aid, 0, []);
    const wire      = codec.encode(capsFrame);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:          true,
      headers:     { get: () => "application/x-nps-frame" },
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(new ActionFrame("list"));
    expect(result).toBeInstanceOf(CapsFrame);
  });

  it("invoke — async response returns AsyncActionResponse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "t99", status: "queued" }),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(new ActionFrame("heavy", {}, true)) as { taskId: string };
    expect(result.taskId).toBe("t99");
  });

  it("invoke — sync JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:      true,
      headers: { get: () => "application/json" },
      json:    () => Promise.resolve({ result: "ok" }),
    }));
    const client = new NwpClient("http://node.test");
    const result = await client.invoke(new ActionFrame("ping")) as { result: string };
    expect(result.result).toBe("ok");
  });

  it("invoke — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = new NwpClient("http://node.test");
    await expect(client.invoke(new ActionFrame("ping"))).rejects.toThrow("500");
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
    for await (const f of client.stream(new QueryFrame(aid))) {
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
      for await (const _ of client.stream(new QueryFrame(aid))) { /* consume */ }
    }).rejects.toThrow(TypeError);
  });

  it("stream — returns immediately when body is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: null }));
    const client = new NwpClient("http://node.test");
    const frames: StreamFrame[] = [];
    for await (const f of client.stream(new QueryFrame(aid))) frames.push(f);
    expect(frames).toHaveLength(0);
  });

  it("stream — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const client = new NwpClient("http://node.test");
    await expect(async () => {
      for await (const _ of client.stream(new QueryFrame(aid))) { /* consume */ }
    }).rejects.toThrow("400");
  });

  it("trailing slash stripped from baseUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new NwpClient("http://node.test/");
    await client.sendAnchor(new AnchorFrame(aid, schema));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://node.test/anchor",
      expect.anything(),
    );
  });
});
