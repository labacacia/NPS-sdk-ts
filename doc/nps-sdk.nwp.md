English | [中文版](./nps-sdk.nwp.cn.md)

# `@labacacia/nps-sdk/nwp` — Class and Method Reference

> Spec: [NPS-2 NWP v0.4](https://github.com/labacacia/nps/blob/main/spec/NPS-2-NWP.md)

NWP is the HTTP-of-AI. This module ships the two NWP frames
(`QueryFrame`, `ActionFrame`), the async `NwpClient`, and supporting
dataclass-like interfaces for query ordering, vector search, and async
action responses.

---

## Table of contents

- [`QueryOrderClause`](#queryorderclause)
- [`VectorSearchOptions`](#vectorsearchoptions)
- [`AsyncActionResponse`](#asyncactionresponse)
- [`QueryFrame` (0x10)](#queryframe-0x10)
- [`ActionFrame` (0x11)](#actionframe-0x11)
- [`NwpClient`](#nwpclient)
- [`NwpErrorCodes`](#nwperrorcodes)

---

## `QueryOrderClause`

```typescript
interface QueryOrderClause {
  field: string;
  dir:   "asc" | "desc";
}
```

---

## `VectorSearchOptions`

```typescript
interface VectorSearchOptions {
  vector:       readonly number[];
  topK?:        number;
  minScore?:    number;
  vectorField?: string;
}
```

Attached to a `QueryFrame.vectorSearch` when the target Memory Node
advertises `nwp:vector`.

---

## `AsyncActionResponse`

```typescript
interface AsyncActionResponse {
  taskId:   string;
  status:   string;   // "pending" | "running" | …
  pollUrl?: string;
}

function asyncActionResponseFromDict(
  data: Record<string, unknown>,
): AsyncActionResponse;
```

Returned by `NwpClient.invoke` when the `ActionFrame` was submitted with
`async_ === true`.

---

## `QueryFrame` (0x10)

Structured read against a Memory Node.

```typescript
class QueryFrame {
  readonly frameType:     FrameType.QUERY;
  readonly preferredTier: EncodingTier.MSGPACK;

  constructor(
    public readonly anchorRef?:    string,
    public readonly filter?:       Record<string, unknown>,
    public readonly limit?:        number,
    public readonly offset?:       number,
    public readonly orderBy?:      readonly QueryOrderClause[],
    public readonly fields?:       readonly string[],
    public readonly vectorSearch?: VectorSearchOptions,
    public readonly depth?:        number,
  );

  toDict(): Record<string, unknown>;
  static fromDict(data: Record<string, unknown>): QueryFrame;
}
```

Wire form (emitted by `toDict`) uses snake-case keys:
`anchor_ref`, `order_by`, `vector_search` etc.

---

## `ActionFrame` (0x11)

Operation invocation against an Action / Complex / Gateway Node.

```typescript
class ActionFrame {
  readonly frameType:     FrameType.ACTION;
  readonly preferredTier: EncodingTier.MSGPACK;

  constructor(
    public readonly actionId:        string,
    public readonly params?:         Record<string, unknown>,
    public readonly async_?:         boolean,
    public readonly idempotencyKey?: string,
    public readonly timeoutMs?:      number,
  );

  toDict(): Record<string, unknown>;
  static fromDict(data: Record<string, unknown>): ActionFrame;
}
```

- `actionId` is the identifier declared under the Action Node's
  `.nwm.json` → `endpoints.actions[].id`.
- `async_` is serialised as `"async"` on the wire (trailing underscore
  avoids shadowing the JS keyword).
- `idempotencyKey` — if present, the node MUST deduplicate within its
  replay window.

---

## `NwpClient`

Async HTTP client that talks to an NWP node using
`Content-Type: application/x-nps-frame`.

```typescript
class NwpClient {
  constructor(
    baseUrl: string,
    options?: {
      defaultTier?: EncodingTier;   // default: MSGPACK
      maxPayload?:  number;         // default: 65 535
      registry?:    FrameRegistry;  // default: NCP + NWP frames
    },
  );

  async sendAnchor(frame: AnchorFrame): Promise<void>;
  async query(frame: QueryFrame): Promise<CapsFrame>;
  stream(frame: QueryFrame): AsyncGenerator<StreamFrame>;
  async invoke(frame: ActionFrame): Promise<unknown>;
}
```

`baseUrl` trailing slashes are trimmed automatically.

### HTTP routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| `sendAnchor` | `POST /anchor` | `AnchorFrame` wire bytes | `204 No Content` |
| `query`      | `POST /query`  | `QueryFrame` wire bytes | `CapsFrame` wire bytes |
| `stream`     | `POST /stream` | `QueryFrame` wire bytes | chunked `StreamFrame`s until `is_last=true` |
| `invoke`     | `POST /invoke` | `ActionFrame` wire bytes | action result |

`invoke()` dispatches by `frame.async_`:

- `false` → decodes response based on content-type. If the server
  responds with `application/x-nps-frame`, the body is decoded by the
  codec; otherwise the response is parsed as JSON.
- `true` → parses JSON and returns `AsyncActionResponse`. Poll
  `pollUrl` to observe progress.

All methods throw a plain `Error` on non-2xx HTTP status. Stream frames
are emitted individually — consume the generator with `for await`.

---

## End-to-end example

```typescript
import {
  NwpClient, QueryFrame, QueryOrderClause,
  ActionFrame, AsyncActionResponse,
  VectorSearchOptions,
} from "@labacacia/nps-sdk/nwp";

const nwp = new NwpClient("https://products.example.com");

// 1) Upload an anchor once
await nwp.sendAnchor({
  frame:     "0x01",
  anchor_id: "sha256:…",
  schema:    { fields: [
    { name: "id",    type: "uint64" },
    { name: "price", type: "decimal", semantic: "commerce.price.usd" },
  ]},
  ttl:       3600,
});

// 2) Query a page
const caps = await nwp.query(new QueryFrame(
  "sha256:…",
  { price: { $lt: "100.00" } },
  50,
  undefined,
  [{ field: "price", dir: "asc" }],
));
console.log(caps.count, "rows, cursor:", caps.next_cursor);

// 3) Stream the full set
for await (const chunk of nwp.stream(new QueryFrame("sha256:…"))) {
  for (const row of chunk.data) { /* … */ }
  if (chunk.isLast) break;
}

// 4) Fire an async action
const resp = await nwp.invoke(new ActionFrame(
  "restock",
  { sku: "sku-4242", qty: 100 },
  true,
));
// resp is AsyncActionResponse
```

---

## `NwpErrorCodes`

String constants for the 30 NWP wire error codes (added in alpha.5).

```typescript
import { NwpErrorCodes } from "@labacacia/nps-sdk/nwp";
```

### Auth group (`NWP-AUTH-*`)

| Constant | Wire value |
|----------|------------|
| `NwpErrorCodes.AUTH_NID_SCOPE_VIOLATION` | `"NWP-AUTH-NID-SCOPE-VIOLATION"` |
| `NwpErrorCodes.AUTH_NID_NOT_TRUSTED` | `"NWP-AUTH-NID-NOT-TRUSTED"` |
| `NwpErrorCodes.AUTH_NID_EXPIRED` | `"NWP-AUTH-NID-EXPIRED"` |
| `NwpErrorCodes.AUTH_NID_REVOKED` | `"NWP-AUTH-NID-REVOKED"` |
| `NwpErrorCodes.AUTH_SIG_INVALID` | `"NWP-AUTH-SIG-INVALID"` |
| `NwpErrorCodes.AUTH_TOKEN_BUDGET_EXCEEDED` | `"NWP-AUTH-TOKEN-BUDGET-EXCEEDED"` |
| `NwpErrorCodes.AUTH_RATE_LIMIT` | `"NWP-AUTH-RATE-LIMIT"` |

### Query group (`NWP-QUERY-*`)

| Constant | Wire value |
|----------|------------|
| `NwpErrorCodes.QUERY_ANCHOR_NOT_FOUND` | `"NWP-QUERY-ANCHOR-NOT-FOUND"` |
| `NwpErrorCodes.QUERY_ANCHOR_EXPIRED` | `"NWP-QUERY-ANCHOR-EXPIRED"` |
| `NwpErrorCodes.QUERY_SCHEMA_MISMATCH` | `"NWP-QUERY-SCHEMA-MISMATCH"` |
| `NwpErrorCodes.QUERY_LIMIT_EXCEEDED` | `"NWP-QUERY-LIMIT-EXCEEDED"` |
| `NwpErrorCodes.QUERY_DEPTH_EXCEEDED` | `"NWP-QUERY-DEPTH-EXCEEDED"` |
| `NwpErrorCodes.QUERY_FILTER_INVALID` | `"NWP-QUERY-FILTER-INVALID"` |
| `NwpErrorCodes.QUERY_VECTOR_UNSUPPORTED` | `"NWP-QUERY-VECTOR-UNSUPPORTED"` |
| `NwpErrorCodes.QUERY_CURSOR_INVALID` | `"NWP-QUERY-CURSOR-INVALID"` |

### Action, Task, Subscribe, Infrastructure groups

| Constant | Wire value |
|----------|------------|
| `NwpErrorCodes.ACTION_NOT_FOUND` | `"NWP-ACTION-NOT-FOUND"` |
| `NwpErrorCodes.ACTION_PARAM_INVALID` | `"NWP-ACTION-PARAM-INVALID"` |
| `NwpErrorCodes.ACTION_IDEMPOTENCY_CONFLICT` | `"NWP-ACTION-IDEMPOTENCY-CONFLICT"` |
| `NwpErrorCodes.TASK_NOT_FOUND` | `"NWP-TASK-NOT-FOUND"` |
| `NwpErrorCodes.TASK_ALREADY_COMPLETE` | `"NWP-TASK-ALREADY-COMPLETE"` |
| `NwpErrorCodes.TASK_TIMEOUT` | `"NWP-TASK-TIMEOUT"` |
| `NwpErrorCodes.TASK_CANCELLED` | `"NWP-TASK-CANCELLED"` |
| `NwpErrorCodes.SUBSCRIBE_TOPIC_NOT_FOUND` | `"NWP-SUBSCRIBE-TOPIC-NOT-FOUND"` |
| `NwpErrorCodes.SUBSCRIBE_ALREADY_ACTIVE` | `"NWP-SUBSCRIBE-ALREADY-ACTIVE"` |
| `NwpErrorCodes.SUBSCRIBE_QUOTA_EXCEEDED` | `"NWP-SUBSCRIBE-QUOTA-EXCEEDED"` |
| `NwpErrorCodes.SUBSCRIBE_FILTER_INVALID` | `"NWP-SUBSCRIBE-FILTER-INVALID"` |
| `NwpErrorCodes.SUBSCRIBE_NOT_FOUND` | `"NWP-SUBSCRIBE-NOT-FOUND"` |
| `NwpErrorCodes.INFRA_NODE_OVERLOADED` | `"NWP-INFRA-NODE-OVERLOADED"` |
| `NwpErrorCodes.INFRA_UPSTREAM_TIMEOUT` | `"NWP-INFRA-UPSTREAM-TIMEOUT"` |
| `NwpErrorCodes.INFRA_UPSTREAM_ERROR` | `"NWP-INFRA-UPSTREAM-ERROR"` |
| `NwpErrorCodes.INFRA_STORAGE_ERROR` | `"NWP-INFRA-STORAGE-ERROR"` |
| `NwpErrorCodes.INFRA_CONFIG_ERROR` | `"NWP-INFRA-CONFIG-ERROR"` |

### Manifest, Topology, Reserved groups

| Constant | Wire value |
|----------|------------|
| `NwpErrorCodes.MANIFEST_NOT_FOUND` | `"NWP-MANIFEST-NOT-FOUND"` |
| `NwpErrorCodes.MANIFEST_PARSE_ERROR` | `"NWP-MANIFEST-PARSE-ERROR"` |
| `NwpErrorCodes.MANIFEST_VERSION_MISMATCH` | `"NWP-MANIFEST-VERSION-MISMATCH"` |
| `NwpErrorCodes.TOPOLOGY_UNAUTHORIZED` | `"NWP-TOPOLOGY-UNAUTHORIZED"` |
| `NwpErrorCodes.TOPOLOGY_NOT_AVAILABLE` | `"NWP-TOPOLOGY-NOT-AVAILABLE"` |
| `NwpErrorCodes.TOPOLOGY_SNAPSHOT_TOO_LARGE` | `"NWP-TOPOLOGY-SNAPSHOT-TOO-LARGE"` |
| `NwpErrorCodes.TOPOLOGY_STREAM_INTERRUPTED` | `"NWP-TOPOLOGY-STREAM-INTERRUPTED"` |
| `NwpErrorCodes.RESERVED_TYPE_UNSUPPORTED` | `"NWP-RESERVED-TYPE-UNSUPPORTED"` |
