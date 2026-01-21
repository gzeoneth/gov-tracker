# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Timeout cleanup** - Fixed potential resource leak where `clearTimeout()` was not called in error paths for API fetch operations (`signature-lookup.ts`, `cli.ts`)
- **TUI crash** - Fixed potential runtime error from unsafe non-null assertion when L2_TIMELOCK stage is missing (`useProposals.ts`)
- **Discovery logging** - Added logging for cases where block hash establishment fails during watermark verification (`discovery.ts`)
- **Retryable ticket decoding** - `decodeRetryableTicket()` now returns null on decode failure instead of throwing, improving robustness when processing malformed calldata
- **Topics bounds check** - Added bounds check before accessing `log.topics[1]` in timelock operation discovery (`timelock-discovery.ts`)

### Changed

- **Documentation** - Removed outdated API references to non-existent `trackFromGovernor()` and `trackFromTimelock()` methods in README, API.md, and EXAMPLES.md
- **Documentation** - Clarified cache fallback comments to use more descriptive terminology
- **Documentation** - Fixed incorrect test command names in ARCHITECTURE.md (`test:coverage` → `test:cov`)
- **Code cleanup** - Removed unused `CallInput` re-export from multicall utilities
- **Code cleanup** - Consolidated duplicate `parseLogsWithMapper` into shared `parseLogsSafe` utility
- **Code cleanup** - Removed duplicate `isTimelockOpKey` function, now imports from checkpoint-helpers
- **Code cleanup** - Removed duplicate block range logic in `params.ts`, now uses shared `getLogQueryBlockRange` from `contracts.ts`
- **Code cleanup** - Consolidated duplicate SC nonce extraction logic in `getHighestScNonceFromCheckpoints()` to use shared helper
- **Error handling** - Improved error type safety in election proposal ID lookup, CLI cycle errors, election tracking, and CLI error messages
- **Logging** - Added debug logging for block range fallback in election contracts and L1→L2 block conversion failures
- **Type safety** - Changed `RetryableSimulationData.l2Chain` from `Chain` to `L2Chain | "unknown"` to prevent invalid assignments
- **Performance** - Parallelize election tracking in `trackAllElections()` using Promise.all
- **Performance** - Parallelize checkpoint loading in `getAllCheckpoints()` and `queryIncompleteCheckpoints()` using Promise.all
- **Performance** - Parallelize cache lookups and writes in `createPendingCheckpoints()` for faster discovery
- **Robustness** - Use `Promise.allSettled` for watermark verification to continue with partial results on failures

### Removed

- **Public API** - Removed internal TUI utilities `getAllFoldableKeys` and `toggleFoldKey` from public exports (internal to calldata view only)

## [0.4.0] - 2026-01-19

### Added

- **Unified Tracking Pipeline** - Elections and proposals now share a single modular pipeline with three composable paths:
  - **Election path** (8 stages): CREATE_ELECTION → NOMINEE_ELECTION → NOMINEE_VETTING → MEMBER_ELECTION → timelock stages
  - **Governor path** (7 stages): PROPOSAL_CREATED → VOTING_ACTIVE → PROPOSAL_QUEUED → timelock stages
  - **Timelock path** (4 stages): L2_TIMELOCK → L2_TO_L1_MESSAGE → L1_TIMELOCK → RETRYABLE_EXECUTED
- **TrackingPath type** - New `"governor" | "timelock" | "election"` path type for stage initialization
- **Election type exports** - `ElectionContender`, `ElectionNominee`, `MemberElectionNominee`, `NomineeElectionDetails`, `MemberElectionDetails` and their serializable variants
- **Election serialization** - `serializeNomineeDetails()` and `serializeMemberDetails()` for caching election data
- **Modular checkpoint caching** - Parent checkpoints (proposals/elections) and timelock checkpoints are now stored separately and linked, enabling shared timelock tracking across multiple proposals
- **Stage helper functions** - `isStageTerminal(status)`, `isStageSuccess(status)`, `createParam()` utilities
- **Type-safe stage data access** - `StageDataMap` provides compile-time type checking when accessing stage-specific data
- **Security Council nonce-based deduplication** - `queryIncompleteCheckpoints()` now filters out SC operations with lower nonces when higher nonces exist (superseded operations are skipped)
- **SC nonce utility functions**:
  - `getHighestScNonce(nonces)` - Find highest nonce from array
  - `isScOperationSuperseded(nonce, highestNonce)` - Check if operation is superseded
  - `tracker.getHighestScNonce()` - Query highest SC nonce from cache

### Changed

- **Election module consolidation** - Merged 9 files into 7 for cleaner organization
- **Simplified chain utilities** - `chainToChainId()` now always returns a number (never undefined)
- **Internal refactoring** - Improved type safety and reduced code duplication
- **60-day age filter** - `queryIncompleteCheckpoints()` defaults to `maxAgeDays: 60`, filtering out checkpoints older than 60 days

### Fixed

- **CREATE_ELECTION stage** - Now includes creation transaction hash in stage transactions

### Breaking Changes

- **Removed deprecated path functions**:
  - `getStagesForPath(boolean)` → `getStagesForTrackingPath("governor" | "timelock" | "election")`
  - `initializeStagesForPath(boolean)` → `initializeStagesForTrackingPath("governor" | "timelock" | "election")`

- **Removed standalone election tracking functions** - Use `ProposalStageTracker` methods instead:
  - `trackElectionProposal()` → `tracker.trackElection(electionIndex)`
  - `trackAllElections()` → `tracker.trackAllElections()`
  - `trackIncompleteElections()` → `tracker.trackAllElections()` + filter by phase

  Migration example:
  ```typescript
  // Before (removed)
  import { trackElectionProposal } from "gov-tracker";
  const status = await trackElectionProposal(0, l2Provider, l1Provider);

  // After (use tracker)
  import { ProposalStageTracker } from "gov-tracker";
  const tracker = new ProposalStageTracker({ l2Provider, l1Provider });
  const status = await tracker.trackElection(0);
  ```

## [0.3.0] - 2026-01-16

### Added

- **Interactive TUI** (`ui` command) - Cache-only terminal interface with filter tabs, Vim navigation, search, sorting, clipboard support. No RPC required.
- **Unified Election Tracking** - Elections as first-class entities with `trackElection()`, `trackAllElections()`, auto-detection in `trackByTxHash`, and full tx preparation (`prepareElectionCreation/MemberElectionTrigger/MemberElectionExecution`)
- **Election API** - `getElectionCount()`, `ELECTION_TIMING` constants, bundled cache with nominee/member details
- **CLI** - `--inspect`/`-i` flag, shorthand flags (`-v`, `-p`, `-w`), selective tracking (`--track-core/treasury/elections/timelocks`)
- **Timelock Operation Tracking** - `trackByTxHash(txHash, operationId?)` for multi-operation transactions
- **Reorg Detection** - Discovery watermarks include block hashes
- **Security Utilities** - `truncateDescription()`, `sanitizeForDisplay()`, `safeJsonParse()`

### Changed

- **Performance** - Cache L2→L1 sendProps (saves ~3-4s)
- **Dependencies** - `dotenv` to devDeps, `commander` to optionalDeps, removed `p-limit`
- **CLI** - Default command `run`, fallback L1 RPC `https://eth.drpc.org`

### Fixed

- **Election phase timing** - Added `CONTENDER_SUBMISSION` phase, fixed vetting period (14d), corrected total duration (49d)
- **Multiple timelock operations per tx** - Operation-specific cache keys (`tx:{hash}:op:{opId}`)
- **ChunkingConfig** - Now respected throughout pipeline
- **RPC reliability** - All calls use `queryWithRetry`, block range errors marked permanent

### Security

- **Calldata decoding** - `decodeParameters()` returns `null` on failure, 4byte.directory opt-out, prototype pollution protection, 100KB description limit

### Reverted

- **L2_TIMELOCK callScheduledData deduplication** - Restores simpler code path

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

[Unreleased]: https://github.com/gzeoneth/gov-tracker/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/gzeoneth/gov-tracker/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/gzeoneth/gov-tracker/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
