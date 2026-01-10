# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CLI: `--inspect` flag with `-i` shorthand** - New flag for `track` command that performs normal tracking AND decodes calldata (unlike `--inspect-only` which skips tracking). Allows users to get both tracking information and calldata decoding in one command. (c6c8e4c)

- **CLI: Shorthand flags** - Added short versions for commonly used flags:
  - `-v` for `--verbose` - Enable verbose logging
  - `-p` for `--prepare` - Prepare transactions for ready stages
  - `-w` for `--write` - Execute prepared transactions
  - `-i` for `--inspect` - Decode and inspect calldata (with tracking)

- **`getBundledCache()` export** - New function that returns bundled cache data directly (not a file path). Useful for environments where file paths don't work at runtime, such as Next.js static exports, edge functions, or browser builds. Use `getBundledCachePath()` for Node.js file-based usage to avoid loading the entire cache into memory.

### Changed

- **CLI: Version shown in help** - Main help page now displays version in the description ("Version: 0.2.1") instead of requiring `-V` flag. (c6c8e4c)

- **Performance: Cache L2→L1 message sendProps between tracking and preparation** - When tracking L2→L1 messages, the SDK's `status()` call populates internal `sendRootSize` and `sendRootHash` values. These are now cached in `stage.data.cachedSendProps` and injected during preparation to skip the redundant ~3-4s `getSendProps()` call inside `getOutboxProof()`. This optimization exploits the immutability of Arbitrum's monotonically-increasing `sendCount` - once a message position is included in an assertion, this fact never changes. (Note: This uses SDK private field injection and may break if SDK internals change.)

- **Dependencies: Reduced production footprint** - Streamlined dependencies for lighter library installation:
  - Moved `dotenv` to devDependencies (only needed for development/testing)
  - Moved `commander` to optionalDependencies (only needed for CLI usage)
  - Removed `p-limit` dependency entirely (replaced with simple inline implementation)
  - Library consumers now only require `ethers`, `@arbitrum/sdk`, and `debug`
  - CLI gracefully handles missing optional dependencies with helpful error messages

- **Dependencies: Version bumps** - Updated to latest compatible versions:
  - `ethers`: ^5.7.2 → ^5.8.0
  - `debug`: ^4.3.4 → ^4.4.0
  - `typescript`: ^5.0.0 → ^5.8.0
  - `@types/node`: ^20.0.0 → ^22.0.0
  - `@typescript-eslint/*`: ^8.51.0 → ^8.52.0

- **CLI: Default L1 RPC** - Added `https://eth.llamarpc.com` as default L1 RPC URL when `ETH_RPC` environment variable is not set. This allows running the CLI without any configuration for basic usage.

- **CLI: Default command is now `run`** - Running `npx gov-tracker` without arguments now executes the `run` command (discover and track proposals). Previously required explicit `npx gov-tracker run`.

- **CLI: Renamed yarn scripts** - Development scripts renamed from `monitor:*` to `cli:*`:
  - `yarn cli` - Run CLI directly
  - `yarn cli:run` - Discover and track all proposals
  - `yarn cli:track` - Track specific transaction
  - `yarn cli:status` - Show cache status
  - `yarn cli:election` - Check Security Council elections

- **CLI: Renamed entry point** - CLI source file renamed from `monitor.ts` to `cli.ts` for clarity

## [0.2.1] - 2026-01-09

### Added

- **Bundled proposal cache** - npm package now includes a pre-built cache of completed proposals (~2.4MB). On first run, CLI automatically copies this to user's cache directory, eliminating the need for initial discovery RPC calls. SDK users can access via `getBundledCachePath()`. Run `yarn cli:run --cache data/bundled-cache.json` to regenerate.

- **`getBundledCachePath()` export** - New utility function to get the path to the bundled cache for SDK users who want to bootstrap their app's cache.

- **CLI: `--no-cache` flag** - Added `--no-cache` option to `run` and `track` commands to disable caching entirely (don't read or write). Cleaner alternative to `--cache /dev/null`.

- **CLI: `--version` flag** - CLI now shows version from package.json via `--version` or `-V`.

### Changed

- **Performance: Extend block info cache TTL to 60s** - Increased `getCurrentBlockInfo()` cache TTL from 2s to 60s. Governance tracking doesn't need real-time block data. Added `invalidateBlockInfoCache()` function for external applications to force refresh (e.g., at start of monitoring loop). CLI loop mode now calls this automatically.

- **Performance: Use `StaticJsonRpcProvider`** - Default providers now use `StaticJsonRpcProvider` instead of `JsonRpcProvider` to avoid redundant `eth_chainId` calls on every RPC request. This improves performance especially for batch operations. (a6ea213)

- **Performance: Skip Security Council check for governor proposals** - `trackTimelock()` now skips the Security Council membership check for proposals from known governors (CONSTITUTIONAL, NON_CONSTITUTIONAL) since they are never SC operations. Saves 1 RPC call per L2 timelock tracking. (469a51a)

- **Performance: Cache block timestamps** - `getBlockTimestamp()` now caches results using a WeakMap keyed by provider. Block timestamps are immutable, so this eliminates redundant `eth_getBlockByNumber` calls. (0a7ab4b)

- **Performance: Skip redundant CallExecuted search** - Added `skipExecutedSearch` option to `getTimelockState()` to skip CallExecuted log search when caller handles execution search separately with optimized block range. (cac036c)

- **Performance: Fast-path L1→L2 block conversion** - `getFirstL2BlockForL1Block()` now tries `NodeInterface.l2BlockRangeForL1()` directly (1 RPC call) before falling back to SDK binary search (~23 RPC calls). Falls back only when 5 consecutive L1 blocks have no L2 blocks (rare).

### Documentation

- Updated examples to recommend `StaticJsonRpcProvider` for better performance (fa77488)

## [0.2.0] - 2026-01-09

### Added

- **Chain Utility Types & Guards**:
  - Exported `KnownChain` type (excludes "unknown" from `Chain`)
  - Exported `L2Chain` type (only "arb1" | "nova")
  - Added `isKnownChain(chain)` type guard for known chains
  - Added `isL2Chain(chain)` type guard for L2 chains
  - Added `isRetryable(decoded)` type guard for retryable ticket calldata
  - Added `getChainDisplayName(chain)` for human-readable chain names ("ethereum" → "Ethereum Mainnet", "arb1" → "Arbitrum One", "nova" → "Arbitrum Nova")

- **New exports**:
  - `NETWORK_IDS` - Tenderly network IDs (`{ ethereum: "1", arb1: "42161", nova: "42170" }`)
  - `TIMELOCK_SELECTORS` - Function selectors for schedule/execute operations
  - `FileCache`, `LocalStorageCache`, `MemoryCache` - Cache adapter implementations
  - `getChain(provider)` - Get chain name from provider
  - `getChainId(provider)` - Get chain ID from provider

- **Test Coverage Infrastructure**:
  - Added `vitest.config.fork.mts` for fork-based tests with separate coverage output
  - Added `yarn test:coverage:fork` and `yarn test:coverage:all` scripts
  - Added Codecov integration with coverage flags for regular and fork tests

- **Type improvements**:
  - `isStageType()` now properly narrows to `TypedTrackedStage<T>`
  - Added `KnownChain` type (chains excluding "unknown")

### Changed

- **Test Suite Expansion**: Increased test count from 319 to 1050+ tests (928 unit + 122 fork/integration)
  - Added fork tests using Anvil at historical blocks for deterministic testing
  - Added mocked unit tests for edge cases (EXPIRED retryables, FAILED voting, etc.)
  - Added CLI utility coverage tests (`formatDryRun`, `formatTrackingResult`, etc.)
  - Added tracker cache methods coverage (`loadWatermarks`, `saveWatermarks`, etc.)
  - Added discovery module coverage (`detectGovernorCapabilities`, `discoverAll`)
  - Added election check coverage (`formatElectionStatus`, `prepareMemberElectionTrigger`)

- **Constants consolidated** - Moved URL utilities (`getTxUrl`, `getStageTransactionUrl`) to `constants.ts`
- **Calldata module consolidated** - Merged `address-utils.ts` and `extraction.ts` into main modules
- **Logger consolidated** - Merged `scoped-logger.ts` into `logger.ts`
- **Improved type safety** - Added strict typing throughout

### Fixed

- **Security**: `extractCalldataFromStage` now throws an error when `value` is missing from `callScheduledData` instead of silently defaulting to "0". This prevents users from approving proposals that appear to transfer no ETH when the actual calldata sends funds.
- `getRetryableChainName("nova")` now returns "Nova" instead of "nova"

### Breaking Changes

#### DecodedParameter: `value` renamed to `displayValue`

The `value` field in `DecodedParameter` has been renamed to `displayValue` to clarify that it contains a truncated display-only string. Use `rawValue` for programmatic access (API calls, simulations, etc.).

```typescript
// Before
const address = param.value; // Might be truncated "0xE6841D92...7f49"

// After
const displayStr = param.displayValue; // For UI display only (may be truncated)
const fullAddress = param.rawValue as string; // For programmatic access (full value)
```

**Migration**: Replace all `param.value` with `param.displayValue` or `param.rawValue` depending on use case.

#### TrackedStage Discriminated Union

`TrackedStage` is now a discriminated union keyed by `type`. TypeScript automatically narrows `data` when checking `stage.type`:

```typescript
// Before: data was a loose intersection type
if (stage.type === "VOTING_ACTIVE") {
  const votes = stage.data.forVotes; // TypeScript didn't know this exists
}

// After: data is properly typed per stage type
if (stage.type === "VOTING_ACTIVE") {
  const votes = stage.data.forVotes; // TypeScript knows VotingActiveData
}
```

**Stage tracking functions now return typed stages:**
```typescript
// trackVotingStage returns TypedTrackedStage<"VOTING_ACTIVE">
const { stage } = await trackVotingStage(...);
stage.data.forVotes; // No cast needed

// trackProposalCreated returns TypedTrackedStage<"PROPOSAL_CREATED">
// trackProposalQueued returns TypedTrackedStage<"PROPOSAL_QUEUED">
// trackL2ToL1Message returns TypedTrackedStage<"L2_TO_L1_MESSAGE">
// trackRetryables returns TypedTrackedStage<"RETRYABLE_EXECUTED">
```

**StageBuilder is now generic:**
```typescript
// Before
const builder = new StageBuilder("VOTING_ACTIVE", "arb1");
builder.data({ anyField: "value" }); // No type checking

// After
const builder = new StageBuilder("VOTING_ACTIVE", "arb1");
builder.data({ forVotes: "100" }); // Type-checked against VotingActiveData
```

#### Chain Type Refactoring
- **Replaced `ChainType`** ("L1", "L2", "NOVA") with unified `Chain` type ("ethereum", "arb1", "nova")
- **Replaced `TargetChainType`** ("Arb1", "Nova") with `L2Chain` ("arb1", "nova")
- **Added `ChainId`** - Numeric chain IDs (1, 42161, 42170)
- **Added conversion functions**:
  - `chainIdToChain(chainId)` - Convert numeric chain ID to chain name
  - `chainToChainId(chain)` - Convert chain name to numeric chain ID

#### Type Changes in `TrackedStage`
```typescript
// Before
interface TrackedStage {
  chain: ChainType;  // "L1" | "L2" | "NOVA"
  // ...
}

// After
interface TrackedStage {
  chain: Chain;      // "ethereum" | "arb1" | "nova"
  chainId: ChainId;  // 1 | 42161 | 42170
  // ...
}
```

#### Type Changes in `StageTransaction`
```typescript
// Before
interface StageTransaction {
  chain: ChainType;
  targetChain?: TargetChainType;  // "Arb1" | "Nova"
}

// After
interface StageTransaction {
  chain: Chain;
  chainId: ChainId;
  targetChain?: Chain;
  targetChainId?: ChainId;
}
```

#### Type Changes in `PreparedTransaction`
```typescript
// Before
interface PreparedTransaction {
  chain: ChainType;  // "L1" | "L2" | "NOVA"
}

// After
interface PreparedTransaction {
  chain: Chain;      // "ethereum" | "arb1" | "nova"
  chainId: ChainId;
}
```

### Removed

- **Unused types removed**:
  - `L2ToL1MessageData` - Never used in tracking
  - `L2ToL1MessageStatus` - Never used in tracking
  - `RetryableStatus` - Never used (use `stage.status` instead)
  - `RetryableData` - Never used
  - `RetryableTicketInfo` - Replaced by `RetryableCreationDetail`
  - `RetryableRedemptionInfo` - Replaced by `RetryableRedemptionDetail`
  - `EstimatedTimeRange` - Never used
  - `L2TimelockData` / `L1TimelockData` - Use `TimelockStageData` instead
  - `ExecutionResult` - Never used
  - `StageTrackingContext` - Internal only
  - `StageTrackResultWith` - Internal only
  - `SimulationChainType` - Use `Chain` instead
  - `GovernorProposalState` - Use `ProposalState` instead
  - `TrackedStageData` - Use `StageDataMap[StageType]` directly

- **Renamed exports**:
  - `TrackingContext` → `TrackingState`
  - `createTrackingContext()` → `createTrackingState()`

- **Removed exports**:
  - `getKnownAddresses()` - Internal utility
  - `lookup4byteDirectory()` - Internal, use `lookupSignature()` instead
  - `clearSignatureCache()` - Internal utility
  - `chainTypeToId()` - Replaced by `chainToChainId()`
  - `getChainType()` - Replaced by `getChain()`

### Development

- Added `knip` for dead code detection
- Added `check:unused` script to pre-commit hooks
- Added `public-api.test.ts` to verify export stability
- Consolidated duplicate tests between `stages.test.ts` and `base-stages.test.ts`
- Removed `tracker-state.test.ts` (duplicated by `state.test.ts`)
- **Codebase restructuring**:
  - Merged `stages/base.ts` + `utils/stage-helpers.ts` → `stages/utils.ts`
  - Renamed `stages/stage-builder.ts` → `stages/builder.ts`
  - Renamed `tracker/state.ts` → `tracker/cache.ts` (file contains cache implementations)
  - Renamed `tracker/context.ts` → `tracker/state.ts` (better reflects content)
  - Renamed `TrackingContext` type → `TrackingState`
  - Renamed `createTrackingContext()` → `createTrackingState()`
  - Removed `TrackedStageData` type (use `StageDataMap[StageType]` directly)

## [0.1.2] - 2026-01-07

### Added

- **GitHub Copilot Instructions** (PR #14): Added `.github/copilot-instructions.md` for AI-assisted development

### Fixed

- **ethers.js compatibility issues**: Fixed critical bugs in event parsing and calldata decoding
  - Fixed `values` property collision with ethers.js internals in `parseProposalCreatedEvent()` - now accessed by index
  - Fixed Interface initialization in `decodeParameters()` - signature now properly prefixed with `function`

## [0.1.1] - 2026-01-06

### Added

#### Calldata Decoding & Simulation (PR #11)
- **Calldata Decoding Module** (`src/calldata/`): Recursive decoder (max depth: 3)
  - Two-tier signature lookup (local registry → 4byte.directory API with 5s timeout)
  - ABI parameter decoding with type-aware formatting
  - Retryable ticket parsing for L1→L2 messages
  - Chain-aware address labeling (50+ governance contracts)

- **Simulation Data Module** (`src/simulation/`): Tenderly/Foundry-ready data
  - Timelock execution data with storage overrides
  - L1→L2 address aliasing for cross-chain messages
  - Retryable ticket simulation parameters

- **CLI Enhancements**:
  - Added `--inspect-only` flag (decode without tracking)
  - Added `--show-simulation` flag (display simulation data)
  - Tree-formatted calldata output with nested calls

- **New SDK APIs**:
  - `decodeCalldata()`, `decodeCalldataArray()` - Decode proposal calldata with signature lookup
  - `lookupSignature()`, `lookupLocalSignature()` - Function signature resolution
  - `getAddressLabel()` - Known address labeling
  - `isRetryableTicketMagic()`, `decodeRetryableTicket()` - Retryable ticket parsing
  - `extractAllSimulationsFromDecoded()` - Extract simulation data from decoded calldata
  - `prepareRetryableSimulation()`, `prepareTimelockSimulation()`, `prepareCallSimulation()` - Prepare simulation data

- **New Types**: 40+ exported functions/types
  - `DecodedCalldata`, `DecodedParameter`, `RetryableTicketData`
  - `SimulationData`, `TimelockSimulationData`, `RetryableSimulationData`

- **Documentation**:
  - +184 lines API documentation
  - +254 lines integration examples (Tenderly/Foundry)

#### CLI & Cache Improvements (PR #10, #8, #6, #3, #2)
- **Breaking**: Changed `track --tx <hash>` to `track <tx-hash>` (positional argument)
- Refactored CLI options with reusable option groups (execution, chunking, gas, loop, cache)
- Added `--cache` and `--force` flags to `track` command
- Centralized test timeout configuration
- Enhanced transaction preparation with better error handling
- Added error classification utilities for debugging

#### Performance & UX
- Low gas prices for L2 (0.1 gwei default)
- Enhanced vote display (human-readable ARB amounts)
- Improved SIGINT handling in concurrent mode
- Explorer URL utilities for all chains

### Changed

- Enhanced voting stage with formatted vote amounts (e.g., "1000000 ARB")
- Refactored CLI for better maintainability
- Improved error messages throughout
- Updated CONTRIBUTING.md with development guidelines

### Fixed

- LICENSE formatting
- `opts.concurrency` type handling (string → number)
- Output suppression after SIGINT in concurrent mode
- Transaction preparation error handling
- RPC call stability with better retry logic

### Security

- **Input Validation**: Hex pattern validation, length checks, recursion depth limits (max 3)
- **API Timeout**: 5-second timeout on 4byte.directory with AbortController
- **No Code Execution**: Only uses ethers.js ABI decoder
- **Error Handling**: All ABI decoding wrapped in try-catch with graceful fallback
- **Type Safety**: Strict TypeScript, no implicit any

### Dependencies

- No new runtime dependencies

## [0.1.0] - 2026-01-05

Initial release of governance proposal lifecycle tracking SDK with support for 7 stages across Ethereum L1, Arbitrum One, and Nova.

### Added
- Proposal lifecycle tracking (7 stages)
- Transaction preparation (never execution)
- Checkpoint-based caching
- Discovery mode for proposals and timelock operations
- CLI tool for monitoring and execution
- Comprehensive test suite (319 tests)
- Documentation (README, API.md, EXAMPLES.md, ARCHITECTURE.md)

---

[0.2.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
