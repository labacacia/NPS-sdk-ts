English | [中文版](./CHANGELOG.cn.md)

# Changelog — TypeScript SDK (`@labacacia/nps-sdk`)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until NPS reaches v1.0 stable, every repository in the suite is synchronized to the same pre-release version tag.

---

## [1.0.0-alpha.5] — 2026-05-01

### Added

- **NWP error code constants** — new `NwpErrorCodes` namespace exported from `@labacacia/nps-sdk/nwp` with all 30 NWP wire error codes (auth, query, action, task, subscribe, infrastructure, manifest, topology, reserved-type). Missing from previous releases.
- **`NpsStatusCodes.NPS_SERVER_UNSUPPORTED`** — new status code `"NPS-SERVER-UNSUPPORTED"` (HTTP 501) in `src/core/status-codes.ts`, per spec/status-codes.md alpha.5 update.
- **`NDP.resolveWithDns` — DNS TXT fallback resolution** — new `InMemoryNdpRegistry.resolveWithDns(target, resolver?)` falls back to `_nps-node.{host}` TXT record lookup (NPS-4 §5) when no in-memory entry matches. New `DnsTxtLookup` interface + `SystemDnsTxtLookup` (Node.js `dns.promises`); `parseNpsTxtRecord` + `extractHostFromTarget` helpers exported from `@labacacia/nps-sdk/ndp`. Tests: 284 → 294.

### Changed

- **`AssuranceLevel.fromWire("")` returns `Anonymous`** — `if (wire == null)` changed to `if (!wire)` so `""` returns `Anonymous` instead of `Unknown` (spec §5.1.1 backward-compat fix).
- **Version bump to `1.0.0-alpha.5`** — synchronized with NPS suite alpha.5 release.

### Fixed

- **`REPUTATION_GOSSIP_FORK` / `REPUTATION_GOSSIP_SIG_INVALID`** — two new NIP reputation gossip error codes added to `src/nip/error-codes.ts` (RFC-0004 Phase 3).

---

## [1.0.0-alpha.4] — 2026-04-30

### Added

- **NPS-RFC-0001 Phase 2 — NCP connection preamble (TypeScript helper
  parity).** `src/ncp/preamble.ts` exposes `writePreamble(stream)` and
  `readPreamble(stream)` round-tripping the literal `b"NPS/1.0\n"`
  sentinel; matched by `tests/ncp/preamble.test.ts`. Brings TypeScript
  in line with the .NET / Python / Go / Java preamble helpers shipped
  at alpha.4.
- **NPS-RFC-0002 Phase A/B — X.509 NID certificates + ACME `agent-01`
  (TypeScript port).** New surface under `src/nip/`:
  - `nip/x509/` — X.509 NID certificate builder + verifier
    (`x509.Builder`, `x509.Verifier`).
  - `nip/acme/` — ACME `agent-01` client + server reference
    (`AcmeServer`, `AcmeClient`); JWS-signed wire envelope per
    NPS-RFC-0002 Phase B.
  - `nip/assurance-level.ts` — agent identity assurance levels
    (`anonymous` / `attested` / `verified`) per NPS-RFC-0003.
  - `nip/cert-format.ts` — IdentFrame `cert_format` discriminator
    (`v1` Ed25519 vs. `x509`).
  - `nip/error-codes.ts` — NIP error code namespace strings.
  - `nip/verifier.ts` — dual-trust IdentFrame verifier (v1 + X.509).
- 20 new tests covering preamble round-trip, X.509 issuance + parsing,
  dual-trust verification, and ACME agent-01 round-trip. Total: 284
  tests green (was 264 at alpha.3).

### Changed

- Distribution version bumped to `1.0.0-alpha.4`.
- `src/nip/frames.ts` — IdentFrame wire shape extended with optional
  `cert_format` discriminator + `x509_chain` field alongside the
  existing v1 Ed25519 fields. v1 IdentFrames written by alpha.3
  consumers continue to verify unchanged.

### Note: npm publish status

- This repo / tag is the canonical `1.0.0-alpha.4` reference for
  `@labacacia/nps-sdk`. As at the alpha.3 ship cycle, npm publish
  may require a granular access token with 2FA-bypass enabled — if
  the registry version lags this repo's tag, the tag is the
  authoritative artifact and `npm install` against the next
  registry cut will resolve to this commit.

### Suite-wide highlights at alpha.4

- **NPS-RFC-0002 X.509 + ACME** — full cross-SDK port wave (.NET /
  Java / Python / TypeScript / Go / Rust). Servers can now issue
  dual-trust IdentFrames (v1 Ed25519 + X.509 leaf cert chained to a
  self-signed root) and self-onboard NIDs over ACME's `agent-01`
  challenge type.
- **NPS-CR-0002 — Anchor Node topology queries** — `topology.snapshot`
  / `topology.stream` query types (.NET reference + L2 conformance
  suite). TypeScript consumer-side helpers planned for a later
  release.
- **`nps-registry` SQLite-backed real registry** + **`nps-ledger`
  Phase 2** (RFC 9162 Merkle + STH + inclusion proofs) shipped in the
  daemon repos.

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

[1.0.0-alpha.5]: https://github.com/labacacia/NPS-sdk-ts/releases/tag/v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/labacacia/NPS-sdk-ts/releases/tag/v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/LabAcacia/NPS-Dev/releases/tag/v1.0.0-alpha.1
