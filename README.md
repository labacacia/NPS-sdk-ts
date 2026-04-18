English | [中文版](./README.cn.md)

# NPS TypeScript SDK — `@labacacia/nps-sdk`

[![npm](https://img.shields.io/npm/v/@labacacia/nps-sdk)](https://www.npmjs.com/package/@labacacia/nps-sdk)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-43853D)](https://nodejs.org/)

TypeScript SDK for the **Neural Protocol Suite (NPS)** — a complete internet protocol stack purpose-built for AI Agents and models.

Dual-format output (ESM + CJS) · Node.js and modern browsers.

---

## NPS Repositories

| Repo | Role | Language |
|------|------|----------|
| [NPS-Release](https://github.com/labacacia/NPS-Release) | Protocol specifications (authoritative) | Markdown / YAML |
| [NPS-sdk-dotnet](https://github.com/labacacia/NPS-sdk-dotnet) | Reference implementation | C# / .NET 10 |
| [NPS-sdk-py](https://github.com/labacacia/NPS-sdk-py) | Async Python SDK | Python 3.11+ |
| **[NPS-sdk-ts](https://github.com/labacacia/NPS-sdk-ts)** (this repo) | Node/browser SDK | TypeScript |
| [NPS-sdk-java](https://github.com/labacacia/NPS-sdk-java) | JVM SDK | Java 21+ |
| [NPS-sdk-rust](https://github.com/labacacia/NPS-sdk-rust) | Async SDK | Rust stable |
| [NPS-sdk-go](https://github.com/labacacia/NPS-sdk-go) | Go SDK | Go 1.23+ |

---

## Status

**v1.0.0-alpha.1 — Phase 2 release** · 5 protocols · 139 tests · **≥ 98 % coverage**

| Protocol | Exported API | Status |
|----------|--------------|--------|
| NCP — Neural Communication Protocol | `NpsFrameCodec`, frame types | ✅ |
| NWP — Neural Web Protocol | `NwpClient` | ✅ |
| NIP — Neural Identity Protocol | `NipIdentity` | ✅ |
| NDP — Neural Discovery Protocol | `InMemoryNdpRegistry`, `NdpAnnounceValidator` | ✅ |
| NOP — Neural Orchestration Protocol | `NopClient` | ✅ |

## Installation

```bash
npm install @labacacia/nps-sdk
```

> **Peer requirement:** Node.js 18+ (for Web Crypto API). Modern browsers with native subtle crypto.

## Quick Start

### NWP — query a node

```typescript
import { NwpClient, QueryFrame } from "@labacacia/nps-sdk/nwp";

const client = new NwpClient("http://node.example.com:17433");
const caps   = await client.query(new QueryFrame("sha256:<anchor-id>", { active: true }, 20));
console.log(caps.count, caps.data);
```

### NWP — stream results

```typescript
for await (const chunk of client.stream(new QueryFrame("sha256:<anchor-id>"))) {
  console.log(chunk.seq, chunk.data);
}
```

### NWP — invoke an action

```typescript
import { ActionFrame } from "@labacacia/nps-sdk/nwp";

const result = await client.invoke(new ActionFrame("summarise", { maxTokens: 500 }));
```

### NIP — Ed25519 identity

```typescript
import { NipIdentity } from "@labacacia/nps-sdk/nip";

const id = NipIdentity.generate();
id.save("./my-key.json", process.env.KEY_PASS!);    // AES-256-GCM + PBKDF2

const loaded = NipIdentity.load("./my-key.json", process.env.KEY_PASS!);
const sig    = loaded.sign({ action: "announce", nid: "urn:nps:node:example.com:data" });
const ok     = loaded.verify({ action: "announce", nid: "urn:nps:node:example.com:data" }, sig);
```

### NDP — registry & validator

```typescript
import { InMemoryNdpRegistry, NdpAnnounceValidator, AnnounceFrame } from "@labacacia/nps-sdk/ndp";

const registry  = new InMemoryNdpRegistry();
const validator = new NdpAnnounceValidator();
validator.registerPublicKey(nid, identity.pubKeyString);

registry.announce(frame);
const resolved = registry.resolve("nwp://example.com/data/items");
```

### NOP — submit & wait

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

## API Reference

Full class and method reference lives under [`doc/`](./doc/):

| Subpath | Description | Reference |
|---------|-------------|-----------|
| —                                   | Overview, install, minimal example             | [`doc/overview.md`](./doc/overview.md) |
| `@labacacia/nps-sdk/core`           | Frame header, codec, anchor cache, exceptions | [`doc/nps-sdk.core.md`](./doc/nps-sdk.core.md) |
| `@labacacia/nps-sdk/ncp`            | NCP frames + handshake + stream manager       | [`doc/nps-sdk.ncp.md`](./doc/nps-sdk.ncp.md) |
| `@labacacia/nps-sdk/nwp`            | `QueryFrame`, `ActionFrame`, `NwpClient`      | [`doc/nps-sdk.nwp.md`](./doc/nps-sdk.nwp.md) |
| `@labacacia/nps-sdk/nip`            | `IdentFrame`, `TrustFrame`, `RevokeFrame`, `NipIdentity` | [`doc/nps-sdk.nip.md`](./doc/nps-sdk.nip.md) |
| `@labacacia/nps-sdk/ndp`            | NDP frames + `InMemoryNdpRegistry` + validator | [`doc/nps-sdk.ndp.md`](./doc/nps-sdk.ndp.md) |
| `@labacacia/nps-sdk/nop`            | DAG model, NOP frames, `NopClient`            | [`doc/nps-sdk.nop.md`](./doc/nps-sdk.nop.md) |

## Package Exports

```typescript
import { ... } from "@labacacia/nps-sdk";         // root — everything
import { ... } from "@labacacia/nps-sdk/core";    // codec, frames, registry, cache
import { ... } from "@labacacia/nps-sdk/ncp";     // AnchorFrame, CapsFrame, StreamFrame, …
import { ... } from "@labacacia/nps-sdk/nwp";     // NwpClient, QueryFrame, ActionFrame
import { ... } from "@labacacia/nps-sdk/nip";     // NipIdentity, IdentFrame, TrustFrame, RevokeFrame
import { ... } from "@labacacia/nps-sdk/ndp";     // InMemoryNdpRegistry, NdpAnnounceValidator, AnnounceFrame, …
import { ... } from "@labacacia/nps-sdk/nop";     // NopClient, NopTaskStatus, TaskFrame, …
```

## NCP Codec

```typescript
import { NpsFrameCodec, EncodingTier } from "@labacacia/nps-sdk/core";
import { createDefaultRegistry } from "@labacacia/nps-sdk";

const codec = new NpsFrameCodec(createDefaultRegistry());

const wire    = codec.encode(frame);                                          // MsgPack (default)
const json    = codec.encode(frame, { overrideTier: EncodingTier.JSON });     // JSON tier
const decoded = codec.decode(wire);

// Peek at the header without decoding the payload
const header = NpsFrameCodec.peekHeader(wire);
console.log(header.frameType, header.isExtended, header.payloadLength);
```

## NIP CA Server

A standalone NIP Certificate Authority server is bundled under [`nip-ca-server/`](./nip-ca-server/) — Fastify, SQLite-backed, Docker-ready.

## Development

```bash
npm install --no-bin-links                        # no symlinks needed
node node_modules/vitest/vitest.mjs run           # run 139 tests
node node_modules/vitest/vitest.mjs run --coverage
node node_modules/tsup/dist/cli-default.js        # build ESM + CJS
```

## License

Apache 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright 2026 INNO LOTUS PTY LTD
