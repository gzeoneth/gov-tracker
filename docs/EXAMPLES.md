# Usage Examples

Practical examples for the `@gzeoneth/gov-tracker` SDK.

## Quick Start

```typescript
import { ethers } from "ethers";
import { createTracker, findExecutableStage } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider: new ethers.providers.JsonRpcProvider(process.env.ARB1_RPC),
  l1Provider: new ethers.providers.JsonRpcProvider(process.env.ETH_RPC),
  novaProvider: new ethers.providers.JsonRpcProvider(process.env.NOVA_RPC),
  cachePath: "./gov-tracker-cache.json", // Optional: enables caching
});

// Track a proposal
const results = await tracker.trackByTxHash("0x...");
for (const stage of results[0].stages) {
  console.log(`${stage.type}: ${stage.status}`);
}

// Execute ready stage
const readyStage = findExecutableStage(results[0].stages);
if (readyStage) {
  const prep = await tracker.prepareTransaction(readyStage);
  if (prep.success) {
    await signer.sendTransaction(prep.prepared);
  }
}
```

---

## Tracking

### By Transaction Hash

```typescript
const results = await tracker.trackByTxHash(txHash);
const result = results[0];

console.log(`Type: ${result.proposalType}, State: ${result.currentState}`);
for (const stage of result.stages) {
  console.log(`${stage.type}: ${stage.status}`);
  if (stage.timing?.eta) console.log(`  ETA: ${new Date(stage.timing.eta * 1000)}`);
}
```

### By Governor or Timelock

```typescript
import { ADDRESSES } from "@gzeoneth/gov-tracker";

// From governor
const result = await tracker.trackFromGovernor(
  ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  proposalId
);

// From timelock
const result = await tracker.trackFromTimelock(
  ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  { operationId: "0x..." }
);
```

---

## Discovery & Monitoring

```typescript
import { buildDefaultTargets, needsAction } from "@gzeoneth/gov-tracker";

const currentBlock = await l2Provider.getBlockNumber();
const { proposals, timelockOps } = await tracker.discoverAll(
  buildDefaultTargets(),
  currentBlock
);

// Track discovered items
for (const p of proposals) {
  const results = await tracker.trackByTxHash(p.creationTxHash);
  if (needsAction(results[0])) {
    console.log(`Action needed: ${p.proposalId.slice(0, 10)}...`);
  }
}

// Re-check incomplete items from cache
const incomplete = await tracker.queryIncompleteCheckpoints({ maxAgeDays: 60 });
for (const { checkpoint } of incomplete) {
  await tracker.trackFromCheckpoint(checkpoint);
}
```

### Cache Statistics

```typescript
const stats = await tracker.getStats();
console.log(`Proposals: ${stats.proposals.complete}/${stats.proposals.total} complete`);
console.log(`Timelocks: ${stats.timelocks.complete}/${stats.timelocks.total} complete`);
```

---

## Caching

### Browser Usage (localStorage)

```typescript
import { createTracker, LocalStorageCache } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cache: new LocalStorageCache("arb-gov:"), // Custom prefix
});

// Cached stages restore automatically on page reload
const results = await tracker.trackByTxHash(txHash);
```

### In-Memory Cache

```typescript
import { createTracker, MemoryCache } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cache: new MemoryCache(), // No persistence
});
```

### Custom Cache Adapter

```typescript
import { CacheAdapter, createTracker } from "@gzeoneth/gov-tracker";

class IndexedDBCache implements CacheAdapter {
  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
  async has(key: string): Promise<boolean> { /* ... */ }
  async keys(prefix?: string): Promise<string[]> { /* ... */ }
}

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cache: new IndexedDBCache(),
});
```

---

## Execution

### Execute Ready Stage

```typescript
import { findExecutableStage } from "@gzeoneth/gov-tracker";

const readyStage = findExecutableStage(result.stages);
if (readyStage) {
  const prep = await tracker.prepareTransaction(readyStage);
  if (prep.success) {
    const tx = await signer.sendTransaction(prep.prepared);
    await tx.wait();
  }
}
```

### Execute All Ready Stages

```typescript
import { findAllExecutableStages } from "@gzeoneth/gov-tracker";

for (const stage of findAllExecutableStages(result.stages)) {
  const prep = await tracker.prepareTransaction(stage);
  if (prep.success) {
    const signer = stage.chain === "L1" ? l1Signer : l2Signer;
    await signer.sendTransaction(prep.prepared);
  }
}
```

---

## Advanced

### Type-Safe Stage Data

```typescript
import { isStageType, getStageData } from "@gzeoneth/gov-tracker";

for (const stage of result.stages) {
  if (isStageType(stage, "VOTING_ACTIVE")) {
    console.log(`Votes: ${stage.data.forVotes} for, ${stage.data.againstVotes} against`);
  }

  const timelockData = getStageData(stage, "L2_TIMELOCK");
  if (timelockData) {
    console.log(`Operation: ${timelockData.operationId}, State: ${timelockData.state}`);
  }
}
```

### Concurrent Tracking

```typescript
import pLimit from "p-limit";

const limit = pLimit(4); // Max 4 concurrent operations

const results = await Promise.all(
  proposals.map(p => limit(() => tracker.trackByTxHash(p.creationTxHash)))
);
```

### Custom Chunk Sizes

```typescript
import { CHUNK_SIZES } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  chunkingConfig: {
    l1ChunkSize: CHUNK_SIZES.L1 / 5,   // Smaller for rate-limited RPCs
    l2ChunkSize: CHUNK_SIZES.L2 / 10,
    delayBetweenChunks: 200,
  },
});
```

---

## Integrations

### Express API

```typescript
app.get("/api/proposal/:txHash", async (req, res) => {
  const results = await tracker.trackByTxHash(req.params.txHash);
  if (!results.length) return res.status(404).json({ error: "Not found" });

  const result = results[0];
  res.json({
    isComplete: result.isComplete,
    proposalType: result.proposalType,
    stages: result.stages.map(s => ({
      type: s.type, status: s.status, eta: s.timing?.eta
    })),
  });
});
```

### Discord/Telegram Notifications

```typescript
async function checkAndNotify() {
  const incomplete = await tracker.queryIncompleteCheckpoints();
  for (const { checkpoint } of incomplete) {
    const result = await tracker.trackFromCheckpoint(checkpoint);
    if (needsAction(result)) {
      const stage = findExecutableStage(result.stages);
      await sendNotification(`Stage ${stage?.type} ready on ${stage?.chain}`);
    }
  }
}
setInterval(checkAndNotify, 5 * 60 * 1000);
```

### Error Handling

```typescript
async function safeTrack(txHash: string) {
  try {
    return { success: true, results: await tracker.trackByTxHash(txHash) };
  } catch (error) {
    // Errors auto-saved to checkpoint; queryIncompleteCheckpoints will include them
    return { success: false, error: error.message };
  }
}
```
