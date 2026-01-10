# Architecture

## Design Philosophy

**Prepare-only SDK**: Tracks stages and prepares transactions but doesn't execute them. Your app handles signing/sending.

**Functional pipeline**: Immutable `TrackingState` flows through pure stage tracking functions.

---

## Module Structure

```
src/
├── tracker.ts           # ProposalStageTracker class
├── tracker/             # Pipeline, state, discovery, execute, query, cache
├── stages/              # Stage implementations (voting, timelock, etc.)
├── discovery/           # Governor & timelock introspection
├── utils/               # Timing, log search, operation IDs
├── types/               # Type definitions
└── constants.ts         # Addresses, timing
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
TrackingResult + Checkpoint saved to cache
```

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

```typescript
chunkingConfig: {
  l1ChunkSize: 10_000,    // Blocks per chunk
  l2ChunkSize: 10_000_000,
  delayBetweenChunks: 100, // ms
}
```

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

## Error Handling

- **Retry**: Exponential backoff (1s → 2s → 4s)
- **Error tracking**: `errorCount` in checkpoint metadata
- **Graceful degradation**: Missing data = NOT_STARTED (not FAILED)

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
yarn test:coverage       # Unit tests only
yarn test:coverage:fork  # Fork tests (needs archive RPC)
yarn test:coverage:all   # Merge all coverage
```
