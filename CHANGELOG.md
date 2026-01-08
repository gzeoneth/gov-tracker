# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

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

- **Removed exports**:
  - `getKnownAddresses()` - Internal utility
  - `lookup4byteDirectory()` - Internal, use `lookupSignature()` instead
  - `clearSignatureCache()` - Internal utility
  - `chainTypeToId()` - Replaced by `chainToChainId()`
  - `getChainType()` - Replaced by `getChain()`

### Added

- **New exports**:
  - `NETWORK_IDS` - Tenderly network IDs (`{ ethereum: "1", arb1: "42161", nova: "42170" }`)
  - `TIMELOCK_SELECTORS` - Function selectors for schedule/execute operations
  - `FileCache`, `LocalStorageCache`, `MemoryCache` - Cache adapter implementations
  - `getChain(provider)` - Get chain name from provider
  - `getChainId(provider)` - Get chain ID from provider

- **Type improvements**:
  - `isStageType()` now properly narrows to `TypedTrackedStage<T>`
  - Added `KnownChain` type (chains excluding "unknown")

### Changed

- **Constants consolidated** - Moved URL utilities (`getTxUrl`, `getStageTransactionUrl`) to `constants.ts`
- **Calldata module consolidated** - Merged `address-utils.ts` and `extraction.ts` into main modules
- **Logger consolidated** - Merged `scoped-logger.ts` into `logger.ts`
- **Improved type safety** - Added strict typing throughout

### Fixed

- `getRetryableChainName("nova")` now returns "Nova" instead of "nova"

### Development

- Added `knip` for dead code detection
- Added `check:unused` script to pre-commit hooks
- Added `public-api.test.ts` to verify export stability

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

[Unreleased]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
