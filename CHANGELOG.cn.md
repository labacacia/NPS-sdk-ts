[English Version](./CHANGELOG.md) | 中文版

# 变更日志 —— TypeScript SDK (`@labacacia/nps-sdk`)

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

在 NPS 达到 v1.0 稳定版之前，套件内所有仓库同步使用同一个预发布版本号。

---

## [1.0.0-alpha.4] —— 2026-04-30

### 新增

- **NPS-RFC-0001 Phase 2 —— NCP 连接前导（TypeScript helper 跟进）。**
  `src/ncp/preamble.ts` 暴露 `writePreamble(stream)` /
  `readPreamble(stream)`，往返字面量 `b"NPS/1.0\n"` 哨兵；
  `tests/ncp/preamble.test.ts` 覆盖。让 TypeScript SDK 与 .NET /
  Python / Go / Java 在 alpha.4 的 preamble helper 持平。
- **NPS-RFC-0002 Phase A/B —— X.509 NID 证书 + ACME `agent-01`
  （TypeScript 端口）。** 新增 `src/nip/` 子模块：
  - `nip/x509/` —— X.509 NID 证书 builder + verifier
    （`x509.Builder`、`x509.Verifier`）。
  - `nip/acme/` —— ACME `agent-01` 客户端 + 服务端参考实现
    （`AcmeServer`、`AcmeClient`）；按 NPS-RFC-0002 Phase B 的 JWS
    签名 wire 包络。
  - `nip/assurance-level.ts` —— Agent 身份保证等级
    （`anonymous` / `attested` / `verified`），承接 NPS-RFC-0003。
  - `nip/cert-format.ts` —— IdentFrame `cert_format` 判别器
    （`v1` Ed25519 vs. `x509`）。
  - `nip/error-codes.ts` —— NIP 错误码命名空间。
  - `nip/verifier.ts` —— dual-trust IdentFrame 验证器（v1 + X.509）。
- 20 个新测试覆盖 preamble 往返、X.509 签发 + 解析、dual-trust 验证、
  ACME agent-01 全流程。总数：284 tests 全绿（alpha.3 时 264）。

### 变更

- 分发版本升至 `1.0.0-alpha.4`。
- `src/nip/frames.ts` —— IdentFrame wire 形状扩展，可携带可选的
  `cert_format` 判别器 + `x509_chain` 字段，与 v1 Ed25519 字段并存。
  alpha.3 写出的 v1 IdentFrame 仍可被 alpha.4 验签。

### npm 发布说明

- 本仓库 / tag 是 `@labacacia/nps-sdk` `1.0.0-alpha.4` 的权威参考。
  延续 alpha.3 的情况，npm publish 可能需要带 2FA-bypass 的 granular
  access token —— 如果 npm registry 上的版本暂时落后于本仓库 tag，
  以 tag 为准；下一次 registry cut 后 `npm install` 即可解析到本
  commit。

### 套件级 alpha.4 要点

- **NPS-RFC-0002 X.509 + ACME** —— 完整跨 SDK 端口波（.NET / Java /
  Python / TypeScript / Go / Rust）。
- **NPS-CR-0002 —— Anchor Node topology 查询** —— `topology.snapshot`
  / `topology.stream`（.NET 参考 + L2 conformance）。TypeScript 消费
  侧 helper 后续版本跟进。
- **`nps-registry` SQLite 实仓** + **`nps-ledger` Phase 2**
  （RFC 9162 Merkle + STH + inclusion proof）已在 daemon 仓库交付。

---

## [1.0.0-alpha.3] —— 2026-04-25

### Changed

- 版本升级至 `1.0.0-alpha.3`，与 NPS `v1.0.0-alpha.3` 套件同步。本次 TypeScript SDK 无功能变更。
- 264 tests, ≥98% 覆盖率仍全绿。

### 套件级 alpha.3 要点（各语言 helper 在 alpha.4 跟进）

- **NPS-RFC-0001 —— NCP 连接前导**（Accepted）。原生模式连接现以字面量 `b"NPS/1.0\n"`（8 字节）开头。.NET SDK 已落地参考实现；TypeScript helper 在 alpha.4 跟进。
- **NPS-RFC-0003 —— Agent 身份保证等级**（Accepted）。NIP IdentFrame 与 NWM 新增三态 `assurance_level`（`anonymous`/`attested`/`verified`）。.NET 参考类型已落地；TypeScript 同步在 alpha.4。
- **NPS-RFC-0004 —— NID 声誉日志（CT 风格）**（Accepted）。append-only Merkle 日志条目结构发布；.NET 参考签名器已落地（并以 `nps-ledger` daemon Phase 1 形态发布）。TypeScript helper 在 alpha.4 跟进。
- **NPS-CR-0001 —— Anchor / Bridge 节点拆分。** 旧的 "Gateway Node" 角色更名为 **Anchor Node**；"NPS↔外部协议翻译" 单独成为 **Bridge Node** 类型。AnnounceFrame 新增 `node_kind` / `cluster_anchor` / `bridge_protocols`。源代码层面变更落在 `spec/` + .NET 参考实现。
- **6 个 NPS 常驻 daemon。** NPS-Dev 新建 `daemons/` 目录，定义 `npsd` / `nps-runner` / `nps-gateway` / `nps-registry` / `nps-cloud-ca` / `nps-ledger`；其中 `npsd` 提供 L1 功能性参考实现，其余为 Phase 1 骨架。

---

## [1.0.0-alpha.2] —— 2026-04-19

### Fixed

- **`NpsFrameCodec is not a constructor`** —— `src/core/index.ts` 现显式从 `./codec.js`、`./registry.js`、`./cache.js` 重新导出随包提供的 OOP API（`NpsFrameCodec`、`Tier1JsonCodec`、`Tier2MsgPackCodec`、`FrameRegistry`、`AnchorFrameCache`）。`./codecs/` 下的并行函数式 API 仍可通过直接路径导入，但不再自动导出（与类 API 在 `FrameType` / `EncodingTier` / `FrameHeader` 上冲突）。
- **缺失的 Ed25519 运行时依赖** —— `@noble/ed25519` 和 `@noble/hashes` 现已声明为运行时依赖。此前已被 `src/nip/identity.ts` 和 `src/ndp/validator.ts` import 但 `package.json` 未声明，导致 npm 消费者安装失败。

### Added

- **HelloFrame（NCP 0x06）** —— `src/ncp/frames.ts` 新增 `HelloFrame` 类（snake_case toDict/fromDict），在 `ncp/registry.ts` 中注册。`FrameType.HELLO = 0x06` 加入枚举。
- **subpath exports** —— `package.json` 的 `exports` 映射新增 `./nwp`、`./nip`、`./ndp`、`./nop`（此前仅声明 `.`、`./core`、`./ncp`，但 README 已示例使用全部六个）。

### Changed

- Node 引擎要求升级到 `>=22.0.0`。
- 264 测试全绿（此前为 158 通过 + 5 个文件失败 + 1 个测试失败）。

### 涵盖模块

- core / ncp / nwp / nip / ndp / nop

---

## [1.0.0-alpha.1] —— 2026-04-10

作为 NPS 套件 `v1.0.0-alpha.1` 的一部分首次公开 alpha。

[1.0.0-alpha.4]: https://gitee.com/labacacia/NPS-sdk-ts/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.1
