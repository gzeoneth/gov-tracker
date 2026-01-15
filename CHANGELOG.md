# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Unified Election Tracking** - Elections are now first-class entities:
  - `trackByTxHash` auto-detects election proposals and populates `TrackingResult.electionStatus`
  - `tracker.trackElection(electionIndex)` for direct election tracking
  - `trackAllElections()` / `trackIncompleteElections()` for bulk tracking
  - Election checkpoints cached with key pattern `election:{index}`
  - Full A→B→C transaction preparation: `prepareElectionCreation()`, `prepareMemberElectionTrigger()`, `prepareMemberElectionExecution()`
  - Detailed participant tracking: contenders, nominees, votes, rankings

- **CLI Enhancements**:
  - Election auto-switch: displays election status instead of 7 NOT_STARTED stages when tracking `createElection` tx
  - `--inspect` / `-i` flag: track AND decode calldata (vs `--inspect-only` which skips tracking)
  - Shorthand flags: `-v` (verbose), `-p` (prepare), `-w` (write)
  - Selective tracking: `--track-core`, `--track-treasury`, `--track-elections`, `--track-timelocks`

- **Reorg Detection** - Discovery watermarks now include block hashes for chain reorganization detection

- **Security Utilities** - `truncateDescription()`, `sanitizeForDisplay()`, `safeJsonParse()` for input sanitization

### Changed

- **Cache: Remove L2_TIMELOCK callScheduledData duplication** - Reduces cache size ~100KB per proposal. Breaking: `callScheduledData` now optional in `TimelockStageData`
- **Performance: Cache L2→L1 sendProps** - Skips ~3-4s redundant `getSendProps()` call during preparation
- **Dependencies** - `dotenv` to devDeps, `commander` to optionalDeps, removed `p-limit`
- **CLI** - Default command is `run`, default L1 RPC falls back to `https://eth.llamarpc.com`, warns on public RPCs

### Fixed

- **ChunkingConfig respected throughout pipeline** - User-provided config now flows through all discovery and tracking functions
- **All RPC calls use queryWithRetry** - Consistent rate limit and transient failure handling

### Security

- **Calldata decode failures** - `decodeParameters()` returns `null` instead of throwing
- **4byte.directory opt-out** - `DISABLE_4BYTE_LOOKUP=1` env var or `{ disableApiLookup: true }`
- **Prototype pollution protection** - Cache implementations use `safeJsonParse()`
- **Description size limit** - Truncates to 100KB

## [0.2.1] - 2026-01-09

### Added

- **Bundled proposal cache** - Pre-built cache (~2.4MB, ~95 proposals) eliminates initial discovery RPC calls

- **`getBundledCachePath()` export** - Get path to bundled cache for SDK users

- **CLI: `--no-cache` flag** - Disable caching entirely

- **CLI: `--version` flag** - Show version from package.json

### Changed

- **Performance: Block info cache TTL 60s** - Up from 2s. Added `invalidateBlockInfoCache()` for refresh

- **Performance: `StaticJsonRpcProvider`** - Avoids redundant `eth_chainId` calls

- **Performance: Skip SC check for governor proposals** - Saves 1 RPC call per L2 timelock

- **Performance: Cache block timestamps** - Immutable data, no redundant calls

- **Performance: Skip redundant CallExecuted search** - `skipExecutedSearch` option

- **Performance: Fast-path L1->L2 block conversion** - 1 RPC call vs ~23 in fallback

## [0.2.0] - 2026-01-09

### Added

- **Chain utilities**: `KnownChain`, `L2Chain` types, `isKnownChain()`, `isL2Chain()`, `isRetryable()` guards, `getChainDisplayName()`

- **New exports**: `NETWORK_IDS`, `TIMELOCK_SELECTORS`, `FileCache`, `LocalStorageCache`, `MemoryCache`, `getChain()`, `getChainId()`

- **Test coverage**: Increased from 319 to 1050+ tests with fork testing via Anvil

### Changed

- **Constants consolidated** - URL utilities moved to `constants.ts`

- **Modules consolidated** - Merged address-utils, extraction, scoped-logger into main modules

### Fixed

- **Security**: `extractCalldataFromStage` throws when `value` missing from `callScheduledData`

- `getRetryableChainName("nova")` returns "Nova" instead of "nova"

### Breaking Changes

#### DecodedParameter: `value` -> `displayValue`
```typescript
// Before: param.value (might be truncated)
// After: param.displayValue (UI) or param.rawValue (programmatic)
```

#### TrackedStage Discriminated Union
`TrackedStage` now discriminates by `type`. TypeScript narrows `data` automatically:
```typescript
if (stage.type === "VOTING_ACTIVE") {
  console.log(stage.data.forVotes); // TypeScript knows VotingActiveData
}
```

#### Chain Type Refactoring
- `ChainType` ("L1", "L2", "NOVA") -> `Chain` ("ethereum", "arb1", "nova")
- `TargetChainType` ("Arb1", "Nova") -> `L2Chain` ("arb1", "nova")
- Added `ChainId` numeric type and conversion functions

### Removed

- Unused types: `L2ToL1MessageData`, `L2ToL1MessageStatus`, `RetryableStatus`, `RetryableData`, etc.
- Renamed: `TrackingContext` -> `TrackingState`, `createTrackingContext()` -> `createTrackingState()`
- Removed exports: `getKnownAddresses()`, `lookup4byteDirectory()`, `clearSignatureCache()`, `chainTypeToId()`, `getChainType()`

## [0.1.2] - 2026-01-07

### Added

- **GitHub Copilot Instructions** - Added `.github/copilot-instructions.md`

### Fixed

- **ethers.js compatibility** - Fixed `values` property collision and Interface initialization

## [0.1.1] - 2026-01-06

### Added

- **Calldata Decoding Module** - Recursive decoder, signature lookup, address labeling
- **Simulation Data Module** - Tenderly/Foundry-ready data extraction
- **CLI**: `--inspect-only`, `--show-simulation` flags
- **SDK APIs**: `decodeCalldata()`, `lookupSignature()`, `getAddressLabel()`, `extractAllSimulationsFromDecoded()`, etc.

### Changed

- **CLI**: `track --tx <hash>` -> `track <tx-hash>` (positional argument)
- Enhanced vote display with human-readable ARB amounts

### Security

- Input validation, API timeouts, recursion limits, strict TypeScript

## [0.1.0] - 2026-01-05

Initial release with 7-stage governance tracking across Ethereum L1, Arbitrum One, and Nova.

---

[0.2.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
