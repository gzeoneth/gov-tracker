# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Governance vote preparation** - Prepare-only functions for voting on Core/Treasury Governor proposals:
  - `prepareCastVote(proposalId, support)` - Simple vote (For/Against/Abstain)
  - `prepareCastVoteWithReason(proposalId, support, reason)` - Vote with on-chain reason
  - `prepareCastVoteWithReasonAndParams(proposalId, support, reason, params)` - Vote with custom params
  - `VOTE_SUPPORT` enum: `AGAINST` (0), `FOR` (1), `ABSTAIN` (2)
  - Governor shorthand: pass `"constitutional"` or `"non-constitutional"` instead of addresses
- **Operation ID hashing (public)** - `hashOperation()` and `hashOperationBatch()` now exported from public API (previously internal-only)
- **Governor voting ABI** - Added `castVote`, `castVoteWithReason`, `castVoteWithReasonAndParams`, `castVoteBySig`, `getVotes` to `GOVERNOR_ABI`
- **Election write actions** - Prepare-only functions for election participation (contender registration, vote casting):
  - `encodeElectionVoteParams()` / `decodeElectionVoteParams()` - ABI encode/decode `(address, uint256)` vote params
  - `getAddContenderTypedData()` - Build EIP-712 typed data for contender registration signing
  - `prepareAddContender()` - Prepare `addContender(proposalId, signature)` transaction
  - `prepareContenderRegistration()` - Two-phase API: returns typed data for signing + `buildTransaction(signature)` for submission
  - `prepareNomineeElectionVote()` / `prepareMemberElectionVote()` - Prepare `castVoteWithReasonAndParams` transactions
  - Types: `AddContenderTypedData`, `PreparedContenderRegistration`
- **ABI exports** - All governance ABIs now publicly exported in two formats: human-readable `as const` (`GOVERNOR_ABI`, `TIMELOCK_ABI`, etc.) for ethers v5 and abitype, and JSON `as const` (`governorAbi`, `timelockAbi`, etc.) for wagmi/viem `useReadContract`/`useWriteContract` type inference. Curated read/write subsets (`governorReadAbi`, `governorWriteAbi`, `nomineeElectionGovernorReadAbi`, etc.) for large ABIs that exceed viem's type inference limits
- **Standalone timelock execution** - `prepareExecuteTimelock(timelockAddress, operationId, salt, provider)` prepares a timelock `execute`/`executeBatch` transaction without requiring the full tracking pipeline. Auto-detects single vs batch operations from on-chain `CallScheduled` events
- **Sync timelock calldata prep** - `prepareTimelockExecuteCalldata()` and `prepareTimelockBatchCalldata()` encode timelock execution calldata without a provider, for consumers that already have operation params from tracking
- **Proposal state constants** - `PROPOSAL_STATE` (numeric enum: `PENDING=0` through `EXECUTED=7`), `PROPOSAL_STATE_MAP` (PascalCase reverse lookup), and `PROPOSAL_STATE_LABEL` (lowercase reverse lookup) now exported for consumers tracking proposal lifecycle
- **ARB_TOKEN address** - `ADDRESSES.ARB_TOKEN` (`0x912C...6548`) exported — the last governance address consumers had to hardcode locally
- **RPC utilities (public)** - `queryWithRetry`, `isPermanentError`, `isRetryableError`, `getErrorMessage` now exported for consumers building retry logic around the SDK
- **BigNumber sorting** - `compareBigNumbers` exported for sorting `CallScheduledData` arrays by index
- **Public provider access** - `l2Provider`, `l1Provider`, and `novaProvider` are now publicly accessible as readonly properties on `ProposalStageTracker`
- **Stage merging utilities** - Helpers for combining stages from multiple checkpoints into a unified timeline:
  - `mergeStages(primary, secondary)` - Merge stages with intelligent deduplication (prefers higher status)
  - `normalizeTimeline(stages)` - Sort stages in canonical pipeline order
  - `splitStages(stages)` - Split into parent and timelock stages (re-exported for convenience)
- **Simulation extraction by action index** - `extractSimulationsByActionIndex(decodedActions, chain)` returns `IndexedSimulation[]` with `actionIndex` tracking for UI builders
- **Tenderly payload builders** - Dependency-free utilities for building Tenderly API requests:
  - `buildTenderlySimRequest(simulation, overrides?)` - Build simulate endpoint payload
  - `buildTenderlyEncodeStatesRequest(simulations)` - Build encode-states payload for timelock storage overrides
- **RPC URL support** - `TrackerOptions` now accepts RPC URLs as strings in addition to Provider objects. `l1Provider`, `l2Provider`, and `novaProvider` all accept either `ethers.providers.Provider` or a URL string
- **Bundled cache extraction utilities** - Type-safe helpers for extracting data from bundled cache JSON:
  - `extractProposals()` - Extract proposal metadata from cache
  - `extractTimelockOps()` - Extract timelock operation metadata
  - `extractElections()` - Extract election metadata
  - `extractOperationIds()` - Get Map of proposalId → operationId
  - `getWatermarksFromCache()` - Get discovery watermarks from cache
  - `getVotingDataFromStages()` - Extract typed vote data from stages
  - `extractTimelockLinkFromStages()` - Extract TimelockLink from completed stages
- `getAllStageMetadata()` - Memoized function returning `Record<StageType, StageMetadata>` for all stage types
- `ALL_STAGE_TYPES` - Constant array of all stage types in pipeline order
- `trimFromStage(checkpoint, stageIndex)` - Trim checkpoint stages for re-tracking scenarios
- `getLifecyclePhase(stages)` - Returns human-readable `LifecyclePhase`: `voting`, `queued`, `l2_delay`, `bridging`, `l1_delay`, `finalizing`, `executed`, `failed`, `unknown`
- `loadWatermarks()` / `LoadedWatermarks` - Access discovery watermarks from cache
- `getReceiptOrNull()` / `getErrorMessage()` - Shared RPC and error utilities

### Fixed

- **PreparedTransaction typed hex fields** - `to` and `data` are now typed as `` `0x${string}` `` instead of `string`, eliminating consumer-side casts for wagmi/viem integration
- **AddContenderTypedData wagmi compatibility** - `message.proposalId` is now `bigint` (was `string`), matching wagmi's `useSignTypedData` expectation. `domain.verifyingContract` is now `` `0x${string}` ``
- **AddContenderTypedData compatibility** - `types.AddContenderMessage` field changed from `readonly` tuple with literal types to `Array<{ name: string; type: string }>`, fixing assignability errors with ethers v5 `signer._signTypedData()` and ethers v6 `signer.signTypedData()`
- **PreparedTransaction chain/chainId consistency** - Write-action functions that accept `chainId` now derive `chain` via `chainIdToChain(chainId)` instead of hardcoding `"arb1"`, preventing misrouted transactions when targeting non-42161 deployments
- **BigNumber overflow** - Use `.gt()`/`.lt()` instead of `.toNumber()` for CallScheduled index sorting
- **Discovery errors** - Provider errors during watermark verification now return `isValid: false`
- **Decode errors** - `decodeRetryableTicket()`, `prepareTimelockSimulation()`, `convertScheduleToExecute()` return null on failure instead of throwing
- **CLI validation** - NaN-safe parsing for gas settings and election indices
- **Bounds checks** - Safe array access for `log.topics`, multicall results, and TUI components
- **Timeout cleanup** - Fixed `clearTimeout()` not called in error paths for API fetch operations

### Changed

- **Documentation** - Removed outdated `trackFromGovernor()`/`trackFromTimelock()` API references; fixed test command names
- **Performance** - Parallelize cache operations throughout (checkpoint loading, election tracking, deduplication, SC nonce queries)
- **Performance** - Fetch gas price once per batch in `calculateBatchRetryableValues()`
- **Performance** - `--force` clears cache at session start instead of bypassing mid-session
- **Robustness** - `Promise.allSettled` for watermark verification; graceful fallback for Arbitrum network detection
- **Type safety** - `RetryableSimulationData.l2Chain` changed to `L2Chain | "unknown"`
- **Code consolidation** - Time constants centralized in `TIMING` object; address comparison uses shared utilities

### Refactored

- Consolidated duplicate code: gas error detection (`isGasEstimationError`), markdown title extraction, SC nonce helpers, fromBlock validation
- Replaced type casts with discriminated union narrowing in TUI components
- Single-pass nominee filtering in election details

### Removed

- Internal TUI utilities `getAllFoldableKeys` and `toggleFoldKey` from public exports
- Unused `erc20VotesInterface` export (only the ABI array `ERC20_VOTES_ABI` is needed)

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
