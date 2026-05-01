[English Version](./README.md) | 中文版

# @labacacia/nps-sdk — TypeScript / Node.js

面向 **Neural Protocol Suite (NPS)** 的 TypeScript SDK —— 为 AI Agent 设计的协议族。
属 [LabAcacia](https://github.com/LabAcacia) / INNO LOTUS PTY LTD 开源生态。

## 状态

**v1.0.0-alpha.5 —— NWP 错误码 + NPS 状态码扩展** · 5 个协议 · 284 个测试 · 覆盖率 ≥ 98%

| 协议 | 类 | 状态 |
|------|----|------|
| NCP — Neural Communication Protocol | 帧、编解码器 | ✅ |
| NWP — Neural Web Protocol | `NwpClient`、`NwpErrorCodes` | ✅ |
| NIP — Neural Identity Protocol | `NipIdentity`、`NipIdentVerifier`（RFC-0002 §8.1 双信任）、`AssuranceLevel`（RFC-0003）、`nip.x509` + `nip.acme` | ✅ |
| NDP — Neural Discovery Protocol | `InMemoryNdpRegistry`、`NdpAnnounceValidator`、`resolveWithDns`（DNS TXT 回退）、`DnsTxtLookup`、`SystemDnsTxtLookup`、`parseNpsTxtRecord` | ✅ |
| NOP — Neural Orchestration Protocol | `NopClient` | ✅ |

**alpha.5 新增：**

- `NwpErrorCodes` —— 从 `@labacacia/nps-sdk/nwp` 导出，包含 30 个 NWP wire 错误码字符串常量（`NWP-AUTH-*`、`NWP-QUERY-*`、`NWP-TOPOLOGY-*`、`NWP-RESERVED-TYPE-UNSUPPORTED` 等）。
- `NpsStatusCodes.NPS_SERVER_UNSUPPORTED` —— 新状态码 `"NPS-SERVER-UNSUPPORTED"`（HTTP 501）。
- `NipErrorCodes.REPUTATION_GOSSIP_FORK` / `.REPUTATION_GOSSIP_SIG_INVALID` —— RFC-0004 Phase 3 gossip 错误码。
- `AssuranceLevel.fromWire("")` 改为返回 `Anonymous`（spec §5.1.1 修复）。

**alpha.4 新增** —— 完整的 NPS-RFC-0002 X.509 + ACME `agent-01` NID 证书原语：

- `nip.x509` —— `issueLeaf` / `issueRoot` / `verify`（基于 `@peculiar/x509` + 原生 Web Crypto Ed25519）。
- `nip.acme` —— `AcmeClient` + 进程内 `AcmeServer` + JWS / messages helpers（RFC 8555 + RFC 8037 EdDSA）。
- `IdentFrame` 扩展非破坏性可选构造参数 `assuranceLevel` / `certFormat` / `certChain`；v1 verifier 忽略新字段。

## 安装

```bash
npm install @labacacia/nps-sdk
```

> **对等依赖：** Node.js 22+

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

// 生成并持久化
const id = NipIdentity.generate();
id.save("./my-key.json", process.env.KEY_PASS!);

// 加载并签名
const loaded = NipIdentity.load("./my-key.json", process.env.KEY_PASS!);
const sig    = loaded.sign({ action: "announce", nid: "urn:nps:node:example.com:data" });
const ok     = loaded.verify({ action: "announce", nid: "urn:nps:node:example.com:data" }, sig);
```

### NDP —— 注册表和签名校验

```typescript
import { InMemoryNdpRegistry, NdpAnnounceValidator } from "@labacacia/nps-sdk/ndp";
import { AnnounceFrame } from "@labacacia/nps-sdk/ndp";

const registry  = new InMemoryNdpRegistry();
const validator = new NdpAnnounceValidator();
validator.registerPublicKey(nid, identity.pubKeyString);

registry.announce(frame);
const resolved = registry.resolve("nwp://example.com/data/items");
```

### NOP —— 提交并等待任务

```typescript
import { NopClient, TaskFrame } from "@labacacia/nps-sdk/nop";

const client = new NopClient("http://orchestrator.example.com:17433");
const dag    = {
  nodes: [{ id: "classify", action: "classify-text", agent: "urn:nps:node:ml.example.com:classifier" }],
  edges: [],
};

const taskId = await client.submit(new TaskFrame("my-task-1", dag));
const status = await client.wait(taskId, { timeoutMs: 30_000 });
console.log(status.state, status.aggregatedResult);
```

## 包导出

```typescript
import { ... } from "@labacacia/nps-sdk";           // 全部
import { ... } from "@labacacia/nps-sdk/core";       // codec、帧、registry、cache
import { ... } from "@labacacia/nps-sdk/ncp";        // AnchorFrame、CapsFrame、StreamFrame、HelloFrame、…
import { ... } from "@labacacia/nps-sdk/nwp";        // NwpClient、QueryFrame、ActionFrame
import { ... } from "@labacacia/nps-sdk/nip";        // NipIdentity、IdentFrame、TrustFrame、RevokeFrame
import { ... } from "@labacacia/nps-sdk/ndp";        // InMemoryNdpRegistry、NdpAnnounceValidator、AnnounceFrame、…
import { ... } from "@labacacia/nps-sdk/nop";        // NopClient、NopTaskStatus、TaskFrame、…
```

## NCP 编解码

编解码层支持双 Tier 编码和对线上字节的直接操作：

```typescript
import { NpsFrameCodec, EncodingTier } from "@labacacia/nps-sdk/core";
import { createDefaultRegistry } from "@labacacia/nps-sdk";

const codec = new NpsFrameCodec(createDefaultRegistry());

// 编码（默认 MsgPack）
const wire = codec.encode(frame);

// 编码为 JSON（调试 / 互操作）
const json = codec.encode(frame, { overrideTier: EncodingTier.JSON });

// 解码
const decoded = codec.decode(wire);

// 仅读取帧头，不解码 payload
const header = NpsFrameCodec.peekHeader(wire);
console.log(header.frameType, header.isExtended, header.payloadLength);
```

## 开发

```bash
# 安装
npm install

# 测试
npm test

# 测试 + 覆盖率
npm run test -- --coverage

# 构建（ESM + CJS）
npm run build
```

## 许可证

Apache 2.0 —— 详见 [LICENSE](../../LICENSE)。
