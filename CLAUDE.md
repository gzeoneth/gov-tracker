# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Tools

- Package Manager: Yarn
- TypeScript with strict configuration

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
yarn test               # Fast pre-commit tests that doest not require RPC
yarn test:monitor       # Monitor cli tool test
yarn test:integration   # Full integration tests
yarn test:all           # All tests except fork test
yarn test:fork          # Fork tests with custom config
```

**Test a single file:**
```bash
npx vitest run test/utils.test.ts
npx vitest run test/tracker.test.ts
```

**Running specific test suites:**
- Use `NO_RPC=1` environment variable to skip tests that require RPC calls
- Integration tests are slow and require `.env` file with `ETH_RPC`, `ARB1_RPC`, `NOVA_RPC`

### CLI Tools
```bash
# Development (using ts-node)
yarn cli:run            # Discover and track all proposals
yarn cli:track          # Track specific transaction (add tx hash as argument)
yarn cli:status         # Show status
yarn cli:election       # Check Security Council elections

# Production (after yarn build)
npx gov-tracker                                  # Discover all proposals (default command)
npx gov-tracker run                              # Same as above (explicit)
npx gov-tracker track 0x...                      # Track by tx hash
npx gov-tracker track 0x... --inspect-only       # Decode calldata only (v0.1.1+)
npx gov-tracker track 0x... --show-simulation    # Show simulation data (v0.1.1+)
npx gov-tracker track 0x... --write --private-key $PRIVATE_KEY  # Execute ready stages
```

**Note:** L1 RPC now defaults to `https://eth.llamarpc.com` when `ETH_RPC` is not set.

## Architecture Overview

### Design Philosophy

**Prepare-only SDK**: This library tracks governance lifecycle stages and prepares transaction data, but **never executes transactions**. Your application is responsible for signing and sending prepared transactions.

**Functional pipeline**: Immutable `TrackingState` flows through pure tracking functions. Each stage tracker is a pure function that takes state and returns updated stages.

**Multi-chain flow**: Tracks proposals across Ethereum L1, Arbitrum One L2, and Arbitrum Nova L2.

### Module Organization

```
src/
├── tracker.ts              # Main ProposalStageTracker class (public API)
├── tracker/
│   ├── state.ts            # TrackingState creation and management
│   ├── pipeline.ts         # Pure stage tracking pipeline
│   ├── discovery.ts        # Discover proposals from multiple governors/timelocks
│   ├── execute.ts          # Transaction preparation (never execution)
│   ├── query.ts            # Cache query operations
│   └── cache.ts            # Cache implementations (FileCache, MemoryCache, etc.)
├── stages/                 # Individual stage implementations
│   ├── utils.ts            # Stage utilities and helpers
│   ├── builder.ts          # Stage builder functions
│   ├── proposal-created.ts # Stage 1: Proposal created
│   ├── voting.ts           # Stage 2: Voting period
│   ├── proposal-queued.ts  # Stage 3: Queued in timelock
│   ├── timelock.ts         # Stages 4 & 6: L2/L1 timelock delays
│   ├── l2-to-l1-message.ts # Stage 5: Cross-chain message
│   └── retryables.ts       # Stage 7: Retryable ticket redemption
├── calldata/               # Calldata decoding module (v0.1.1+)
│   ├── decoder.ts          # Recursive calldata decoder
│   ├── signature-lookup.ts # Function signature resolution
│   ├── parameter-decoder.ts # ABI parameter decoding + address labeling
│   ├── retryable-ticket.ts # Retryable ticket parsing
│   └── index.ts            # Module exports
├── simulation/             # Simulation data preparation (v0.1.1+)
│   ├── simulation-data.ts  # Tenderly/Foundry data extraction + address aliasing
│   └── index.ts            # Module exports
├── discovery/              # Governor and timelock introspection
├── utils/                  # Timing, log search, operation IDs, etc.
├── types/                  # TypeScript type definitions
│   ├── calldata.ts         # Calldata decoding types (v0.1.1+)
│   └── simulation.ts       # Simulation data types (v0.1.1+)
└── constants.ts            # Addresses, timing constants
```

### The 7 Governance Stages

Every Arbitrum DAO governance proposal flows through up to 7 stages:

1. **PROPOSAL_CREATED** (L2): Proposal submitted on-chain
2. **VOTING_ACTIVE** (L2): Voting period (~14-16 days)
3. **PROPOSAL_QUEUED** (L2): Queued in L2 timelock
4. **L2_TIMELOCK** (L2): L2 timelock delay + execution (3-8 days depending on proposal type)
5. **L2_TO_L1_MESSAGE** (L2→L1): Challenge period (~6.4 days / 45,818 L1 blocks)
6. **L1_TIMELOCK** (L1): L1 timelock delay + execution (3 days)
7. **RETRYABLE_EXECUTED** (L2/Nova): Retryable ticket redemption on L2 or Nova

**Stage statuses**: `NOT_STARTED` → `PENDING` → `READY` → `COMPLETED` (or `FAILED`/`SKIPPED`)

### Tracking State Pattern

The core tracking mechanism uses an immutable `TrackingState` that flows through stage tracking functions:

```typescript
// State creation (tracker/state.ts)
const state = await createTrackingState(input, options);

// Pipeline execution (tracker/pipeline.ts)
const stages = await trackAllStages(state, checkpoint);

// Each stage tracker is a pure function
async function trackProposalCreated(state: TrackingState): Promise<TrackedStage>
async function trackVoting(state: TrackingState): Promise<TrackedStage>
// ... etc
```

**Key insight**: State contains all providers, addresses, and configuration. Stage tracking functions are stateless and pure.

### Caching & Checkpoints

**Checkpoints** enable resumable tracking with zero RPC calls for completed stages:

```typescript
interface TrackingCheckpoint {
  input: TrackingInput;
  cachedData: {
    completedStages: TrackedStage[];  // All non-NOT_STARTED stages
    discoveryWatermarks: { ... };     // Track last scanned blocks
  };
  metadata: { errorCount, lastTrackedAt };
}
```

**Discovery watermarks** track the last scanned block for each governor/timelock target, enabling incremental discovery of new proposals.

Cache adapters: `FileCache` (Node.js), `LocalStorageCache` (browsers), `MemoryCache` (testing).

### Performance Optimizations

1. **Chunked log search**: Split large block ranges into chunks (configurable via `chunkingConfig`)
   - L1: 1k blocks per chunk
   - L2: 10M blocks per chunk
   - Early exit when target found

2. **Fast-path timelock reads**: Use 4 contract calls (`isOperation`, `isPending`, `isReady`, `isDone`) instead of log search

3. **Checkpoint resume**: Reuse completed stages from cache (zero RPC calls)

4. **Parallel discovery**: Discover from multiple governors/timelocks concurrently using `p-limit`

5. **Bounded L1↔L2 block conversion**: Narrow binary search range for cross-chain block mapping

### Transaction Preparation Pattern

The SDK prepares transactions but **never signs or sends them**:

```typescript
// In tracker/execute.ts
const prepResult = await tracker.prepareTransaction(stage);
if (prepResult.success) {
  const { to, data, value, chain } = prepResult.prepared;
  // Your app signs and sends this transaction
  await signer.sendTransaction({ to, data, value });
}
```

**Security**: SDK never handles private keys, never calls `sendTransaction`, only returns `{ to, data, value }`.

## Important Patterns

### Event arg name collision

Event arg name `values` collides with ethers.js internals. Access by index instead of `args.values`.

### Proposal Types

Three main governor types tracked:
- **Constitutional Governor** (`0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9`): Core proposals, 8-day L2 timelock
- **Non-Constitutional Governor** (`0x789fC99093B09aD01C34DC7251D0C89ce743e5a4`): Treasury proposals, 3-day L2 timelock
- **Election Governors**: Security Council elections (nominee/member governors)

### Operation ID Calculation

Timelock operations use keccak256 hash of `(target, value, data, predecessor, salt)`:

```typescript
// For single operations (utils/operation-id.ts)
hashOperation(target, value, data, predecessor, salt)

// For batch operations
hashOperationBatch(targets, values, datas, predecessor, salt)
```

**Salt Resolution Architecture**:

Salt is **computed during tracking phase** and cached in `stage.data.salt` for use during preparation. This eliminates the need for trial-and-error validation loops.

**Salt Sources (in priority order)**:
1. **L2 Timelock**: Derived from proposal description using `saltFromDescription(description)` = `keccak256(utf8Bytes(description))`
2. **L1 Timelock**: Decoded directly from L2→L1 message's `schedule`/`scheduleBatch` call data (100% accurate)
3. **Security Council**: Generated via on-chain `SecurityCouncilManager.generateSalt(members, nonce)` call
4. **HashZero**: `bytes32(0)` - valid default for some operations
5. **User Override**: Custom salt via `options.salt` for edge cases

**Tracking Phase** (`src/stages/timelock.ts`):
- `trackTimelock()` computes salt and predecessor, stores in `stage.data`
- Validates operation type (schedule vs scheduleBatch) and stores in `stage.data.isBatchOperation`
- All salt computation centralized in `src/utils/salt-computation.ts`

**Preparation Phase** (`src/stages/timelock.ts`):
- `prepareTimelockStage()` uses cached salt from `stage.data.salt`
- Uses cached `isBatchOperation` to determine `execute()` vs `executeBatch()`
- Optional validation via `validateSalt()` or `validateSaltBatch()` (single RPC call)
- User can override with `options.salt` if needed

### Cross-Chain Message Flow

```
L2 (Arb1): Governor → L2 Timelock → ArbSys.sendTxToL1()
                         ↓ (~6.4 day challenge period)
L1: Outbox.execute() → L1 Timelock → creates retryables
                         ↓
L2 (Arb1/Nova): ArbRetryableTx.redeem()
```

**Challenge period**: Fixed at 45,818 L1 blocks (~6.4 days with 12s block time)

### Log Search Strategy

Backward search from latest block with early exit for recent events:

```typescript
// In utils/log-search.ts
searchLogsInChunks({
  searchDirection: "backward",  // Start from latest block
  earlyExitCheck: (logs) => findTargetLog(logs),  // Exit when found
});
```

### Error Handling

- **Retry logic**: Exponential backoff for transient RPC failures
- **Error tracking**: `errorCount` in checkpoint metadata
- **Graceful degradation**: Missing data → `NOT_STARTED`, not `FAILED`

## Code Quality Standards

### TypeScript Configuration

- **Strict mode enabled**: All strict compiler flags are on
- **No implicit any**: All function parameters and return types must be typed
- **No unused variables**: Both locals and parameters checked

### Pre-commit Hooks

Uses `husky` + `lint-staged` to run:
1. ESLint auto-fix on staged `.ts` files
2. Prettier formatting on staged `.ts` files

**Before committing**, ensure:
- `yarn test` passes (fast tests only)
- `yarn lint` shows no errors
- `yarn format:check` passes

### Test Structure

- **Utils tests**: Fast, no RPC calls, pre-commit
- **Unit tests**: Some mocked RPC, ~45s
- **Integration tests**: Full RPC calls, ~10min, use `NO_RPC=1` to skip

**When adding new features**:
1. Add unit tests in `test/` with same filename pattern
2. Use fixtures from `test/fixtures.ts` for common addresses/IDs
3. Use `test/helpers/` for test utilities
4. Integration tests should use real RPC endpoints from `.env`
5. Wrap RPC-dependent tests with `describe.skipIf(process.env.NO_RPC === "1")` to allow fast precommit runs

## Code Conventions

### Naming Conventions

- **Constants**: `SCREAMING_SNAKE_CASE`
  - Examples: `ADDRESSES`, `TIMING`, `DEFAULT_CHUNKING_CONFIG`
- **Types/Interfaces**: `PascalCase`
  - Examples: `TrackingState`, `TrackedStage`, `ProposalData`
- **Functions**: `camelCase`
  - Examples: `createTrackingState`, `trackAllStages`, `hashOperation`
- **Variables**: `camelCase`
  - Examples: `proposalId`, `timelockAddress`, `currentBlock`
- **Private/Unused Parameters**: Prefix with underscore `_paramName`
  - Used for parameters that must exist for interface compliance but aren't used

### Function Patterns

**Pure functions preferred**: Stage tracking and utility functions should be pure (no side effects, deterministic):
```typescript
// Good: pure function
async function trackProposalCreated(state: TrackingState): Promise<TrackedStage>

// Avoid: stateful classes for core logic (use for public API only)
```

**Immutability**: Use `readonly` and `const` to enforce immutability:
```typescript
export interface Providers {
  readonly l2: ethers.providers.Provider;
  readonly l1: ethers.providers.Provider;
  readonly nova: ethers.providers.Provider;
}

export const ADDRESSES = {
  CONSTITUTIONAL_GOVERNOR: "0xf07DeD...",
} as const;
```

**Return type annotations**: Explicit return types are preferred for public APIs:
```typescript
// Good
async function getTimelockState(address: string): Promise<TimelockState>

// Acceptable for internal helpers
function isComplete(stages: TrackedStage[]) {
  return stages.every(s => s.status === "COMPLETED");
}
```

### Documentation

**External references**: Link to relevant documentation when applicable:
```typescript
/**
 * Naming aligned with governance documentation:
 * @see https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 */
```

### Error Handling

**Graceful degradation**: Prefer returning safe defaults over throwing errors:
```typescript
// Good: return NOT_STARTED if data missing
if (!proposalData) {
  return createStage("PROPOSAL_CREATED", "NOT_STARTED");
}

// Avoid: throwing for expected missing data
if (!proposalData) {
  throw new Error("Proposal not found");
}
```

**Retry logic**: Use `queryWithRetry` from `utils/rpc-utils.ts` for RPC calls:
```typescript
const state = await queryWithRetry(() => governor.state(proposalId));
```

**Error context**: When throwing errors, include context:
```typescript
throw new Error(`Failed to find proposal ${proposalId} in governor ${address}`);
```

### Logging

**Use centralized loggers**: Import from `utils/logger.ts`:
```typescript
import { loggers } from "../utils/logger";

loggers.tracker("Processing proposal %s", proposalId);
loggers.stage.timelock("Timelock state: %s", state);
```

**Scoped logging**: For concurrent operations, use scoped logging:
```typescript
import { withScope } from "../utils/logger";

await withScope("core-gov", async () => {
  loggers.discovery("discovering..."); // Output: [core-gov] discovering...
});
```

**Debug-only**: Logging uses the `debug` library and is disabled by default. Enable with:
```bash
DEBUG=gov-tracker:* yarn cli:run
```

### Type Safety

**Avoid `any`**: ESLint warns on explicit `any`. Use specific types or `unknown`:
```typescript
// Good
function process(data: unknown) {
  if (typeof data === "string") { /* ... */ }
}

// Avoid
function process(data: any) { /* ... */ }
```

**Type guards**: Use type guards for runtime type checking:
```typescript
export function isStageType<T extends StageType>(
  stage: TrackedStage,
  type: T
): stage is TrackedStage & { type: T } {
  return stage.type === type;
}
```

**Serialization**: Use helper functions for BigNumber serialization:
```typescript
// In stages/utils.ts
export const serializeCallScheduledData = (data: CallScheduledData) =>
  serialize(data, CALL_SCHEDULED_BIGNUM_FIELDS);
```

### Testing Conventions

**Test file naming**: Match source file names with `.test.ts` suffix:
- `src/utils/timing.ts` → `test/timing.test.ts`
- `src/tracker.ts` → `test/tracker.test.ts`

**Use fixtures**: Import common test data from `test/fixtures.ts`:
```typescript
import { KNOWN_PROPOSAL_IDS, TEST_ADDRESSES } from "./fixtures";
```

**RPC-dependent tests**: Use `NO_RPC` environment variable to skip tests requiring RPC calls:
```typescript
describe.skipIf(process.env.NO_RPC === "1")("integration tests", () => {
  // tests that require RPC calls
});
```

## Calldata Decoding & Simulation (v0.1.1+)

### Architecture

**Calldata Decoding Module** (`src/calldata/`):
- **decoder.ts**: Recursive calldata decoder with max depth limit (MAX_DEPTH = 3)
- **signature-lookup.ts**: Two-tier signature resolution (local registry → 4byte.directory API)
- **parameter-decoder.ts**: ABI parameter decoding with type-aware formatting + address labeling
- **retryable-ticket.ts**: Arbitrum retryable ticket parsing and chain detection

**Simulation Data Module** (`src/simulation/`):
- **simulation-data.ts**: Tenderly/Foundry data extraction + L1→L2 address aliasing

### Security Considerations

**External API Calls**:
- 4byte.directory API has 5-second timeout with AbortController
- All API responses are validated before use
- Session-based caching reduces API dependency
- Local registry checked first (no network calls)

**Input Validation**:
- Calldata length validation (minimum 10 chars for valid selector)
- Hex pattern validation for all hex inputs
- ABI decoding wrapped in try-catch with graceful fallback
- Recursion depth limited to prevent stack overflow (MAX_DEPTH = 3)

**No Code Execution**:
- Pure data transformation, no eval/exec
- Only uses ethers.js ABI decoder (battle-tested)
- All external data treated as untrusted and validated

### Common Development Tasks

#### Testing Calldata Decoding

Use the CLI tool to decode proposal calldata:
```bash
yarn cli:track 0x0625ecb... --inspect-only
yarn cli:track 0x0625ecb... --show-simulation
```

#### Performance improvement

Use the monitoring script to debug performance issue

1. Track a COMPLETED proposal with all 7 stages
   `yarn cli:track 0x0625ecb14f56cd385d7838e2c691e0d9cf096fd109fed915ec689d24c8cda068 --verbose`
2. Use log to identify performance improvement opportunity
3. Log lookups and arbitrum-sdk calls can be slow, use them intelligently
4. Track again to see the improvement

### Working with the Cache

Cache interface is in `src/types/cache.ts`. Default implementation is `FileCache` for Node.js. To add a new cache adapter:

1. Implement `CacheAdapter` interface
2. Pass via `cache` option in `createTracker()`
3. Test with `MemoryCache` pattern from `src/tracker/cache.ts`

## Environment Setup

Required `.env` for integration tests and CLI:
```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # Only needed for --write execution mode
```

**Never commit** `.env` or private keys to the repository.

## Documentation Files

- `docs/ARCHITECTURE.md`: Detailed design philosophy and data flow
- `docs/API.md`: Full API reference for all public methods
- `README.md`: User-facing quick start guide

When making architectural changes, update these docs to match.

## Remark

- Ignore backward compatibility, this is pre-release
- Always use lower case comparison for address comparison
- Always update CHANGELOG Unreleased section after big changes with mention of the update commit
