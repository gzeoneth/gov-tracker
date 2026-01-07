# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
