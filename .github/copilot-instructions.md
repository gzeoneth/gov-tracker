# GitHub Copilot Instructions for gov-tracker

This repository tracks Arbitrum DAO governance proposal lifecycle stages across multiple chains (Ethereum L1, Arbitrum One L2, and Arbitrum Nova L2).

## Development Environment

- **Package Manager**: Yarn (always use `yarn`, never `npm`)
- **Language**: TypeScript with strict mode enabled
- **Node Version**: >= 18.0.0

## Essential Commands

### Build and Linting
- `yarn build` - Compile TypeScript to dist/
- `yarn lint` - Run ESLint (must pass before commits)
- `yarn lint:fix` - Auto-fix ESLint issues
- `yarn format` - Format with Prettier
- `yarn format:check` - Check formatting

### Testing
- `yarn test` - Fast pre-commit tests (no RPC calls, ~1.5s)
- `yarn test:integration` - Full integration tests (~10min, requires RPC)
- `yarn test:all` - All tests except fork tests
- `yarn test:coverage` - Run tests with coverage
- `npx vitest run test/filename.test.ts` - Test a single file
- Use `NO_RPC=1` environment variable to skip RPC-dependent tests

### CLI Tools
- `yarn monitor:run` - Discover and track all proposals
- `yarn monitor:track --tx 0x...` - Track specific transaction
- `yarn monitor:status` - Show status

## Architecture Overview

### Core Concepts

**Prepare-only SDK**: This library tracks governance lifecycle stages and prepares transaction data, but **never executes transactions**. Your application is responsible for signing and sending prepared transactions.

**Functional pipeline**: Immutable `TrackingContext` flows through pure tracking functions. Each stage tracker is a pure function that takes context and returns updated stages.

**Multi-chain flow**: Tracks proposals across Ethereum L1, Arbitrum One L2, and Arbitrum Nova L2.

### The 7 Governance Stages

Every Arbitrum DAO governance proposal flows through up to 7 stages:

1. **PROPOSAL_CREATED** (L2): Proposal submitted on-chain
2. **VOTING_ACTIVE** (L2): Voting period (~14-16 days)
3. **PROPOSAL_QUEUED** (L2): Queued in L2 timelock
4. **L2_TIMELOCK** (L2): L2 timelock delay + execution (3-8 days)
5. **L2_TO_L1_MESSAGE** (L2→L1): Challenge period (~6.4 days / 45,818 L1 blocks)
6. **L1_TIMELOCK** (L1): L1 timelock delay + execution (3 days)
7. **RETRYABLE_EXECUTED** (L2/Nova): Retryable ticket redemption

**Stage statuses**: `NOT_STARTED` → `PENDING` → `READY` → `COMPLETED` (or `FAILED`/`SKIPPED`)

### Module Organization

```
src/
├── tracker.ts              # Main ProposalStageTracker class (public API)
├── tracker/                # Core tracking logic
│   ├── context.ts          # TrackingContext creation
│   ├── pipeline.ts         # Pure stage tracking pipeline
│   ├── discovery.ts        # Discover proposals
│   ├── execute.ts          # Transaction preparation
│   └── state.ts            # State management
├── stages/                 # Individual stage implementations
│   ├── base.ts             # Base stage utilities
│   ├── proposal-created.ts
│   ├── voting.ts
│   ├── proposal-queued.ts
│   ├── timelock.ts
│   ├── l2-to-l1-message.ts
│   └── retryables.ts
├── discovery/              # Governor and timelock introspection
├── utils/                  # Timing, log search, operation IDs
└── types/                  # TypeScript type definitions
```

## Code Conventions

### Naming Conventions
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `ADDRESSES`, `TIMING`)
- **Types/Interfaces**: `PascalCase` (e.g., `TrackingContext`, `TrackedStage`)
- **Functions**: `camelCase` (e.g., `createTrackingContext`, `trackAllStages`)
- **Variables**: `camelCase` (e.g., `proposalId`, `timelockAddress`)
- **Private/Unused Parameters**: Prefix with underscore `_paramName`

### Function Patterns
- **Pure functions preferred**: Stage tracking and utility functions should be pure (no side effects, deterministic)
- **Immutability**: Use `readonly` and `const` to enforce immutability
- **Return type annotations**: Explicit return types are preferred for public APIs

### Important Patterns

#### Tracking Context Pattern
```typescript
// Context creation
const context = await createTrackingContext(input, options);

// Pipeline execution (two main pipelines)
const finalState = await trackGovernorPipeline(context);  // For governor-based tracking
const finalState = await trackTimelockPipeline(context);  // For timelock-based tracking

// Each stage tracker is a pure function with specific signatures
// Example from proposal-created.ts:
async function trackProposalCreated(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider,
  options?: { creationTxHash?: string; fromBlock?: number }
): Promise<{ stage: TrackedStage; proposalData: ProposalData | null }> {
  // Implementation
}
```

#### Transaction Preparation Pattern
The SDK prepares transactions but **never signs or sends them**:
```typescript
const prepResult = await tracker.prepareTransaction(stage);
if (prepResult.success) {
  const { to, data, value, chain } = prepResult.prepared;
  // Your app signs and sends this transaction
}
```

#### Operation ID Calculation
Timelock operations use keccak256 hash of `(target, value, data, predecessor, salt)`.
Salt is computed during tracking phase and cached in `stage.data.salt`.

#### Log Search Strategy
Backward search from latest block with early exit for recent events:
```typescript
searchLogsInChunks({
  searchDirection: "backward",
  earlyExitCheck: (logs) => findTargetLog(logs),
});
```

### Error Handling
- **Graceful degradation**: Prefer returning safe defaults over throwing errors
- **Retry logic**: Use `queryWithRetry` from `utils/rpc-utils.ts` for RPC calls
- **Error context**: When throwing errors, include context

### Logging
- **Use centralized loggers**: Import from `utils/logger.ts`
- **Scoped logging**: For concurrent operations, use `withScope` from `utils/logger.ts`
- **Debug-only**: Logging uses the `debug` library and is disabled by default. Enable with `DEBUG=gov-tracker:*`

### Type Safety
- **Avoid `any`**: ESLint warns on explicit `any`. Use specific types or `unknown`
- **Type guards**: Use type guards for runtime type checking
- **Serialization**: Use helper functions for BigNumber serialization

## Testing Conventions

### Test File Naming
Match source file names with `.test.ts` suffix:
- `src/utils/timing.ts` → `test/timing.test.ts`

### Test Structure
- **Utils tests**: Fast, no RPC calls, pre-commit
- **Unit tests**: Some mocked RPC, ~45s
- **Integration tests**: Full RPC calls, ~10min

### RPC-Dependent Tests
Use `NO_RPC` environment variable to skip tests requiring RPC calls:
```typescript
describe.skipIf(process.env.NO_RPC === "1")("integration tests", () => {
  // tests that require RPC calls
});
```

### Use Fixtures
Import common test data from `test/fixtures.ts`

## Important Guidelines

### Code Quality Standards
- **Strict TypeScript**: All strict compiler flags are enabled
- **No implicit any**: All function parameters and return types must be typed
- **No unused variables**: Both locals and parameters checked
- **Pre-commit hooks**: husky + lint-staged runs ESLint auto-fix and Prettier

### Before Committing
Ensure:
- `yarn test` passes (fast tests only)
- `yarn lint` shows no errors
- `yarn format:check` passes

### When Adding New Features
1. Add unit tests in `test/` with same filename pattern
2. Use fixtures from `test/fixtures.ts` for common addresses/IDs
3. Use `test/helpers/` for test utilities
4. Integration tests should use real RPC endpoints from `.env`
5. Wrap RPC-dependent tests with `describe.skipIf(process.env.NO_RPC === "1")`

### Performance Optimizations
1. **Chunked log search**: Split large block ranges into chunks
2. **Fast-path timelock reads**: Use 4 contract calls instead of log search
3. **Checkpoint resume**: Reuse completed stages from cache
4. **Parallel discovery**: Discover from multiple governors/timelocks concurrently
5. **Bounded L1↔L2 block conversion**: Narrow binary search range

### Environment Setup
Required `.env` for integration tests and CLI:
```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # Only needed for --write execution mode
```

**Never commit** `.env` or private keys to the repository.

## Additional Resources

- `CLAUDE.md` - Comprehensive development guide
- `docs/ARCHITECTURE.md` - Detailed design philosophy and data flow
- `docs/API.md` - Full API reference
- `README.md` - User-facing quick start guide
- Governance documentation: https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal

## Remarks

- Ignore backward compatibility concerns - this is pre-release (v0.1.0)
- When making architectural changes, update documentation files to match
