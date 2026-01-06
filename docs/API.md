# API Reference

## Core API

### `createTracker(options)`

```typescript
const tracker = createTracker({
  l2Provider,                       // Required: Arbitrum One provider
  l1Provider,                       // Required: Ethereum provider
  novaProvider,                     // Optional: Nova provider
  cachePath: "./gov-tracker-cache.json",        // Optional: file-based cache (Node.js)
  cache: new LocalStorageCache(),   // Optional: custom cache adapter (browsers)
  chunkingConfig: { ... },          // Optional: log search chunk sizes
  onProgress: (progress) => {},     // Optional: progress callback
});
```

**ChunkingConfig:**
```typescript
chunkingConfig: {
  l1ChunkSize: 10_000,    // Default: 1k blocks
  l2ChunkSize: 10_000_000, // Default: 10M blocks
  delayBetweenChunks: 100, // ms between requests
}
```

---

### Tracking Methods

| Method | Description |
|--------|-------------|
| `trackByTxHash(txHash)` | Track by transaction hash (auto-detects type) |
| `trackFromGovernor(address, proposalId)` | Track governor proposal |
| `trackFromTimelock(address, { operationId })` | Track timelock operation |
| `trackFromCheckpoint(checkpoint)` | Resume from cached checkpoint |

```typescript
const results = await tracker.trackByTxHash("0x...");
const result = results[0];
console.log(result.stages, result.isComplete, result.proposalType);
```

---

### Execution

```typescript
const prep = await tracker.prepareTransaction(stage, {
  salt: "0x...",                  // Optional: override salt
  predecessor: "0x...",           // Optional: override predecessor
  prepareCompleted: false,        // Optional: prepare completed stages (for historical validation)
  description: "...",             // Optional: proposal description (for salt derivation)
  skipSaltValidation: false,      // Optional: skip salt validation
  skipRetryableValueCalculation: false, // Optional: skip retryable value calculation
});

if (prep.success) {
  await signer.sendTransaction(prep.prepared);
}
```

---

### Discovery

```typescript
import { buildDefaultTargets } from "@gzeoneth/gov-tracker";

const { proposals, timelockOps, watermarks } = await tracker.discoverAll(
  buildDefaultTargets(),
  await l2Provider.getBlockNumber()
);
```

---

### Cache Methods

| Method | Description |
|--------|-------------|
| `listCheckpointKeys()` | List all checkpoint keys |
| `getCheckpoint(key)` | Get specific checkpoint |
| `getAllCheckpoints()` | Get all checkpoints |
| `queryIncompleteCheckpoints(opts)` | Find items needing re-track |
| `getStats()` | Get cache statistics |

```typescript
const incomplete = await tracker.queryIncompleteCheckpoints({
  maxAgeDays: 60,
  maxErrorCount: 5,
});
```

---

### Elections

```typescript
const election = await tracker.checkElection();
if (election.canCreate) {
  await signer.sendTransaction(election.prepared.createElection);
}
```

---

## Utility Functions

### Stage Utilities

| Function | Description |
|----------|-------------|
| `findExecutableStage(stages)` | Find first READY stage |
| `findAllExecutableStages(stages)` | Find all READY stages |
| `needsAction(result)` | Check if any stage needs attention |
| `getCurrentStage(stages)` | Get current active stage |
| `areAllStagesComplete(stages)` | Check if all complete |
| `isStageType(stage, type)` | Type guard for stage type |
| `getStageData(stage, type)` | Get typed stage data |

### Discovery

| Function | Description |
|----------|-------------|
| `detectProposalType(address, provider)` | Detect governor type |
| `getProposalState(governor, id, provider)` | Get proposal state |
| `getTimelockOperationState(timelock, id, provider)` | Get timelock state |
| `isKnownGovernor(address)` | Check if known governor |
| `isKnownL2Timelock(address)` | Check if known timelock |

### Timing

| Function | Description |
|----------|-------------|
| `calculateEta(stage)` | Calculate ETA for pending stage |
| `hasDeadlinePassed(deadline)` | Check if deadline passed |
| `isChallengeComplete(block, currentBlock)` | Check challenge period |

### URLs

| Function | Description |
|----------|-------------|
| `getTxUrl(hash, chain)` | Get explorer URL for tx |
| `getStageTransactionUrl(stage)` | Get URL for stage tx |

---

## Constants

### `ADDRESSES`

```typescript
ADDRESSES.CONSTITUTIONAL_GOVERNOR
ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR
ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK
ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK
ADDRESSES.L1_TIMELOCK
ADDRESSES.ELECTION_NOMINEE_GOVERNOR
ADDRESSES.ELECTION_MEMBER_GOVERNOR
```

### `TIMING`

```typescript
TIMING.L2_CONSTITUTIONAL_TIMELOCK_DELAY_SECONDS     // 691,200 (8 days)
TIMING.L2_NON_CONSTITUTIONAL_TIMELOCK_DELAY_SECONDS // 259,200 (3 days)
TIMING.L1_TIMELOCK_DELAY_SECONDS                    // 259,200 (3 days)
TIMING.CHALLENGE_PERIOD_BLOCKS_L1                   // 45,818 (~6.4 days)
```

### `CHUNK_SIZES`

```typescript
CHUNK_SIZES.L1        // 10,000 blocks
CHUNK_SIZES.L2        // 10,000,000 blocks
CHUNK_SIZES.DELAY_MS  // 100ms
```

---

## Types

### Core Types

```typescript
type StageType =
  | "PROPOSAL_CREATED" | "VOTING_ACTIVE" | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK" | "L2_TO_L1_MESSAGE" | "L1_TIMELOCK" | "RETRYABLE_EXECUTED";

type StageStatus =
  | "NOT_STARTED" | "PENDING" | "READY" | "COMPLETED" | "FAILED" | "SKIPPED";

type ChainType = "L1" | "L2" | "NOVA";

interface TrackedStage {
  type: StageType;
  status: StageStatus;
  chain: ChainType;
  transactions: StageTransaction[];
  data: TrackedStageData;
  timing?: StageTiming;
  executable?: boolean;
}

interface TrackingResult {
  stages: TrackedStage[];
  isComplete: boolean;
  proposalType?: ProposalType;
  currentState?: ProposalState;
  checkpoint: TrackingCheckpoint;
}
```

### Stage Data Types

```typescript
interface VotingActiveData {
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  quorum: string;
  quorumReached: boolean;
}

interface TimelockStageData {
  operationId: string;
  timelockAddress: string;
  eta?: number;
  state?: string;
}

interface L2ToL1MessageStageData {
  messageCount: number;
  firstExecutableBlock?: number;
  status?: string;
}
```

### Configuration

```typescript
interface TrackerOptions {
  l2Provider: Provider;
  l1Provider: Provider;
  novaProvider?: Provider;
  cachePath?: string;           // File path (Node.js only)
  cache?: CacheAdapter;         // Custom adapter (browsers/custom backends)
  chunkingConfig?: ChunkingConfig;
  onProgress?: OnProgressCallback;
}

// Built-in cache adapters:
// - FileCache: JSON file persistence (Node.js)
// - LocalStorageCache: Browser localStorage
// - MemoryCache: In-memory, no persistence

interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(prefix?: string): Promise<string[]> | string[] | IterableIterator<string>;
}

interface PrepareResult =
  | { success: true; prepared: PreparedTransaction }
  | { success: false; error: string };
```
