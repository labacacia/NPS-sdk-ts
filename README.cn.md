[English Version](./README.md) | 中文版

# NPS TypeScript SDK — `@labacacia/nps-sdk`

[![npm](https://img.shields.io/npm/v/@labacacia/nps-sdk)](https://www.npmjs.com/package/@labacacia/nps-sdk)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-43853D)](https://nodejs.org/)

**Neural Protocol Suite (NPS)** 的 TypeScript SDK —— 专为 AI Agent 与神经模型设计的完整互联网协议栈。

双格式输出（ESM + CJS）· 支持 Node.js 与现代浏览器。

---

## NPS 仓库导航

| 仓库 | 职责 | 语言 |
|------|------|------|
| [NPS-Release](https://github.com/labacacia/NPS-Release) | 协议规范（权威来源） | Markdown / YAML |
| [NPS-sdk-dotnet](https://github.com/labacacia/NPS-sdk-dotnet) | 参考实现 | C# / .NET 10 |
| [NPS-sdk-py](https://github.com/labacacia/NPS-sdk-py) | 异步 Python SDK | Python 3.11+ |
| **[NPS-sdk-ts](https://github.com/labacacia/NPS-sdk-ts)**（本仓库） | Node/浏览器 SDK | TypeScript |
| [NPS-sdk-java](https://github.com/labacacia/NPS-sdk-java) | JVM SDK | Java 21+ |
| [NPS-sdk-rust](https://github.com/labacacia/NPS-sdk-rust) | 异步 SDK | Rust stable |
| [NPS-sdk-go](https://github.com/labacacia/NPS-sdk-go) | Go SDK | Go 1.23+ |

---

## 状态

**v1.0.0-alpha.1 — Phase 2 发布** · 5 个协议 · 139 个测试 · **≥ 98% 覆盖率**

| 协议 | 导出 API | 状态 |
|------|----------|------|
| NCP — Neural Communication Protocol | `NpsFrameCodec`、帧类型 | ✅ |
| NWP — Neural Web Protocol | `NwpClient` | ✅ |
| NIP — Neural Identity Protocol | `NipIdentity` | ✅ |
| NDP — Neural Discovery Protocol | `InMemoryNdpRegistry`、`NdpAnnounceValidator` | ✅ |
| NOP — Neural Orchestration Protocol | `NopClient` | ✅ |

## 安装

```bash
npm install @labacacia/nps-sdk
```

> **运行环境要求：** Node.js 18+（Web Crypto API）。现代浏览器需原生支持 SubtleCrypto。

## 快速开始

### NWP —— 查询节点

```typescript
import { NwpClient, QueryFrame } from "@labacacia/nps-sdk/nwp";

const client = new NwpClient("http://node.example.com:17433");
const caps   = await client.query(new QueryFrame("sha256:<anchor-id>", { active: true }, 20));
console.log(caps.count, caps.data);
```

### NWP —— 流式结果

```typescript
for await (const chunk of client.stream(new QueryFrame("sha256:<anchor-id>"))) {
  console.log(chunk.seq, chunk.data);
}
```

### NWP —— 调用 Action

```typescript
import { ActionFrame } from "@labacacia/nps-sdk/nwp";

const result = await client.invoke(new ActionFrame("summarise", { maxTokens: 500 }));
```

### NIP —— Ed25519 身份

```typescript
import { NipIdentity } from "@labacacia/nps-sdk/nip";

const id = NipIdentity.generate();
id.save("./my-key.json", process.env.KEY_PASS!);    // AES-256-GCM + PBKDF2

const loaded = NipIdentity.load("./my-key.json", process.env.KEY_PASS!);
const sig    = loaded.sign({ action: "announce", nid: "urn:nps:node:example.com:data" });
const ok     = loaded.verify({ action: "announce", nid: "urn:nps:node:example.com:data" }, sig);
```

### NDP —— 注册表与验证器

```typescript
import { InMemoryNdpRegistry, NdpAnnounceValidator, AnnounceFrame } from "@labacacia/nps-sdk/ndp";

const registry  = new InMemoryNdpRegistry();
const validator = new NdpAnnounceValidator();
validator.registerPublicKey(nid, identity.pubKeyString);

registry.announce(frame);
const resolved = registry.resolve("nwp://example.com/data/items");
```

### NOP —— 提交与等待

```typescript
import { NopClient, TaskFrame } from "@labacacia/nps-sdk/nop";

const client = new NopClient("http://orchestrator.example.com:17433");
const taskId = await client.submit(new TaskFrame("task-1", {
  nodes: [{ id: "classify", action: "classify-text", agent: "urn:nps:node:ml.example.com:classifier" }],
  edges: [],
}));
const status = await client.wait(taskId, { timeoutMs: 30_000 });
console.log(status.state, status.aggregatedResult);
```

## API 参考

完整的类与方法参考见 [`doc/`](./doc/)：

| 子路径 | 说明 | 参考文档 |
|--------|------|----------|
| —                                   | 总览、安装、最小示例                          | [`doc/overview.cn.md`](./doc/overview.cn.md) |
| `@labacacia/nps-sdk/core`           | 帧头、编解码、AnchorFrame 缓存、异常 | [`doc/nps-sdk.core.cn.md`](./doc/nps-sdk.core.cn.md) |
| `@labacacia/nps-sdk/ncp`            | NCP 帧 + 握手 + 流管理 | [`doc/nps-sdk.ncp.cn.md`](./doc/nps-sdk.ncp.cn.md) |
| `@labacacia/nps-sdk/nwp`            | `QueryFrame`、`ActionFrame`、`NwpClient` | [`doc/nps-sdk.nwp.cn.md`](./doc/nps-sdk.nwp.cn.md) |
| `@labacacia/nps-sdk/nip`            | `IdentFrame`、`TrustFrame`、`RevokeFrame`、`NipIdentity` | [`doc/nps-sdk.nip.cn.md`](./doc/nps-sdk.nip.cn.md) |
| `@labacacia/nps-sdk/ndp`            | NDP 帧 + `InMemoryNdpRegistry` + 验证器 | [`doc/nps-sdk.ndp.cn.md`](./doc/nps-sdk.ndp.cn.md) |
| `@labacacia/nps-sdk/nop`            | DAG 模型、NOP 帧、`NopClient` | [`doc/nps-sdk.nop.cn.md`](./doc/nps-sdk.nop.cn.md) |

## 包导出

```typescript
import { ... } from "@labacacia/nps-sdk";         // 根 —— 全部
import { ... } from "@labacacia/nps-sdk/core";    // 编解码、帧、注册表、缓存
import { ... } from "@labacacia/nps-sdk/ncp";     // AnchorFrame、CapsFrame、StreamFrame 等
import { ... } from "@labacacia/nps-sdk/nwp";     // NwpClient、QueryFrame、ActionFrame
import { ... } from "@labacacia/nps-sdk/nip";     // NipIdentity、IdentFrame、TrustFrame、RevokeFrame
import { ... } from "@labacacia/nps-sdk/ndp";     // InMemoryNdpRegistry、NdpAnnounceValidator、AnnounceFrame 等
import { ... } from "@labacacia/nps-sdk/nop";     // NopClient、NopTaskStatus、TaskFrame 等
```

## NCP 编解码

```typescript
import { NpsFrameCodec, EncodingTier } from "@labacacia/nps-sdk/core";
import { createDefaultRegistry } from "@labacacia/nps-sdk";

const codec = new NpsFrameCodec(createDefaultRegistry());

const wire    = codec.encode(frame);                                          // MsgPack（默认）
const json    = codec.encode(frame, { overrideTier: EncodingTier.JSON });     // JSON Tier
const decoded = codec.decode(wire);

// 不解析负载直接查看帧头
const header = NpsFrameCodec.peekHeader(wire);
console.log(header.frameType, header.isExtended, header.payloadLength);
```

## NIP CA Server

`nip-ca-server/` 目录提供一个独立 NIP 证书颁发机构服务 —— 基于 Fastify，SQLite 存储，开箱即用的 Docker 部署。

## 开发

```bash
npm install --no-bin-links                        # 无需符号链接
node node_modules/vitest/vitest.mjs run           # 运行 139 个测试
node node_modules/vitest/vitest.mjs run --coverage
node node_modules/tsup/dist/cli-default.js        # 构建 ESM + CJS
```

## 许可证

Apache 2.0 —— 详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

Copyright 2026 INNO LOTUS PTY LTD
