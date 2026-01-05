# Getting Started

## Installation

```bash
yarn add @gzeoneth/gov-tracker ethers@^5.7.2
```

## Setup

```typescript
import { ethers } from "ethers";
import { createTracker } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider: new ethers.providers.JsonRpcProvider(process.env.ARB1_RPC),
  l1Provider: new ethers.providers.JsonRpcProvider(process.env.ETH_RPC),
  novaProvider: new ethers.providers.JsonRpcProvider(process.env.NOVA_RPC),
  cachePath: "./gov-tracker-cache.json", // Optional: enables caching
});
```

Environment variables:
```bash
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # For execution
```

---

## Track a Proposal

```typescript
const results = await tracker.trackByTxHash("0x...");
const result = results[0];

console.log(`Type: ${result.proposalType}, Complete: ${result.isComplete}`);
for (const stage of result.stages) {
  console.log(`${stage.type}: ${stage.status}`);
}
```

Output:
```
Type: CONSTITUTIONAL_GOVERNOR, Complete: false

PROPOSAL_CREATED: COMPLETED
VOTING_ACTIVE: COMPLETED
PROPOSAL_QUEUED: COMPLETED
L2_TIMELOCK: PENDING
L2_TO_L1_MESSAGE: NOT_STARTED
L1_TIMELOCK: NOT_STARTED
RETRYABLE_EXECUTED: NOT_STARTED
```

---

## Execute Ready Stages

```typescript
import { findExecutableStage } from "@gzeoneth/gov-tracker";

const readyStage = findExecutableStage(result.stages);
if (readyStage) {
  const prep = await tracker.prepareTransaction(readyStage);
  if (prep.success) {
    const provider = prep.prepared.chain === "L1" ? l1Provider : l2Provider;
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    await signer.sendTransaction(prep.prepared);
  }
}
```

---

## Caching

With `cachePath` set, the SDK:
- Resumes tracking from cache (zero-RPC for completed stages)
- Tracks discovery watermarks for incremental scanning
- Stores error counts for retry logic

```typescript
const stats = await tracker.getStats();
console.log(`${stats.proposals.complete}/${stats.proposals.total} proposals complete`);

const incomplete = await tracker.queryIncompleteCheckpoints({ maxAgeDays: 60 });
for (const { checkpoint } of incomplete) {
  await tracker.trackFromCheckpoint(checkpoint);
}
```

---

## CLI

```bash
yarn monitor track --tx 0x...
yarn monitor track --tx 0x... --write --private-key $PRIVATE_KEY
yarn monitor run --concurrency 4
yarn monitor election
```

---

## Next Steps

- [API Reference](./API.md) - Complete API docs
- [Examples](./EXAMPLES.md) - Common patterns
- [Architecture](./ARCHITECTURE.md) - SDK internals

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "No governance operations found" | Use a governor proposal or timelock operation tx |
| "RPC rate limit exceeded" | Use dedicated RPC or reduce chunk sizes |
| "Salt validation failed" | Salt is auto-computed during tracking; override with `salt` option if needed |
| "Stage not READY" | Check `stage.timing.eta` for when it's ready |
