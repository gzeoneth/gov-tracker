# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-01-18

### Added

- **Unified Tracking Pipeline** - Refactored proposal and election tracking into a single modular pipeline architecture with three composable modules:
  - **Election Preamble** (CREATE_ELECTION → NOMINEE_ELECTION → NOMINEE_VETTING → MEMBER_ELECTION)
  - **Proposal Voting** (PROPOSAL_CREATED → VOTING_ACTIVE → PROPOSAL_QUEUED)
  - **Timelock Execution** (L2_TIMELOCK → L2_TO_L1_MESSAGE → L1_TIMELOCK → RETRYABLE_EXECUTED)
- **TrackingPath type** - New `"governor" | "timelock" | "election"` path type for stage initialization
- **Election stage functions** - `pipelineTrackCreateElection`, `pipelineTrackNomineeElection`, `pipelineTrackNomineeVetting`, `pipelineTrackMemberElection` in pipeline.ts
- **Pipeline dispatch** - Each pipeline (`trackGovernorPipeline`, `trackTimelockPipeline`, `trackElectionPipeline`) handles its own stage tracking
- **Election-specific state getters** - `getElectionIndex`, `getNomineeProposalId`, `getMemberProposalId`, `getElectionCohort`, `getCompliantNomineeCount`, etc.
- **Election type exports** - Export detailed election types from main package index: `ElectionContender`, `ElectionNominee`, `MemberElectionNominee`, `NomineeElectionDetails`, `MemberElectionDetails`, and serializable variants (`SerializableContender`, `SerializableNominee`, `SerializableMemberNominee`, `SerializableNomineeDetails`, `SerializableMemberDetails`)
- **Election serialization exports** - Export `serializeNomineeDetails()` and `serializeMemberDetails()` for caching election data
- **Cached L1 block fetch** - `getL1BlockNumberFromL2(provider, blockTag?)` now accepts optional block tag/number (default: "latest") and caches results for specific block numbers (immutable mapping)
- **Modular Caching** - Parent checkpoints (proposals/elections) and timelock checkpoints are now stored separately and linked via `timelockOpKey`:
  - `createModularCheckpoints(state, parentCacheKey)` - Splits stages into parent and timelock checkpoints
  - `splitStages(stages)` - Separates parent stages from timelock path stages
  - `hasTimelockProgress(stages)` - Checks if any timelock stages have started
  - `isTimelockPathStage(type)` - Type guard for L2_TIMELOCK → RETRYABLE_EXECUTED stages
  - `setTimelockOpKey(state, key)` - Links parent state to timelock operation
- **Linked checkpoint loading** - `createTrackingState` accepts `linkedTimelockCheckpoint` option to merge timelock stages from a separate checkpoint
- **Stage helper functions** - New utilities for working with stages:
  - `isStageTerminal(status)` - Check if stage is in a terminal state (COMPLETED, FAILED, SKIPPED)
  - `isStageSuccess(status)` - Check if stage completed successfully (COMPLETED, SKIPPED)
  - `createParam(name, type, value)` - Helper to create DecodedParameter objects
- **Type-safe stage data access** - `StageDataMap` provides compile-time type checking when accessing stage-specific data

### Changed

- **Election module consolidation** - Reduced from 9 files to 7 files:
  - Merged `tracking.ts` → `proposal-ids.ts` (proposal ID lookup utilities)
  - Merged `prepare.ts` → `params.ts` (transaction preparation with proposal params)
- **`trackElection()` now uses unified pipeline** - ProposalStageTracker.trackElection() internally uses `trackElectionWithPipeline()` for stage-based election tracking
- **Simplified chain utilities** - `chainToChainId()` now always returns a number (never undefined)
- **Code quality improvements** - Extensive refactoring across all modules:
  - Extracted common patterns into reusable helpers
  - Simplified try-catch blocks using `.catch()` pattern
  - Replaced verbose conditionals with functional patterns
  - Removed redundant chain ID lookups and dead exports
  - Improved type safety throughout the codebase

### Fixed

- **CREATE_ELECTION stage** - Now includes creation transaction hash in stage transactions

### Testing

- **Expanded test coverage** - Added comprehensive unit tests for:
  - Election module (proposal IDs, participants, status)
  - CLI utilities (formatters, RPC warnings)
  - Security Council extraction functions
  - Tracker election cache behavior
- **Test infrastructure improvements**:
  - Shared RPC test setup helpers (`createRpcTestSuite`, `TestDataCache`)
  - Centralized `MockCache` implementation
  - Consistent `shouldSkipRpc()` pattern across all test files
  - Unified fixture imports through helpers module
- **Coverage merge infrastructure** - Support for merging coverage from unit and fork tests

### Breaking Changes

- **Removed deprecated path functions** - Use the new `TrackingPath`-based functions instead:
  - `getStagesForPath(boolean)` → `getStagesForTrackingPath("governor" | "timelock" | "election")`
  - `initializeStagesForPath(boolean)` → `initializeStagesForTrackingPath("governor" | "timelock" | "election")`

- **Removed standalone election tracking functions** - The following functions have been removed from the public API:
  - `trackElectionProposal()` - Use `ProposalStageTracker.trackElection(electionIndex)` instead
  - `trackAllElections()` - Use `ProposalStageTracker.trackAllElections()` instead
  - `trackIncompleteElections()` - Use `ProposalStageTracker.trackAllElections()` and filter by phase

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
