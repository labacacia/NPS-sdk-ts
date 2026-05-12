English | [中文版](./CHANGELOG.cn.md)

# Changelog — TypeScript SDK (`@labacacia/nps-sdk`)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until NPS reaches v1.0 stable, every repository in the suite is synchronized to the same pre-release version tag.

---

## [1.0.0-alpha.2] — 2026-04-19

### Fixed

- **`NpsFrameCodec is not a constructor`** — `src/core/index.ts` now explicitly re-exports the shipped OOP API (`NpsFrameCodec`, `Tier1JsonCodec`, `Tier2MsgPackCodec`, `FrameRegistry`, `AnchorFrameCache`) from `./codec.js`, `./registry.js`, `./cache.js`. The parallel functional API under `./codecs/` remains reachable by direct path but is no longer auto-exported (it collided on `FrameType` / `EncodingTier` / `FrameHeader`).
- **Missing Ed25519 runtime deps** — `@noble/ed25519` and `@noble/hashes` are now declared as runtime dependencies. Previously imported by `src/nip/identity.ts` and `src/ndp/validator.ts` but not listed in `package.json`, causing install failures for npm consumers.

### Added

- **HelloFrame (NCP 0x06)** — new `HelloFrame` class in `src/ncp/frames.ts` with snake_case toDict/fromDict, registered in `ncp/registry.ts`. `FrameType.HELLO = 0x06` added to the enum.
- **Subpath exports** — `package.json` `exports` map now includes `./nwp`, `./nip`, `./ndp`, `./nop` (previously only `.`, `./core`, `./ncp` were declared even though README documented all six).

### Changed

- Node engine requirement raised to `>=22.0.0`.
- 264 tests green (up from 158 previously passing + 5 file failures + 1 test failure).

### Covered modules

- core / ncp / nwp / nip / ndp / nop

---

## [1.0.0-alpha.1] — 2026-04-10

First public alpha as part of the NPS suite `v1.0.0-alpha.1` release.

[1.0.0-alpha.2]: https://github.com/LabAcacia/nps/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/LabAcacia/nps/releases/tag/v1.0.0-alpha.1
