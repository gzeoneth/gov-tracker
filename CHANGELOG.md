# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-01-06

### Added

#### Calldata Decoding & Simulation (PR #11)
- **Calldata Decoding Module** (`src/calldata/`): Recursive decoder with max depth limit (3 levels)
  - Function signature lookup with two-tier resolution (local registry → 4byte.directory API)
  - ABI parameter decoding with type-aware formatting
  - Retryable ticket parsing for L1→L2 messages
  - Chain-aware address labeling for 50+ known governance contracts
  - Session-based caching for signature lookups with 5-second timeout protection

- **Simulation Data Module** (`src/simulation/`): Prepare simulation-ready data for Tenderly/Foundry
  - Extract timelock execution data with storage overrides
  - Calculate L1→L2 address aliasing for cross-chain messages
  - Generate retryable ticket simulation parameters
  - Support for generic call simulation data

- **CLI Enhancements**:
  - Added `--inspect-only` flag to decode calldata without tracking
  - Added `--show-simulation` flag to display Tenderly/Foundry simulation data
  - Tree-formatted calldata output with nested call visualization
  - Enhanced error messages with calldata decoding context

- **New Types**: 40+ new exported functions and types
  - `DecodedCalldata`, `DecodedParameter`, `RetryableTicketData`
  - `SimulationData`, `TimelockSimulationData`, `RetryableSimulationData`
  - Extended `ChainContext` to support chain-aware operations

- **Documentation**:
  - Added 184 lines of API documentation for calldata decoding
  - Created 254 lines of integration examples (Tenderly/Foundry)
  - Updated README with calldata decoding quick start
  - Enhanced CLAUDE.md with security considerations

#### CLI & Cache Improvements (PR #10, #8, #6, #3, #2)
- Refactored CLI options for better organization and reusability
- Added cache support to `track` command with `--cache` and `--force` flags
- Centralized test timeout configuration
- Enhanced transaction preparation with better error handling
- Added error classification utilities for debugging

#### Performance & UX
- Use low gas prices for L2 chains (Arb1/Nova) - 0.1 gwei default
- Improved SIGINT handling in concurrent monitor mode
- Enhanced vote display with human-readable ARB token amounts
- Added explorer URL utilities for all supported chains

### Changed

- **Breaking**: None - all changes are backward compatible
- Enhanced voting stage data with formatted vote amounts (e.g., "1000000 ARB")
- Refactored CLI option parsing for better maintainability
- Improved error messages throughout the CLI
- Updated CONTRIBUTING.md with comprehensive development guidelines

### Fixed

- Fixed LICENSE formatting issues
- Fixed `opts.concurrency` type handling (string → number conversion)
- Fixed output suppression after SIGINT in concurrent mode
- Improved error handling in transaction preparation
- Enhanced stability of RPC calls with better retry logic

### Security

- **Input Validation**: Hex pattern validation with regex for all calldata inputs
- **Recursion Safety**: Maximum depth of 3 levels prevents stack overflow
- **API Timeout**: 5-second timeout on 4byte.directory API calls with AbortController
- **No Code Execution**: No eval/Function/exec patterns - only uses ethers.js ABI decoder
- **Error Handling**: All ABI decoding wrapped in try-catch with graceful fallback
- **Type Safety**: Strict TypeScript mode with no implicit any

### Dependencies

- No new runtime dependencies added
- All changes use existing dependencies (ethers, @arbitrum/sdk, etc.)

## [0.1.0] - 2026-01-05

### Added
- Initial release of governance proposal lifecycle tracking SDK
- Support for 7 governance stages across Ethereum L1, Arbitrum One, and Nova
- Transaction preparation (never execution) for all stages
- Checkpoint-based caching with file and memory adapters
- Discovery mode for finding proposals and timelock operations
- CLI tool for monitoring and executing governance operations
- Comprehensive test suite with 319 tests
- Documentation (README, API.md, EXAMPLES.md, ARCHITECTURE.md)

### Security
- Prepare-only SDK: never executes transactions
- Private key handling only in CLI, not in library
- Input validation on all external data
- Graceful error handling with safe fallbacks

---

[Unreleased]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/gzeoneth/gov-tracker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gzeoneth/gov-tracker/releases/tag/v0.1.0
