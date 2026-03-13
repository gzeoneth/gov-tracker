# Architecture

## Design Philosophy

**Prepare-only SDK**: Tracks stages and prepares transactions but doesn't execute them. Your app handles signing/sending.

**Functional pipeline**: Immutable `TrackingState` flows through pure stage tracking functions.

---

## Module Structure

```
src/
├── tracker.ts           # ProposalStageTracker class (public API entry point)
├── tracker/
│   ├── pipeline.ts      # Pure stage tracking pipeline
│   ├── state.ts         # TrackingState creation and management
│   ├── stage-runner.ts  # Stage execution with caching logic
│   ├── discovery.ts     # Multi-governor/timelock discovery
│   ├── execute.ts       # Transaction preparation
│   ├── query.ts         # Cache query operations
│   ├── cache.ts         # Cache implementations (File, LocalStorage, Memory)
│   ├── checkpoint-helpers.ts  # Checkpoint utilities
│   └── bundled-cache.ts # Bundled cache extraction utilities
├── stages/              # Individual stage implementations
├── election/            # Security Council election tracking (7 files)
├── governance/          # Governance proposal vote preparation
├── calldata/            # Calldata decoding and signature lookup
├── simulation/          # Simulation data preparation (Tenderly, etc.)
├── discovery/           # Governor & timelock introspection
├── deduplication.ts     # Parent/child checkpoint management
├── utils/               # Timing, operation IDs, stage metadata, etc.
├── types/               # Type definitions
└── constants.ts         # Addresses, timing, block ranges
```

---

## Data Flow

```
trackByTxHash("0x...")
        ↓
Discovery: detect governor/timelock from tx
        ↓
Create TrackingState (immutable state)
        ↓
Pipeline: track each stage sequentially
  1. PROPOSAL_CREATED → 2. VOTING → 3. QUEUED → 4. L2_TIMELOCK
  → 5. L2_TO_L1_MESSAGE → 6. L1_TIMELOCK → 7. RETRYABLE_EXECUTED
        ↓
[If election governor] → Track election lifecycle
        ↓
TrackingResult + Checkpoint saved to cache
```

### Election Auto-Detection

When `trackByTxHash` discovers a proposal on an election governor (nominee or member), it automatically tracks the full election lifecycle:

```
Proposal from Election Governor detected
        ↓
getElectionIndexForProposalId() → find election index
        ↓
trackElectionWithPipeline() → track stages, get phase, cohort, nominees
        ↓
TrackingResult.electionStatus populated
        ↓
saveElectionCheckpoint() → cache with key `election:{index}`
```

Election phases: `NOT_STARTED` → `CONTENDER_SUBMISSION` → `NOMINEE_SELECTION` → `VETTING_PERIOD` → `MEMBER_ELECTION` → `PENDING_EXECUTION` → `COMPLETED`

### Stage State Machine

```
NOT_STARTED → PENDING → READY → COMPLETED
                ↓         ↓
              FAILED    FAILED
                ↓
             SKIPPED
```

---

## The 7 Stages

| # | Stage | Chain | Description |
|---|-------|-------|-------------|
| 1 | `PROPOSAL_CREATED` | L2 | Proposal submitted |
| 2 | `VOTING_ACTIVE` | L2 | Voting period |
| 3 | `PROPOSAL_QUEUED` | L2 | Queued in timelock |
| 4 | `L2_TIMELOCK` | L2 | L2 delay + execution |
| 5 | `L2_TO_L1_MESSAGE` | L2→L1 | Challenge period |
| 6 | `L1_TIMELOCK` | L1 | L1 delay + execution |
| 7 | `RETRYABLE_EXECUTED` | L2/Nova | Retryable redemption |

---

## Caching

Checkpoints store all tracked stages (including PENDING) for zero-RPC resume:

```typescript
interface TrackingCheckpoint {
  input: TrackingInput;
  cachedData: {
    completedStages: TrackedStage[];  // All non-NOT_STARTED stages
    discoveryWatermarks: { ... };
  };
  metadata: { errorCount, lastTrackedAt };
}
```

**Cache Key Patterns:**
- Governor proposals: `tx:{txHash}`
- Timelock operations: `tx:{txHash}:op:{operationId}`
- Elections: `election:{index}`
- Discovery watermarks: `discovery:watermarks`

**Watermarks** track last scanned block per target for incremental discovery.

---

## Performance Optimizations

1. **Chunked log search**: Configurable chunk sizes, early exit on match
2. **Fast path reads**: 4 contract reads instead of log search for timelock state
3. **Checkpoint resume**: Reuse completed stages from cache
4. **Parallel discovery**: Discover multiple governors/timelocks concurrently
5. **Bounded L1→L2 conversion**: Narrow binary search range for block conversion
6. **Concurrent tracking**: Built-in concurrency limiter for bounded parallel operations
7. **L2→L1 sendProps caching**: Cache SDK's sendRootSize/sendRootHash from tracking phase to skip redundant ~3-4s `getSendProps()` call during preparation
8. **Automatic retry with backoff**: All RPC calls wrapped with `queryWithRetry` for rate limit handling

```typescript
chunkingConfig: {
  l1ChunkSize: 10_000,    // Blocks per chunk (flows through entire pipeline)
  l2ChunkSize: 10_000_000,
  delayBetweenChunks: 100, // ms
}
```

User-provided `chunkingConfig` is respected throughout the entire tracking pipeline, from discovery functions through stage tracking.

---

## Multi-Chain Flow

```
L2 (Arb1): Governor → L2 Timelock → ArbSys.sendTxToL1()
                          ↓ (~6.4 day challenge)
L1: Outbox.execute() → L1 Timelock → creates retryables
                          ↓
L2 (Arb1/Nova): ArbRetryableTx.redeem()
```

---

## Write Actions (Prepare-Only)

All write-action modules follow the same pattern: encode transaction calldata and return a `PreparedTransaction`, but never execute. The caller handles signing and sending.

### Modules

| Module | Functions | Target Contracts |
|--------|-----------|------------------|
| `governance/write.ts` | `prepareCastVote`, `prepareCastVoteWithReason`, `prepareCastVoteWithReasonAndParams` | Core/Treasury Governor |
| `election/write.ts` | `prepareAddContender`, `prepareContenderRegistration`, `prepareNomineeElectionVote`, `prepareMemberElectionVote` | Election Governors |
| `election/params.ts` | `prepareElectionCreation`, `prepareMemberElectionTrigger`, `prepareMemberElectionExecution` | Election Governors |
| `stages/timelock.ts` | `prepareTimelockOperation`, `prepareTimelockBatch`, `prepareTimelockStage`, `prepareExecuteTimelock` | L2/L1 Timelocks |
| `stages/proposal-queued.ts` | `prepareGovernorQueue` | Core/Treasury Governor |

### Chain derivation

Write-action functions that accept a `chainId` parameter derive the `chain` field via `chainIdToChain(chainId)` rather than hardcoding it. Functions without a `chainId` parameter (e.g., `prepareElectionCreation`, `prepareGovernorQueue`) use `chain: "arb1"` and `chainId: 42161` inline since they are Arbitrum One-specific.

---

## Error Handling

- **Retry**: All RPC calls use `queryWithRetry` with exponential backoff (1s → 2s → 4s → 8s, max 30s)
- **Rate limit handling**: Automatic retry on HTTP 429 and transient network errors
- **Error tracking**: `errorCount` in checkpoint metadata
- **Graceful degradation**: Missing data = NOT_STARTED (not FAILED)

---

## Interactive TUI

The `ui` command provides a cache-only React/Ink terminal interface (~3,900 lines).

### Component Architecture

```
App.tsx (view routing, error boundary)
├── ProposalList (default view)
│   ├── Header (title, filter/sort badges, stats)
│   ├── ProposalRow[] with StatusBadge, StageProgress
│   └── ScrollIndicator, KeyHelp
├── ProposalDetail → StageView, CalldataView, SimulationView, DescriptionView
├── ElectionView (cached election status)
└── HelpView (keyboard shortcuts reference)
```

### Data Flow

```
useCache(path) ─────► useProposals(data, filter, search, sort) ─────► ProposalList
                              │
                              ▼
                    useNavigation() ─────► Detail Views
                              │
                              ▼
                    useElectionData() ─────► ElectionView
```

### Key Patterns

- **Cache-only**: No RPC calls, reads from bundled or user-provided cache file
- **useNavigation**: Centralized state (view, filter, sort, search, scroll) with reducer
- **useScrollableInput**: Shared hook for Vim-style scroll navigation (j/k/g/G/Ctrl+d/u)
- **ViewLayout**: Consistent header/footer wrapper for all detail views
- **registry.ts**: View metadata (titles, proposal requirements) in one place

---

## Testing Strategy

### Test Categories

| Category | Config | Description |
|----------|--------|-------------|
| Unit Tests | `vitest.config.mts` | No RPC, mocked dependencies |
| Fork Tests | `vitest.config.fork.mts` | Anvil forks at historical blocks |
| Integration | `NO_RPC=1` skip | Real RPC with fixtures |

### Fork Testing Pattern

Fork tests use Anvil at historical L2 blocks for deterministic state:

```typescript
const forks = await startDualForksAtL2Block({
  l2BlockNumber: 371_840_000,  // L2 timelock READY
  l1Url: rpcUrls.l1,
  l2Url: rpcUrls.l2Archive,
});

// Track proposal at exact historical state
const result = await tracker.trackByTxHash(fixture.creationTxHash);
```

### Coverage Commands

```bash
yarn test:cov            # Unit tests with coverage
yarn test:cov:fork       # Fork tests with coverage (needs archive RPC)
yarn test:cov:all        # Both + merge all coverage
```
