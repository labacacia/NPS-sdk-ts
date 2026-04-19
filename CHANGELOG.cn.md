[English Version](./CHANGELOG.md) | 中文版

# 变更日志 —— TypeScript SDK (`@labacacia/nps-sdk`)

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

在 NPS 达到 v1.0 稳定版之前，套件内所有仓库同步使用同一个预发布版本号。

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

[1.0.0-alpha.2]: https://github.com/LabAcacia/nps/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/LabAcacia/nps/releases/tag/v1.0.0-alpha.1
