# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CLI: `--inspect` flag with `-i` shorthand** - New flag for `track` command that performs normal tracking AND decodes calldata (unlike `--inspect-only` which skips tracking)

- **Security: Sanitization utilities** - New `src/utils/sanitize.ts` module:
  - `truncateDescription(description)`: Limits strings to 100KB to prevent DoS
  - `sanitizeForDisplay(str)`: Removes ANSI escape codes and control characters
  - `safeJsonParse<T>(json)`: JSON parsing with prototype pollution protection

- **CLI: Shorthand flags** - `-v` (verbose), `-p` (prepare), `-w` (write), `-i` (inspect)

- **Bundled cache JSON export** - Importable via `import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json"` for bundlers

- **`LookupSignatureOptions` type** - New exported type for configuring signature lookup

- **Election Tracking Integration** - Elections now tracked as first-class entities in the bundled cache:
  - `ElectionTrackingInput` type for election checkpoint identification
  - `trackAllElections(l2Provider, l1Provider)`: Track all Security Council elections
  - `trackIncompleteElections(l2Provider, l1Provider)`: Track only active elections
  - `getElectionIndexForProposalId(proposalId, l2Provider, l1Provider)`: Map proposal ID to election index
  - `tracker.saveElectionCheckpoint(electionStatus)`: Persist election status to cache
  - `tracker.getElectionCheckpoint(electionIndex)`: Retrieve cached election status
  - CLI `run` command now tracks elections in Phase 3 after proposals/timelocks
  - Cache key pattern: `election:{index}`

- **Full Election Lifecycle Preparation** - Complete A→B→C election transaction preparation:
  - `prepareElectionCreation()`: Step A - Create nominee election proposal
  - `prepareMemberElectionTrigger()`: Step B - Execute nominee election to create member proposal
  - `prepareMemberElectionExecution()`: Step C - Execute member election to install council members
  - `getMemberElectionProposalParams()`: Get member election proposal parameters
  - `canExecuteMember` flag in `ElectionProposalStatus` indicates Step C readiness
  - `ElectionCheckResult.prepared.executeMember`: Prepared transaction for Step C

- **Detailed Election Tracking** - Track election participant data and votes:
  - `ElectionContender` type: Contender address, registration block, and tx hash
  - `ElectionNominee` type: Nominee address, votes received, exclusion status
  - `MemberElectionNominee` type: Nominee weight received, winner status, rank
  - `NomineeElectionDetails` type: Full nominee election aggregate (contenders, nominees, quorum)
  - `MemberElectionDetails` type: Full member election aggregate (weighted votes, winners)
  - `getContenders(proposalId, provider)`: Fetch ContenderAdded events
  - `getNomineesWithVotes(proposalId, provider)`: Fetch nominees with vote counts
  - `getExcludedNominees(proposalId, provider)`: Fetch NomineeExcluded events
  - `getNomineeElectionDetails(electionIndex, provider)`: Aggregate nominee election data
  - `getMemberElectionDetails(electionIndex, provider)`: Aggregate member election data with rankings

- **Reorg Detection for Discovery Watermarks** - Watermarks now include block hashes for chain reorganization detection:
  - `WatermarkHashes` type for storing block hashes alongside watermarks
  - `verifyWatermark(key, blockNumber, hash, provider)`: Verify watermark validity
  - `loadWatermarks()` returns `{ watermarks, hashes }` tuple
  - `saveWatermarks(watermarks, hashes, cache)`: Save both watermarks and hashes
  - `TrackingCheckpoint.cachedData.watermarkHashes`: Persisted hash storage

### Changed

- **CLI: Public RPC warning** - Warns when using default public RPC URLs

- **CLI: Health check timeout** - 5-second timeout to prevent loop stalls

- **Cache: Remove L2_TIMELOCK callScheduledData duplication** - Reduces cache size by ~100KB per proposal. Breaking: `callScheduledData` now optional in `TimelockStageData`

- **Performance: Cache L2->L1 sendProps** - Skip ~3-4s redundant `getSendProps()` call during preparation

- **Dependencies: Reduced production footprint** - `dotenv` to devDependencies, `commander` to optionalDependencies, removed `p-limit`

- **Dependencies: Version bumps** - ethers ^5.8.0, debug ^4.4.0, typescript ^5.8.0

- **CLI: Default L1 RPC** - Falls back to `https://eth.llamarpc.com`

- **CLI: Default command is `run`** - `npx gov-tracker` now runs discovery

- **CLI: Renamed scripts** - `monitor:*` -> `cli:*`

### Security

- **Graceful calldata decode failures** - `decodeParameters()` returns `null` instead of throwing

- **4byte.directory lookup opt-out** - `DISABLE_4BYTE_LOOKUP=1` env var or `{ disableApiLookup: true }` option

- **Prototype pollution protection** - `FileCache` and `LocalStorageCache` use `safeJsonParse()`

- **Description size limit** - Truncates to 100KB in `parseProposalCreatedEvent()`

- **CLI: Version shown in help** - Displays version in description

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
