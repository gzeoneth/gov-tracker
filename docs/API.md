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
  salt: "0x...",              // Optional: override salt
  predecessor: "0x...",       // Optional: override predecessor
  force: false,               // Force even if not READY
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

### Bundled Cache

The npm package includes a pre-built cache of completed proposals. Use `getBundledCachePath()` to access it:

```typescript
import { getBundledCachePath } from "@gzeoneth/gov-tracker";

// Get path to bundled cache (returns undefined if not found)
const bundledPath = getBundledCachePath();
if (bundledPath) {
  // Option 1: Copy to your app's cache location
  fs.copyFileSync(bundledPath, "./my-app-cache.json");

  // Option 2: Use directly (updates won't persist)
  const tracker = createTracker({ ...providers, cachePath: bundledPath });
}
```

See [Bundled Cache](./EXAMPLES.md#bundled-cache-bootstrap) for more examples.

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
| `extractTimelockLink(stages)` | Extract timelock info from PROPOSAL_QUEUED stage |
| `prepareGovernorQueue(stage, provider)` | Prepare queue transaction for governor |

### Discovery

| Function | Description |
|----------|-------------|
| `detectProposalType(address, provider)` | Detect governor type |
| `getProposalState(governor, id, provider)` | Get proposal state |
| `getTimelockOperationState(timelock, id, provider)` | Get timelock state |
| `isKnownL2Timelock(address)` | Check if known L2 timelock |
| `isL1Timelock(address)` | Check if L1 timelock |

### Chain Utilities

| Function | Description |
|----------|-------------|
| `getChain(provider)` | Get chain name from provider |
| `chainIdToChain(chainId)` | Convert chain ID to chain name |
| `chainToChainId(chain)` | Convert chain name to chain ID |
| `addressEquals(a, b)` | Case-insensitive address comparison |
| `isAddressIn(address, list)` | Check if address in list |

### Timing

| Function | Description |
|----------|-------------|
| `calculateEta(blockNumber, provider)` | Calculate ETA timestamp for block |
| `calculateExpectedEta(currentBlock, delayBlocks, timestamp, blockTime)` | Calculate expected ETA |
| `calculateRemainingSeconds(eta)` | Calculate seconds remaining until ETA |

### URLs

| Function | Description |
|----------|-------------|
| `getTxUrl(hash, chain)` | Get explorer URL for tx |
| `getStageTransactionUrl(stage)` | Get URL for stage tx |

### Error Utilities

| Function | Description |
|----------|-------------|
| `isGasEstimationError(error)` | Check if error is gas estimation failure |

### Advanced Context

| Function | Description |
|----------|-------------|
| `createTrackingState(input, options)` | Create tracking state manually |
| `createCheckpoint(input, stages)` | Create checkpoint from stages |

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

### `NETWORK_IDS`

Tenderly network identifiers:

```typescript
NETWORK_IDS.ethereum  // "1"
NETWORK_IDS.arb1      // "42161"
NETWORK_IDS.nova      // "42170"
```

### `TIMELOCK_SELECTORS`

Function selectors for timelock operations:

```typescript
TIMELOCK_SELECTORS.schedule         // "0x01d5062a"
TIMELOCK_SELECTORS.scheduleBatch    // "0x8f2a0bb0"
TIMELOCK_SELECTORS.execute          // "0x134008d3"
TIMELOCK_SELECTORS.executeBatch     // "0xe38335e5"
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

// Chain identifiers
type Chain = "ethereum" | "arb1" | "nova" | "unknown";
type L2Chain = "arb1" | "nova";
type ChainId = 1 | 42161 | 42170 | number;

// Chain conversion utilities
function chainIdToChain(chainId: ChainId): Chain;
function chainToChainId(chain: Chain): ChainId | undefined;

// TrackedStage is a discriminated union - TypeScript narrows `data` based on `type`
type TrackedStage = {
  type: StageType;
  status: StageStatus;
  chain: Chain;
  chainId: ChainId;
  transactions: StageTransaction[];
  data: StageDataMap[StageType];  // Typed per stage type
  timing?: StageTiming;
  executable?: boolean;
};

// Type guard for narrowing stage type
function isStageType<T extends StageType>(stage: TrackedStage, type: T): stage is TypedTrackedStage<T>;

// Get typed data from a stage (returns null if type mismatch)
function getStageData<T extends StageType>(stage: TrackedStage, type: T): StageDataMap[T] | null;

// Example: TypeScript automatically narrows data when checking type
if (stage.type === "VOTING_ACTIVE") {
  console.log(stage.data.forVotes);  // ✓ TypeScript knows VotingActiveData
}

// Or use the type guard
if (isStageType(stage, "L2_TIMELOCK")) {
  console.log(stage.data.operationId);  // ✓ TypeScript knows TimelockStageData
}

interface StageTransaction {
  hash: string;
  blockNumber: number;
  timestamp?: number;
  chain: Chain;
  chainId: ChainId;
  logIndex?: number;
  targetChain?: Chain;       // For retryables
  targetChainId?: ChainId;
  description?: string;
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

---

## Calldata Decoding

Decode and inspect governance proposal calldata with function signature lookup and parameter parsing.

### `decodeCalldata(calldata, target, depth, chain)`

Recursively decode calldata with nested call detection and retryable ticket parsing.

```typescript
import { decodeCalldata } from "@gzeoneth/gov-tracker";

const decoded = await decodeCalldata(
  "0x...", // calldata
  "0x...", // target address
  0,       // recursion depth
  "arb1"   // chain context
);

console.log(decoded.signature);     // "execute(address,uint256,bytes,bytes32,bytes32)"
console.log(decoded.selector);      // "0x134008d3"

if (decoded.parameters) {
  for (const param of decoded.parameters) {
    console.log(`${param.name}: ${param.value}`);
    if (param.nested) {
      console.log("  → Nested call:", param.nested.signature);
    }
  }
}
```

**Decoded structure:**
```typescript
interface DecodedCalldata {
  selector: string;                 // 4-byte selector
  signature: string | null;         // Full function signature (null if unknown)
  parameters: DecodedParameter[] | null;  // Decoded parameters (null if decoding failed)
  raw: string;                      // Raw calldata hex string
  decodingSource: DecodingSource;   // Source of decoding ("local" | "api" | "failed")
  decodingTarget?: string;          // Target contract address (if known)
}
```

### Signature Lookup

Function signatures are resolved via:
1. **Local registry** - Common governance functions
2. **4byte.directory** - Public signature database with caching

```typescript
import { lookupSignature } from "@gzeoneth/gov-tracker";

const sig = await lookupSignature("0x134008d3");
// Returns: "execute(address,uint256,bytes,bytes32,bytes32)"
```

### Address Utilities

```typescript
import { getAddressLabel } from "@gzeoneth/gov-tracker";

// Get human-readable label for known governance contracts
const label = getAddressLabel("0xf07DeD...", "arb1");
// Returns: "Core Governor"
```

---

## Simulation Data Preparation

Extract simulation-ready data from decoded calldata for integration with simulation tools (Tenderly, Foundry, etc).

### `extractAllSimulationsFromDecoded(decoded, chain)`

Extract all simulatable calls from decoded calldata.

```typescript
import {
  extractAllSimulationsFromDecoded,
  prepareTimelockSimulation,
  prepareRetryableSimulation
} from "@gzeoneth/gov-tracker";

const decoded = await decodeCalldata(calldata, target, 0, "arb1");
const simulations = extractAllSimulationsFromDecoded(decoded, "arb1");

for (const sim of simulations) {
  console.log(`[${sim.simulation.type}] ${sim.label}`);
  console.log(`  Network: ${sim.simulation.networkId}`);
  console.log(`  To: ${sim.simulation.to}`);
  console.log(`  Input: ${sim.simulation.input}`);
}
```

**Simulation types:**
- `timelock` - Timelock execution (L1 or L2)
- `retryable` - Retryable ticket redemption
- `call` - Direct contract call

```typescript
interface ExtractedSimulation {
  simulation: TimelockSimulationData | RetryableSimulationData | CallSimulationData;
  label: string;
  batchIndex?: number;
}

interface TimelockSimulationData {
  type: "timelock";
  networkId: string;              // "1" (L1) or "42161" (Arb1)
  from: string;                   // Aliased address for L1→L2
  to: string;                     // Timelock address
  input: string;                  // Full calldata (executeBatch)
  value: string;                  // Usually "0"
  timelockAddress: string;
  originalCalldata: string;       // Original scheduleBatch calldata
  executeCalldata: string;        // Converted executeBatch calldata
  operationId: string;            // Computed operation ID
  batchParams: {                  // Decoded batch parameters
    targets: string[];
    values: string[];
    calldatas: string[];
    predecessor: string;
    salt: string;
  };
  storageOverride: {              // Storage override for simulation
    symbolic: Record<string, string>; // Symbolic format for Tenderly API
    // Example: { "_timestamps[0x123...]": "1" }
  };
}

interface RetryableSimulationData {
  type: "retryable";
  networkId: string;              // "42161" (Arb1) or "42170" (Nova)
  from: string;                   // Aliased address
  to: string;                     // L2 target
  value: string;
  data: string;
  l2Target: string;
  l2Calldata: string;
  l2Chain: string;                // "arb1" or "nova"
}
```

---

## CLI Options

```bash
# Track and decode calldata
npx gov-tracker track 0x... --inspect-only

# Show simulation data
npx gov-tracker track 0x... --show-simulation

# Execute ready stages
npx gov-tracker track 0x... --write --private-key $PRIVATE_KEY

# Disable caching (don't read or write)
npx gov-tracker track 0x... --no-cache
```
