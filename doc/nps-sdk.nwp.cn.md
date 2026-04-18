[English Version](./nps-sdk.nwp.md) | 中文版

# `@labacacia/nps-sdk/nwp` — 类与方法参考

> 规范：[NPS-2 NWP v0.4](https://github.com/labacacia/nps/blob/main/spec/NPS-2-NWP.md)

NWP 是 AI 的 HTTP。本模块提供两个 NWP 帧
（`QueryFrame`、`ActionFrame`）、异步 `NwpClient`，以及用于查询排序、
向量检索和异步动作响应的 dataclass 风格接口。

---

## 目录

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

当目标 Memory Node 广告 `nwp:vector` 时，附加到 `QueryFrame.vectorSearch`。

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

当 `ActionFrame` 以 `async_ === true` 提交时，由 `NwpClient.invoke` 返回。

---

## `QueryFrame` (0x10)

针对 Memory Node 的结构化读取。

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

线路形式（由 `toDict` 发出）使用 snake-case 键：
`anchor_ref`、`order_by`、`vector_search` 等。

---

## `ActionFrame` (0x11)

针对 Action / Complex / Gateway Node 的操作调用。

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

- `actionId` 是 Action Node 的 `.nwm.json` → `endpoints.actions[].id` 中
  声明的标识符。
- `async_` 在线路上序列化为 `"async"`（尾下划线避免与 JS 关键字冲突）。
- `idempotencyKey` —— 存在则节点必须在其重放窗口内去重。

---

## `NwpClient`

使用 `Content-Type: application/x-nps-frame` 与 NWP 节点通信的异步 HTTP 客户端。

```typescript
class NwpClient {
  constructor(
    baseUrl: string,
    options?: {
      defaultTier?: EncodingTier;   // 默认：MSGPACK
      maxPayload?:  number;         // 默认：65 535
      registry?:    FrameRegistry;  // 默认：NCP + NWP 帧
    },
  );

  async sendAnchor(frame: AnchorFrame): Promise<void>;
  async query(frame: QueryFrame): Promise<CapsFrame>;
  stream(frame: QueryFrame): AsyncGenerator<StreamFrame>;
  async invoke(frame: ActionFrame): Promise<unknown>;
}
```

`baseUrl` 的尾斜杠自动去除。

### HTTP 路由

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| `sendAnchor` | `POST /anchor` | `AnchorFrame` 线路字节 | `204 No Content` |
| `query`      | `POST /query`  | `QueryFrame` 线路字节 | `CapsFrame` 线路字节 |
| `stream`     | `POST /stream` | `QueryFrame` 线路字节 | 分块 `StreamFrame` 直至 `is_last=true` |
| `invoke`     | `POST /invoke` | `ActionFrame` 线路字节 | 动作结果 |

`invoke()` 按 `frame.async_` 分派：

- `false` → 依据 content-type 解码响应。若服务器返回
  `application/x-nps-frame`，body 由编解码器解码；否则按 JSON 解析。
- `true` → 解析 JSON 返回 `AsyncActionResponse`。轮询 `pollUrl`
  观察进度。

所有方法在非 2xx HTTP 状态时抛普通 `Error`。流帧被独立发出 ——
用 `for await` 消费生成器。

---

## 端到端示例

```typescript
import {
  NwpClient, QueryFrame, QueryOrderClause,
  ActionFrame, AsyncActionResponse,
  VectorSearchOptions,
} from "@labacacia/nps-sdk/nwp";

const nwp = new NwpClient("https://products.example.com");

// 1) 一次性上传 anchor
await nwp.sendAnchor({
  frame:     "0x01",
  anchor_id: "sha256:…",
  schema:    { fields: [
    { name: "id",    type: "uint64" },
    { name: "price", type: "decimal", semantic: "commerce.price.usd" },
  ]},
  ttl:       3600,
});

// 2) 查询一页
const caps = await nwp.query(new QueryFrame(
  "sha256:…",
  { price: { $lt: "100.00" } },
  50,
  undefined,
  [{ field: "price", dir: "asc" }],
));
console.log(caps.count, "行, cursor:", caps.next_cursor);

// 3) 流式获取全量
for await (const chunk of nwp.stream(new QueryFrame("sha256:…"))) {
  for (const row of chunk.data) { /* … */ }
  if (chunk.isLast) break;
}

// 4) 触发异步动作
const resp = await nwp.invoke(new ActionFrame(
  "restock",
  { sku: "sku-4242", qty: 100 },
  true,
));
// resp 是 AsyncActionResponse
```
