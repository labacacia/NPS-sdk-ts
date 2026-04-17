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
