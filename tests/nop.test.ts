// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TaskState, TaskPriority, BackoffStrategy, AggregateStrategy,
  computeDelayMs,
} from "../src/nop/models.js";
import { TaskFrame, DelegateFrame, SyncFrame, AlignStreamFrame } from "../src/nop/frames.js";
import { NopClient, NopTaskStatus } from "../src/nop/client.js";
import { createFullRegistry } from "../src/setup.js";
import { NpsFrameCodec } from "../src/core/index.js";

// ── computeDelayMs ────────────────────────────────────────────────────────────

describe("computeDelayMs", () => {
  it("FIXED strategy ignores attempt", () => {
    const p = { maxRetries: 3, backoff: BackoffStrategy.FIXED, baseDelayMs: 500 };
    expect(computeDelayMs(p, 0)).toBe(500);
    expect(computeDelayMs(p, 5)).toBe(500);
  });

  it("LINEAR scales with attempt", () => {
    const p = { maxRetries: 3, backoff: BackoffStrategy.LINEAR, baseDelayMs: 1000 };
    expect(computeDelayMs(p, 0)).toBe(1000);
    expect(computeDelayMs(p, 2)).toBe(3000);
  });

  it("EXPONENTIAL doubles each attempt", () => {
    const p = { maxRetries: 5, backoff: BackoffStrategy.EXPONENTIAL, baseDelayMs: 1000 };
    expect(computeDelayMs(p, 0)).toBe(1000);
    expect(computeDelayMs(p, 1)).toBe(2000);
    expect(computeDelayMs(p, 3)).toBe(8000);
  });

  it("caps at maxDelayMs", () => {
    const p = { maxRetries: 5, backoff: BackoffStrategy.EXPONENTIAL, baseDelayMs: 1000, maxDelayMs: 5000 };
    expect(computeDelayMs(p, 10)).toBe(5000);
  });

  it("defaults base=1000 cap=30000", () => {
    const p = { maxRetries: 3, backoff: BackoffStrategy.FIXED };
    expect(computeDelayMs(p, 0)).toBe(1000);
  });
});

// ── TaskFrame ─────────────────────────────────────────────────────────────────

describe("TaskFrame", () => {
  const dag = { nodes: [{ id: "n1", action: "search", agent: "urn:nps:node:a:1" }], edges: [] };

  it("round-trips via toDict / fromDict", () => {
    const f = new TaskFrame(
      "task-1", dag, 5000, "https://cb.example.com/hook",
      { sessionKey: "sk-1", traceId: "tr-1" }, TaskPriority.HIGH, 1,
    );
    const back = TaskFrame.fromDict(f.toDict());
    expect(back.taskId).toBe("task-1");
    expect(back.timeoutMs).toBe(5000);
    expect(back.callbackUrl).toBe("https://cb.example.com/hook");
    expect(back.priority).toBe(TaskPriority.HIGH);
    expect(back.depth).toBe(1);
  });

  it("optional fields default to undefined", () => {
    const f    = new TaskFrame("t2", dag);
    const back = TaskFrame.fromDict(f.toDict());
    expect(back.timeoutMs).toBeUndefined();
    expect(back.callbackUrl).toBeUndefined();
    expect(back.priority).toBeUndefined();
  });

  it("codec round-trip (MsgPack)", () => {
    const registry = createFullRegistry();
    const codec    = new NpsFrameCodec(registry);
    const f        = new TaskFrame("t3", dag);
    const back     = codec.decode(codec.encode(f)) as TaskFrame;
    expect(back).toBeInstanceOf(TaskFrame);
    expect(back.taskId).toBe("t3");
  });
});

// ── DelegateFrame ─────────────────────────────────────────────────────────────

describe("DelegateFrame", () => {
  it("round-trips via toDict / fromDict", () => {
    const f = new DelegateFrame(
      "task-1", "sub-1", "classify", "urn:nps:node:a:1",
      { text: "hello" }, { model: "gpt-4" }, "idem-x",
    );
    const back = DelegateFrame.fromDict(f.toDict());
    expect(back.subtaskId).toBe("sub-1");
    expect(back.action).toBe("classify");
    expect(back.inputs?.["text"]).toBe("hello");
    expect(back.params?.["model"]).toBe("gpt-4");
    expect(back.idempotencyKey).toBe("idem-x");
  });

  it("optional fields default to undefined", () => {
    const f    = new DelegateFrame("t1", "s1", "act", "urn:nps:node:a:1");
    const back = DelegateFrame.fromDict(f.toDict());
    expect(back.inputs).toBeUndefined();
    expect(back.params).toBeUndefined();
    expect(back.idempotencyKey).toBeUndefined();
  });
});

// ── SyncFrame ─────────────────────────────────────────────────────────────────

describe("SyncFrame", () => {
  it("round-trips via toDict / fromDict", () => {
    const f = new SyncFrame(
      "task-1", "sync-1", ["sub-a", "sub-b"], 1,
      AggregateStrategy.FASTEST_K, 3000,
    );
    const back = SyncFrame.fromDict(f.toDict());
    expect(back.syncId).toBe("sync-1");
    expect(back.waitFor).toEqual(["sub-a", "sub-b"]);
    expect(back.minRequired).toBe(1);
    expect(back.aggregate).toBe(AggregateStrategy.FASTEST_K);
    expect(back.timeoutMs).toBe(3000);
  });

  it("defaults minRequired=0 and aggregate=merge", () => {
    const f    = new SyncFrame("t1", "s1", ["a"]);
    const back = SyncFrame.fromDict(f.toDict());
    expect(back.minRequired).toBe(0);
    expect(back.aggregate).toBe("merge");
  });
});

// ── AlignStreamFrame ──────────────────────────────────────────────────────────

describe("AlignStreamFrame", () => {
  it("round-trips via toDict / fromDict with error", () => {
    const f = new AlignStreamFrame(
      "stream-1", "task-1", "sub-1", 3, true, "urn:nps:node:a:1",
      { score: 0.9 }, { errorCode: "NOP-DELEGATE-FAILED", message: "timeout" }, 10,
    );
    const back = AlignStreamFrame.fromDict(f.toDict());
    expect(back.streamId).toBe("stream-1");
    expect(back.seq).toBe(3);
    expect(back.isFinal).toBe(true);
    expect(back.senderNid).toBe("urn:nps:node:a:1");
    expect(back.error?.errorCode).toBe("NOP-DELEGATE-FAILED");
    expect(back.error?.message).toBe("timeout");
    expect(back.windowSize).toBe(10);
  });

  it("handles null error field", () => {
    const f    = new AlignStreamFrame("s1", "t1", "st1", 0, false, "urn:nps:node:a:1");
    const back = AlignStreamFrame.fromDict(f.toDict());
    expect(back.error).toBeUndefined();
    expect(back.data).toBeUndefined();
    expect(back.windowSize).toBeUndefined();
  });

  it("error without message is preserved", () => {
    const f = new AlignStreamFrame(
      "s1", "t1", "st1", 0, true, "urn:nps:node:a:1",
      undefined, { errorCode: "NOP-TASK-FAILED" },
    );
    const back = AlignStreamFrame.fromDict(f.toDict());
    expect(back.error?.errorCode).toBe("NOP-TASK-FAILED");
    expect(back.error?.message).toBeUndefined();
  });
});

// ── NopTaskStatus ─────────────────────────────────────────────────────────────

describe("NopTaskStatus", () => {
  const makeStatus = (state: string, extras: Record<string, unknown> = {}) =>
    new NopTaskStatus({ task_id: "t-1", state, ...extras });

  it("taskId and state getters", () => {
    const s = makeStatus("running");
    expect(s.taskId).toBe("t-1");
    expect(s.state).toBe(TaskState.RUNNING);
  });

  it("isTerminal: COMPLETED / FAILED / CANCELLED are terminal", () => {
    expect(makeStatus("completed").isTerminal).toBe(true);
    expect(makeStatus("failed").isTerminal).toBe(true);
    expect(makeStatus("cancelled").isTerminal).toBe(true);
  });

  it("isTerminal: running / pending are not terminal", () => {
    expect(makeStatus("running").isTerminal).toBe(false);
    expect(makeStatus("pending").isTerminal).toBe(false);
  });

  it("aggregatedResult, errorCode, errorMessage", () => {
    const s = makeStatus("failed", {
      aggregated_result: { items: [] },
      error_code:        "NOP-TASK-FAILED",
      error_message:     "Agent timeout",
    });
    expect(s.aggregatedResult).toEqual({ items: [] });
    expect(s.errorCode).toBe("NOP-TASK-FAILED");
    expect(s.errorMessage).toBe("Agent timeout");
  });

  it("errorCode / errorMessage undefined when null", () => {
    const s = makeStatus("completed", { error_code: null, error_message: null });
    expect(s.errorCode).toBeUndefined();
    expect(s.errorMessage).toBeUndefined();
  });

  it("nodeResults defaults to empty object", () => {
    const s = makeStatus("running");
    expect(s.nodeResults).toEqual({});
  });

  it("nodeResults when present", () => {
    const s = makeStatus("completed", { node_results: { n1: { out: 42 } } });
    expect(s.nodeResults["n1"]).toEqual({ out: 42 });
  });

  it("raw returns underlying dict", () => {
    const s = makeStatus("pending");
    expect(s.raw["task_id"]).toBe("t-1");
  });

  it("toString format", () => {
    const s = makeStatus("running");
    expect(s.toString()).toContain("t-1");
    expect(s.toString()).toContain("running");
  });
});

// ── NopClient ─────────────────────────────────────────────────────────────────

describe("NopClient", () => {
  const dag = { nodes: [{ id: "n1", action: "act", agent: "urn:nps:node:a:1" }], edges: [] };

  beforeEach(() => { vi.restoreAllMocks(); });

  it("submit — returns taskId on 201", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "new-task-1" }),
    }));
    const client = new NopClient("http://nop.test");
    const id     = await client.submit(new TaskFrame("t1", dag));
    expect(id).toBe("new-task-1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://nop.test/task",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submit — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const client = new NopClient("http://nop.test");
    await expect(client.submit(new TaskFrame("t1", dag))).rejects.toThrow("400");
  });

  it("getStatus — returns NopTaskStatus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "t1", state: "running" }),
    }));
    const client = new NopClient("http://nop.test");
    const status = await client.getStatus("t1");
    expect(status).toBeInstanceOf(NopTaskStatus);
    expect(status.state).toBe(TaskState.RUNNING);
  });

  it("getStatus — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const client = new NopClient("http://nop.test");
    await expect(client.getStatus("missing")).rejects.toThrow("404");
  });

  it("cancel — resolves on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new NopClient("http://nop.test");
    await expect(client.cancel("t1")).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://nop.test/task/t1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancel — throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    const client = new NopClient("http://nop.test");
    await expect(client.cancel("t1")).rejects.toThrow("409");
  });

  it("wait — returns immediately when terminal on first poll", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "t1", state: "completed" }),
    }));
    const client = new NopClient("http://nop.test");
    const status = await client.wait("t1", { pollIntervalMs: 100, timeoutMs: 5000 });
    expect(status.isTerminal).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("wait — polls until terminal", async () => {
    vi.useFakeTimers();
    let call = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      const state = call++ < 2 ? "running" : "completed";
      return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve({ task_id: "t1", state }),
      });
    }));
    const client = new NopClient("http://nop.test");
    const waitP  = client.wait("t1", { pollIntervalMs: 100, timeoutMs: 10_000 });
    // Advance through the polling intervals
    await vi.runAllTimersAsync();
    const status = await waitP;
    expect(status.state).toBe(TaskState.COMPLETED);
    vi.useRealTimers();
  });

  it("wait — throws on timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ task_id: "t1", state: "running" }),
    }));
    const client    = new NopClient("http://nop.test");
    const waitP     = client.wait("t1", { pollIntervalMs: 50, timeoutMs: 100 });
    const assertion = expect(waitP).rejects.toThrow("did not complete");
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it("trailing slash stripped from baseUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new NopClient("http://nop.test/");
    await client.cancel("t1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://nop.test/task/t1/cancel",
      expect.anything(),
    );
  });
});
