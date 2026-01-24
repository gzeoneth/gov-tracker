# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Development Tools

- **Package Manager**: Yarn
- **TypeScript**: Strict mode enabled
- **Testing**: Vitest with coverage

## Commands

### Build & Development
```bash
yarn build              # Compile TypeScript to dist/
yarn lint               # Run ESLint on src and test
yarn lint:fix           # Auto-fix ESLint issues
yarn format             # Format with Prettier
yarn format:check       # Check formatting
```

### Testing
```bash
yarn test           # Fast pre-commit tests (NO_RPC=1)
yarn test:rpc       # All regular tests with RPC
yarn test:fork      # Fork tests (requires archive RPC + Anvil)
```

**Coverage:**
```bash
yarn test:cov       # Regular tests with coverage → coverage/
yarn test:cov:fork  # Fork tests with coverage → coverage-fork/
yarn test:cov:all   # Both + merge → coverage-merged/
```

**Single file:**
```bash
yarn test:cov test/file.test.ts
yarn test:cov:fork test/file-fork.test.ts
```

### Coverage Architecture

Coverage is collected separately due to different execution requirements:

| Test Type | Command | Output Dir | Characteristics |
|-----------|---------|------------|-----------------|
| Regular | `test:cov` | `coverage/` | Fast, mocked + RPC tests |
| Fork | `test:cov:fork` | `coverage-fork/` | Slow, historical state, sequential |
| Merged | `test:cov:all` | `coverage-merged/` | Combined report |

**Merged output:**
- `index.html` - Browser-viewable HTML report
- `coverage-summary.json` - JSON for programmatic use
- `lcov.info` - LCOV format for CI/Codecov

**Test organization:**
- **Regular tests**: Unit tests, mocked integrations, RPC tests with `describe.skipIf(NO_RPC)` wrapper
- **Fork tests**: Anvil forks at historical blocks, sequential execution (`*-fork.test.ts`)

**Coverage strategy:**
- Prefer regular tests for pure functions and mocked scenarios (fast, reliable)
- Use fork tests only for: time-sensitive logic, READY/PENDING state verification, multi-block scenarios

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for SDK internals.

**Key concepts:**
- **Prepare-only SDK**: Tracks stages and prepares transactions, never executes
- **Functional pipeline**: Immutable `TrackingState` flows through pure stage tracking functions
- **Unified pipeline architecture**: Three composable modules with different entry points:
  - **Election path** (8 stages): CREATE_ELECTION → NOMINEE_ELECTION → NOMINEE_VETTING → MEMBER_ELECTION → [timelock stages]
  - **Governor path** (7 stages): PROPOSAL_CREATED → VOTING_ACTIVE → PROPOSAL_QUEUED → [timelock stages]
  - **Timelock path** (4 stages): L2_TIMELOCK → L2_TO_L1_MESSAGE → L1_TIMELOCK → RETRYABLE_EXECUTED
- **TrackingPath type**: `"governor" | "timelock" | "election"` determines which stages to initialize

## Module Organization

```
src/
├── tracker.ts              # Main ProposalStageTracker class (public API)
├── tracker/
│   ├── state.ts            # TrackingState creation and management
│   ├── pipeline.ts         # Pure stage tracking pipeline
│   ├── discovery.ts        # Discover proposals from multiple governors/timelocks
│   ├── execute.ts          # Transaction preparation (never execution)
│   ├── query.ts            # Cache query operations
│   ├── cache.ts            # Cache implementations (FileCache, MemoryCache, etc.)
│   ├── checkpoint-helpers.ts # Shared checkpoint utilities
│   └── bundled-cache.ts    # Bundled cache extraction utilities
├── stages/                 # Individual stage implementations
│   ├── utils.ts            # Stage utilities and helpers
│   ├── builder.ts          # Stage builder functions
│   ├── proposal-created.ts # Stage 1: Proposal created
│   ├── voting.ts           # Stage 2: Voting period
│   ├── proposal-queued.ts  # Stage 3: Queued in timelock
│   ├── timelock.ts         # Stages 4 & 6: L2/L1 timelock delays
│   ├── l2-to-l1-message.ts # Stage 5: Cross-chain message
│   └── retryables.ts       # Stage 7: Retryable ticket redemption
├── election/               # Security Council election tracking (7 files)
│   ├── index.ts            # Module exports (public API)
│   ├── contracts.ts        # Election governor contract factories
│   ├── proposal-ids.ts     # Proposal ID computation, caching, and lookup
│   ├── params.ts           # Proposal parameters and transaction preparation
│   ├── participants.ts     # Contenders, nominees, and vote tracking
│   ├── details.ts          # Detailed election information
│   └── status.ts           # Election status and phase determination
├── calldata/               # Calldata decoding module
├── simulation/             # Simulation data preparation
├── discovery/              # Governor and timelock introspection
├── cli/
│   ├── cli.ts              # CLI entry point
│   ├── lib/                # CLI utilities
│   └── tui/                # Cache-only terminal UI (React/Ink)
│       ├── App.tsx         # Main TUI component with view routing
│       ├── views/          # View components (List, Detail, Election, Help, etc.)
│       ├── components/     # Reusable UI (Header, KeyHelp, ScrollIndicator, etc.)
│       ├── hooks/          # useCache, useProposals, useNavigation, useElectionData
│       └── utils/          # Navigation, formatting, shortcuts, clipboard
├── utils/                  # Timing, log search, operation IDs, etc.
├── types/                  # TypeScript type definitions
└── constants.ts            # Addresses, timing constants
```

## Important Patterns

### Event arg name collision
Event arg name `values` collides with ethers.js internals. Access by index instead of `args.values`.

### Proposal Types
- **Constitutional Governor** (`0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9`): Core proposals, 8-day L2 timelock
- **Non-Constitutional Governor** (`0x789fC99093B09aD01C34DC7251D0C89ce743e5a4`): Treasury proposals, 3-day L2 timelock
- **Election Governors**: Security Council elections

## Code Conventions

### Patterns
- Prefer pure functions over stateful classes
- Use `readonly` and `const` for immutability
- Prefer returning safe defaults over throwing errors

### RPC Calls
**All external RPC calls must use `queryWithRetry`** from `src/utils/rpc-utils.ts`:
```typescript
import { queryWithRetry } from "../utils/rpc-utils";

// Direct provider calls
const block = await queryWithRetry(() => provider.getBlock("latest"));

// Contract calls
const state = await queryWithRetry<number>(() => governor.state(proposalId));
```

`queryWithRetry` handles transient failures (rate limits, timeouts, network errors) with exponential backoff, but does NOT retry permanent failures (reverts, non-existent functions). This makes it safe to use for capability checks.

### Logging
```typescript
import { loggers } from "../utils/logger";
loggers.tracker("Processing proposal %s", proposalId);
```

Enable with: `DEBUG=gov-tracker:* yarn cli:run` or --verbose flag

### Type Safety
- ESLint warns on explicit `any` - use `unknown` instead
- Use type guards for runtime type checking
- Use `serialize()` helpers for BigNumber serialization

## Testing Conventions

- Match source file names with `.test.ts` suffix
- Use fixtures from `test/fixtures.ts`
- Wrap RPC-dependent tests with `describe.skipIf(process.env.NO_RPC === "1")`

## Pre-commit Requirements

Uses `husky` + `lint-staged`:
1. ESLint auto-fix on staged `.ts` files
2. Prettier formatting on staged `.ts` files

Before committing:
- `yarn format:check` passes
- `yarn lint` shows no errors
- `yarn build` passes

## Environment

Required `.env` for integration tests and fork tests:
```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_ARCHIVE_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # Only for --write mode
```

**Never commit** `.env` or private keys.

## Development Notes

- Add comment for backward compatibility code
- Always use lowercase for address comparison
- Update CHANGELOG Unreleased section after significant changes
