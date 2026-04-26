English | [中文版](./CHANGELOG.cn.md)

# Changelog — TypeScript SDK (`@labacacia/nps-sdk`)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until NPS reaches v1.0 stable, every repository in the suite is synchronized to the same pre-release version tag.

---

## [1.0.0-alpha.3] — 2026-04-25

### Changed

- Version bump to `1.0.0-alpha.3` for suite-wide synchronization with the NPS `v1.0.0-alpha.3` release. No functional changes in the TypeScript SDK at this milestone.
- 264 tests, ≥98% coverage still green.

### Suite-wide highlights at alpha.3 (per-language helpers planned for alpha.4)

- **NPS-RFC-0001 — NCP connection preamble** (Accepted). Native-mode connections now begin with the literal `b"NPS/1.0\n"` (8 bytes). Reference helper landed in the .NET SDK; TypeScript helper deferred to alpha.4.
- **NPS-RFC-0003 — Agent identity assurance levels** (Accepted). NIP IdentFrame and NWM gain a tri-state `assurance_level` (`anonymous`/`attested`/`verified`). Reference types landed in .NET; TypeScript parity deferred to alpha.4.
- **NPS-RFC-0004 — NID reputation log (CT-style)** (Accepted). Append-only Merkle log entry shape published; reference signer landed in .NET (and shipped as the `nps-ledger` daemon Phase 1). TypeScript helpers deferred to alpha.4.
- **NPS-CR-0001 — Anchor / Bridge node split.** The legacy "Gateway Node" role is renamed to **Anchor Node**; the "translate NPS↔external protocol" role is now its own **Bridge Node** type. AnnounceFrame gained `node_kind` / `cluster_anchor` / `bridge_protocols`. Source-of-truth changes are in `spec/` + the .NET reference implementation.
- **6 NPS resident daemons.** New `daemons/` tree in NPS-Dev defines `npsd` / `nps-runner` / `nps-gateway` / `nps-registry` / `nps-cloud-ca` / `nps-ledger`; `npsd` ships an L1-functional reference and the rest ship as Phase 1 skeletons.

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

[1.0.0-alpha.3]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.1
