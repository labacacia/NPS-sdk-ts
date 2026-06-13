// Copyright 2026 INNO LOTUS PTY LTD
// SPDX-License-Identifier: Apache-2.0
//
// Framework-agnostic Memory Node server for NPS-2 §2.1, §4, §5.
// Mount via the built-in Node.js adapter or any HTTP framework.

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash }                            from "node:crypto";
import { QueryFrame }                            from "./frames.js";
import type { FrameSchema }                      from "../ncp/frames/anchor-frame.js";
import {
  type ReputationPolicy,
  defaultReputationEvaluator,
  RepOutcome,
} from "./reputation.js";

// ── Schema types ──────────────────────────────────────────────────────────────

export interface MemoryNodeField {
  name:         string;
  type:         string;
  description?: string;
  nullable?:    boolean;
}

export interface MemoryNodeSchema {
  fields: MemoryNodeField[];
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface MemoryNodeOptions {
  /** Node NID, e.g. `urn:nps:node:api.example.com:products`. */
  nodeId:       string;
  displayName?: string;
  schema:       MemoryNodeSchema;
  /** URL path prefix this node listens on, e.g. `"/products"`. Default `""`. */
  pathPrefix?:  string;
  defaultLimit?: number;
  maxLimit?:     number;
  requireAuth?:  boolean;
  defaultTokenBudget?: number;
  /** Node-operator CGN cap (token-budget.md §7). 0 = unlimited. */
  cgnLimit?: number;
  /** RFC-0005 reputation gate. Omit to disable. */
  reputationPolicy?: ReputationPolicy;
  /** alpha.11 — NPS-4 §5 trust anchors advertised in the /.nwm descriptor. */
  trust_anchors?: string[];
}

// ── Provider interface ────────────────────────────────────────────────────────

export type MemoryNodeRow = Record<string, unknown>;

export interface MemoryNodeQueryResult {
  rows:        MemoryNodeRow[];
  nextCursor?: string;
}

export interface IMemoryNodeProvider {
  query(frame: QueryFrame, opts: MemoryNodeOptions): Promise<MemoryNodeQueryResult>;
  /** Optional streaming support (NDJSON / `/stream`). */
  stream?(frame: QueryFrame, opts: MemoryNodeOptions): AsyncIterable<MemoryNodeRow[]>;
}

// ── Request / Response abstraction ───────────────────────────────────────────

export interface MemoryNodeRequest {
  method:  string;
  subPath: string;
  headers: Record<string, string | string[] | undefined>;
  body:    Uint8Array;
}

export interface MemoryNodeResponse {
  status:  number;
  headers: Record<string, string>;
  body:    string;
}

// ── Server ────────────────────────────────────────────────────────────────────

export class MemoryNodeServer {
  private readonly _opts:      MemoryNodeOptions;
  private readonly _provider:  IMemoryNodeProvider;
  private readonly _prefix:    string;
  private readonly _anchorId:  string;
  private readonly _nwmJson:   string;
  private readonly _schemaJson: string;

  constructor(provider: IMemoryNodeProvider, opts: MemoryNodeOptions) {
    this._provider  = provider;
    this._opts      = opts;
    this._prefix    = (opts.pathPrefix ?? "").replace(/\/$/, "");

    const { anchorId, schemaJson, nwmJson } = buildStaticPayloads(opts);
    this._anchorId   = anchorId;
    this._schemaJson = schemaJson;
    this._nwmJson    = nwmJson;
  }

  /** Handles a request relative to this node's path prefix. */
  async handle(req: MemoryNodeRequest): Promise<MemoryNodeResponse> {
    if (this._opts.requireAuth) {
      const agent = header(req.headers, "x-nwp-agent");
      if (!agent) return errResp(401, "NPS-CLIENT-UNAUTHORIZED", "NWP-AUTH-REQUIRED",
        "X-NWP-Agent header is required.");
    }

    // Reputation gate (RFC-0005 §4.1.4)
    if (this._opts.reputationPolicy) {
      const agentNid = header(req.headers, "x-nwp-agent");
      if (agentNid) {
        const eval_ = defaultReputationEvaluator();
        const decision = await eval_.evaluate(agentNid, "anonymous", this._opts.reputationPolicy);
        if (decision.outcome === RepOutcome.Ban || decision.outcome === RepOutcome.Reject) {
          return errResp(403, "NPS-AUTH-FORBIDDEN", "NWP-AUTH-REPUTATION-BLOCKED",
            "Request rejected by reputation policy.");
        }
        if (decision.outcome === RepOutcome.Throttle) {
          return { status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" },
            body: JSON.stringify({ frame: "0xFE", status: "NPS-LIMIT-RATE",
              error: "NWP-AUTH-REPUTATION-BLOCKED", message: "Request throttled by reputation policy." }) };
        }
      }
    }

    const { method, subPath } = req;
    const norm = subPath.replace(/\/$/, "") || "/";

    if ((norm === "/.nwm") && method === "GET") {
      return {
        status:  200,
        headers: { "Content-Type": "application/json; charset=utf-8", "X-NWP-Node-Type": "memory" },
        body:    this._nwmJson,
      };
    }

    if ((norm === "/.schema") && method === "GET") {
      return {
        status:  200,
        headers: { "Content-Type": "application/json; charset=utf-8", "X-NWP-Schema": this._anchorId },
        body:    this._schemaJson,
      };
    }

    if (norm === "/query") {
      if (method !== "POST") return { status: 405, headers: {}, body: "" };
      return this._handleQuery(req);
    }

    if (norm === "/stream") {
      if (method !== "POST") return { status: 405, headers: {}, body: "" };
      return this._handleStream(req);
    }

    return { status: 404, headers: {}, body: "" };
  }

  private async _handleQuery(req: MemoryNodeRequest): Promise<MemoryNodeResponse> {
    let frame: QueryFrame;
    try {
      const json = JSON.parse(new TextDecoder().decode(req.body)) as Record<string, unknown>;
      frame = QueryFrame.fromDict(json);
    } catch {
      return errResp(400, "NPS-CLIENT-BAD-REQUEST", "NWP-QUERY-FILTER-INVALID", "Invalid QueryFrame body.");
    }

    // Apply limit caps
    const opts = {
      ...this._opts,
      defaultLimit: this._opts.defaultLimit ?? 20,
      maxLimit:     this._opts.maxLimit     ?? 1000,
    };
    if (frame.limit !== undefined) {
      const clamped = Math.min(frame.limit, opts.maxLimit);
      if (clamped !== frame.limit)
        frame = new QueryFrame(frame.anchorRef, frame.filter, clamped, frame.offset,
          frame.orderBy, frame.fields, frame.vectorSearch, frame.depth);
    }

    let result: MemoryNodeQueryResult;
    try {
      result = await this._provider.query(frame, this._opts);
    } catch (err: unknown) {
      return errResp(500, "NPS-SERVER-INTERNAL", "NWP-NODE-UNAVAILABLE",
        err instanceof Error ? err.message : String(err));
    }

    const budget = effectiveBudget(parseBudget(req.headers), this._opts.cgnLimit ?? 0);
    let rows = result.rows;
    let tokenEst = measureRows(rows);
    if (budget > 0 && tokenEst > budget) {
      ({ rows, tokenEst } = trimToBudget(rows, budget));
    }

    const caps = {
      frame:       "0x04",
      anchor_ref:  this._anchorId,
      count:       rows.length,
      data:        rows,
      next_cursor: result.nextCursor ?? null,
      token_est:   tokenEst,
    };
    return {
      status:  200,
      headers: {
        "Content-Type":   "application/json; charset=utf-8",
        "X-NWP-Schema":   this._anchorId,
        "X-NWP-Tokens":   String(tokenEst),
        "X-NWP-Node-Type": "memory",
      },
      body: JSON.stringify(caps),
    };
  }

  private async _handleStream(req: MemoryNodeRequest): Promise<MemoryNodeResponse> {
    let frame: QueryFrame;
    try {
      const json = JSON.parse(new TextDecoder().decode(req.body)) as Record<string, unknown>;
      frame = QueryFrame.fromDict(json);
    } catch {
      return errResp(400, "NPS-CLIENT-BAD-REQUEST", "NWP-QUERY-FILTER-INVALID", "Invalid QueryFrame body.");
    }

    if (!this._provider.stream) {
      // Fall back: single-chunk stream from query
      let result: MemoryNodeQueryResult;
      try { result = await this._provider.query(frame, this._opts); }
      catch (err: unknown) {
        return errResp(500, "NPS-SERVER-INTERNAL", "NWP-NODE-UNAVAILABLE",
          err instanceof Error ? err.message : String(err));
      }
      const streamId = randomStreamId();
      const lines: string[] = [
        JSON.stringify({ frame: "0x03", stream_id: streamId, seq: 0, is_last: false,
          anchor_ref: this._anchorId, data: result.rows }),
        JSON.stringify({ frame: "0x03", stream_id: streamId, seq: 1, is_last: true,  data: [] }),
      ];
      return {
        status:  200,
        headers: { "Content-Type": "application/x-ndjson", "X-NWP-Schema": this._anchorId,
          "X-NWP-Node-Type": "memory" },
        body: lines.join("\n") + "\n",
      };
    }

    // Provider has native streaming
    const streamId = randomStreamId();
    const chunks: string[] = [];
    let seq = 0;
    try {
      for await (const page of this._provider.stream(frame, this._opts)) {
        chunks.push(JSON.stringify({
          frame: "0x03", stream_id: streamId, seq: seq++, is_last: false,
          anchor_ref: seq === 1 ? this._anchorId : undefined, data: page,
        }));
      }
    } catch (err: unknown) {
      chunks.push(JSON.stringify({
        frame: "0x03", stream_id: streamId, seq: seq, is_last: true, data: [],
        error_code: "NWP-NODE-UNAVAILABLE",
      }));
      return {
        status:  200,
        headers: { "Content-Type": "application/x-ndjson", "X-NWP-Node-Type": "memory" },
        body: chunks.join("\n") + "\n",
      };
    }
    chunks.push(JSON.stringify({ frame: "0x03", stream_id: streamId, seq, is_last: true, data: [] }));
    return {
      status:  200,
      headers: { "Content-Type": "application/x-ndjson", "X-NWP-Schema": this._anchorId,
        "X-NWP-Node-Type": "memory" },
      body: chunks.join("\n") + "\n",
    };
  }

  // ── Node.js http adapter ──────────────────────────────────────────────────

  /**
   * Returns a Node.js `http.RequestListener` that mounts this node at its
   * configured `pathPrefix`. Paths that don't match are passed to `next`.
   */
  nodeHandler(next?: (req: IncomingMessage, res: ServerResponse) => void): (
    req: IncomingMessage, res: ServerResponse,
  ) => Promise<void> {
    return async (req, res) => {
      const url  = req.url ?? "/";
      const path = url.split("?")[0]!;

      if (!path.startsWith(this._prefix) ||
          (path.length > this._prefix.length &&
           path[this._prefix.length] !== "/")) {
        if (next) next(req, res);
        else { res.writeHead(404); res.end(); }
        return;
      }

      const subPath = path.slice(this._prefix.length) || "/";

      const body = await readBody(req);
      const raw: MemoryNodeRequest = {
        method:  (req.method ?? "GET").toUpperCase(),
        subPath,
        headers: req.headers as Record<string, string | string[] | undefined>,
        body,
      };

      const resp = await this.handle(raw);
      res.writeHead(resp.status, resp.headers);
      res.end(resp.body);
    };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildStaticPayloads(opts: MemoryNodeOptions) {
  const prefix = (opts.pathPrefix ?? "").replace(/\/$/, "");

  const frameSchema: FrameSchema = {
    fields: opts.schema.fields.map(f => ({
      name:     f.name,
      type:     f.type,
      nullable: f.nullable ?? true,
    })),
  };
  const schemaJson = JSON.stringify(frameSchema);
  const anchorId   = "sha256:" + createHash("sha256").update(schemaJson).digest("hex");

  const nwm: Record<string, unknown> = {
    nwp:              "0.4",
    node_id:          opts.nodeId,
    node_type:        "memory",
    display_name:     opts.displayName ?? null,
    wire_formats:     ["json"],
    preferred_format: "json",
    schema_anchors:   { default: anchorId },
    capabilities:     { query: true, stream: true, token_budget_hint: true },
    auth:             { required: opts.requireAuth ?? false,
                        identity_type: opts.requireAuth ? "nip-cert" : "none" },
    endpoints: {
      query:  `${prefix}/query`,
      stream: `${prefix}/stream`,
      schema: `${prefix}/.schema`,
    },
  };
  if (opts.cgnLimit && opts.cgnLimit > 0)
    nwm["token_budget"] = { cgn_limit: opts.cgnLimit, profile: "cgn.v1" };
  if (opts.trust_anchors && opts.trust_anchors.length > 0)
    nwm["trust_anchors"] = opts.trust_anchors;

  return { anchorId, schemaJson, nwmJson: JSON.stringify(nwm) };
}

function errResp(status: number, npsStatus: string, code: string, message: string): MemoryNodeResponse {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ frame: "0xFE", status: npsStatus, error: code, message }),
  };
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseBudget(headers: Record<string, string | string[] | undefined>): number {
  const raw = header(headers, "x-nwp-budget");
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

function effectiveBudget(agentBudget: number, cgnLimit: number): number {
  if (cgnLimit <= 0) return agentBudget;
  if (agentBudget <= 0) return cgnLimit;
  return Math.min(cgnLimit, agentBudget);
}

/** Rough token estimate: 1 token ≈ 4 bytes of JSON. */
function measureRows(rows: MemoryNodeRow[]): number {
  return Math.ceil(JSON.stringify(rows).length / 4);
}

function trimToBudget(rows: MemoryNodeRow[], budget: number): { rows: MemoryNodeRow[]; tokenEst: number } {
  const trimmed: MemoryNodeRow[] = [];
  let acc = 0;
  for (const row of rows) {
    const tok = Math.ceil(JSON.stringify(row).length / 4);
    if (acc + tok > budget) break;
    trimmed.push(row);
    acc += tok;
  }
  return { rows: trimmed, tokenEst: acc };
}

function randomStreamId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
