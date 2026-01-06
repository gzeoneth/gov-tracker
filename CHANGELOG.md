# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-01-06

### Changed
- **CLI**: Track command now uses positional argument instead of `--tx` flag
  - Before: `npx gov-tracker track --tx 0x...`
  - After: `npx gov-tracker track 0x...`
- **CLI**: Refactored common options (verbose, cache, execution, chunking, gas, loop)
- **API**: Replaced `force` option with `prepareCompleted` in `PrepareOptions` interface

### Added
- **CLI**: Added `--cache` option to track command for cache file path control
- **CLI**: Added `--force` flag to track command to bypass cache and re-track from scratch
- **CLI**: Added L2 gas settings options (`--l2-max-fee`, `--l2-priority-fee`)
- **CLI**: Added chunking options for log search performance tuning
- Default L2 gas settings (0.1 gwei maxFeePerGas, 0 priority fee)

### Fixed
- **CLI**: SIGINT handling in concurrent monitor mode - prevents output after Ctrl+C
- **CLI**: Transaction preparation for multiple retryables and L2→L1 messages
- **CLI**: Gas estimation error classification (no longer increments consecutive error count)

### Internal
- **Tests**: Centralized test timeout configuration
- **Tests**: Optimized test suite performance (84% faster via "track once, test many" pattern)
- **Tests**: Fixed `prepareCompleted` option usage in tests

## [0.1.0] - 2026-01-05

### Initial Release
- Core governance tracking SDK for Arbitrum DAO proposals
- Support for 7 lifecycle stages across L1/L2/Nova chains
- CLI tools for discovery, tracking, and execution
- File-based and in-memory caching
- Comprehensive test suite with 388 tests
