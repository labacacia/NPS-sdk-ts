// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  estimateCgn,
  estimateCgnJson,
  estimateCgnRows,
  BudgetExceededError,
  type TokenBudgetMeta,
} from "../src/nwp/cgn.js";
import { QueryFrame } from "../src/nwp/frames.js";

// ── estimateCgn ──────────────────────────────────────────────────────────────

describe("estimateCgn", () => {
  it("empty string returns 0", () => {
    expect(estimateCgn("")).toBe(0);
  });

  it("empty Uint8Array returns 0", () => {
    expect(estimateCgn(new Uint8Array(0))).toBe(0);
  });

  it("'hello' (5 bytes) returns 2", () => {
    expect(estimateCgn("hello")).toBe(2);
  });

  it("'test' (4 bytes) returns 1", () => {
    expect(estimateCgn("test")).toBe(1);
  });

  it("'abcde' (5 bytes) returns 2", () => {
    expect(estimateCgn("abcde")).toBe(2);
  });

  it("8-byte aligned string returns 2", () => {
    expect(estimateCgn("abcdefgh")).toBe(2);
  });

  it("Uint8Array input same as string", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(estimateCgn(bytes)).toBe(estimateCgn("hello"));
  });

  it("Chinese text '你好' (6 UTF-8 bytes) returns 2", () => {
    expect(estimateCgn("你好")).toBe(2);
  });

  it("single ascii char returns 1", () => {
    expect(estimateCgn("a")).toBe(1);
  });

  it("12-byte string returns 3", () => {
    expect(estimateCgn("abcdefghijkl")).toBe(3);
  });
});

// ── estimateCgnJson ───────────────────────────────────────────────────────────

describe("estimateCgnJson", () => {
  it("simple dict", () => {
    const obj = { key: "val" };
    const raw = JSON.stringify(obj);
    expect(estimateCgnJson(obj)).toBe(estimateCgn(raw));
  });

  it("empty object", () => {
    expect(estimateCgnJson({})).toBe(estimateCgn("{}"));
  });

  it("array", () => {
    expect(estimateCgnJson([1, 2, 3])).toBe(estimateCgn("[1,2,3]"));
  });

  it("string value", () => {
    expect(estimateCgnJson("hello")).toBe(estimateCgn('"hello"'));
  });

  it("integer value", () => {
    expect(estimateCgnJson(42)).toBe(estimateCgn("42"));
  });
});

// ── estimateCgnRows ───────────────────────────────────────────────────────────

describe("estimateCgnRows", () => {
  it("empty array returns 0", () => {
    expect(estimateCgnRows([])).toBe(0);
  });

  it("single row equals estimateCgnJson", () => {
    const row = { id: 1, name: "Alice" };
    expect(estimateCgnRows([row])).toBe(estimateCgnJson(row));
  });

  it("multiple rows sum individual estimates", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const expected = rows.reduce((acc, r) => acc + estimateCgnJson(r), 0);
    expect(estimateCgnRows(rows)).toBe(expected);
  });

  it("rows with unicode", () => {
    const rows = [{ name: "你好" }, { name: "world" }];
    const expected = rows.reduce((acc, r) => acc + estimateCgnJson(r), 0);
    expect(estimateCgnRows(rows)).toBe(expected);
  });
});

// ── TokenBudgetMeta (interface) ───────────────────────────────────────────────

describe("TokenBudgetMeta", () => {
  it("round-trip as plain object", () => {
    const meta: TokenBudgetMeta = {
      cgn_limit: 1024,
      tokenizer: "cl100k",
      supported_tokenizers: ["cl100k", "p50k"],
      token_budget_hint: true,
      profile: "cgn.v1",
    };
    // TypeScript interface — just structural check
    expect(meta.cgn_limit).toBe(1024);
    expect(meta.tokenizer).toBe("cl100k");
    expect(meta.supported_tokenizers).toEqual(["cl100k", "p50k"]);
    expect(meta.token_budget_hint).toBe(true);
    expect(meta.profile).toBe("cgn.v1");
  });

  it("minimal meta with cgn_limit only", () => {
    const meta: TokenBudgetMeta = { cgn_limit: 500 };
    expect(meta.cgn_limit).toBe(500);
    expect(meta.tokenizer).toBeUndefined();
    expect(meta.profile).toBeUndefined();
  });
});

// ── BudgetExceededError ───────────────────────────────────────────────────────

describe("BudgetExceededError", () => {
  it("carries requested and limit", () => {
    const err = new BudgetExceededError(1500, 1000);
    expect(err.requested).toBe(1500);
    expect(err.limit).toBe(1000);
  });

  it("message includes both values", () => {
    const err = new BudgetExceededError(200, 100);
    expect(err.message).toContain("200");
    expect(err.message).toContain("100");
  });

  it("name is BudgetExceededError", () => {
    const err = new BudgetExceededError(10, 5);
    expect(err.name).toBe("BudgetExceededError");
  });

  it("is an instance of Error", () => {
    expect(new BudgetExceededError(10, 5)).toBeInstanceOf(Error);
  });

  it("can be thrown and caught", () => {
    expect(() => { throw new BudgetExceededError(10, 5); }).toThrow(BudgetExceededError);
  });
});

// ── QueryFrame with tokenBudget and tokenizer ─────────────────────────────────

describe("QueryFrame token budget fields", () => {
  it("round-trips tokenBudget and tokenizer via toDict/fromDict", () => {
    const f = new QueryFrame(
      undefined, undefined, 10, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, 512, "cl100k"
    );
    const back = QueryFrame.fromDict(f.toDict());
    expect(back.tokenBudget).toBe(512);
    expect(back.tokenizer).toBe("cl100k");
  });

  it("tokenBudget and tokenizer are undefined by default", () => {
    const f = new QueryFrame();
    expect(f.tokenBudget).toBeUndefined();
    expect(f.tokenizer).toBeUndefined();
  });

  it("toDict omits token_budget and tokenizer when not set", () => {
    const f = new QueryFrame(undefined, undefined, 10);
    const d = f.toDict();
    expect(d["token_budget"]).toBeUndefined();
    expect(d["tokenizer"]).toBeUndefined();
  });

  it("toDict includes token_budget and tokenizer when set", () => {
    const f = new QueryFrame(
      undefined, undefined, 10, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, 256, "p50k"
    );
    const d = f.toDict();
    expect(d["token_budget"]).toBe(256);
    expect(d["tokenizer"]).toBe("p50k");
  });

  it("fromDict parses token_budget and tokenizer", () => {
    const f = QueryFrame.fromDict({ limit: 10, token_budget: 128, tokenizer: "cl100k" });
    expect(f.tokenBudget).toBe(128);
    expect(f.tokenizer).toBe("cl100k");
  });

  it("fromDict with missing token_budget returns undefined", () => {
    const f = QueryFrame.fromDict({ limit: 10 });
    expect(f.tokenBudget).toBeUndefined();
    expect(f.tokenizer).toBeUndefined();
  });
});
