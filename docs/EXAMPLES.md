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

---

## Calldata Decoding & Simulation

### Decode Proposal Calldata

```typescript
import { decodeCalldata } from "@gzeoneth/gov-tracker";

// Get proposal calldata from tracking result
const results = await tracker.trackByTxHash(txHash);
const stage = results[0].stages[0]; // PROPOSAL_CREATED
const { calldatas, targets } = stage.data;

// Decode each action in the proposal
for (let i = 0; i < calldatas.length; i++) {
  const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");

  console.log(`Action ${i + 1}: ${decoded.functionName}`);
  console.log(`Target: ${decoded.targetLabel || decoded.targetAddress}`);

  for (const param of decoded.parameters) {
    console.log(`  ${param.name} (${param.type}): ${param.displayValue}`);

    // Nested calls (e.g., timelock → upgradeExecutor → target)
    if (param.nestedCalldata) {
      console.log(`    → ${param.nestedCalldata.functionName}`);
    }
  }
}
```

### Tenderly Simulation Integration

Simulate governance proposal execution using Tenderly API.

```typescript
import axios from "axios";
import {
  decodeCalldata,
  extractAllSimulationsFromDecoded,
} from "@gzeoneth/gov-tracker";

async function simulateWithTenderly(txHash: string) {
  // 1. Get proposal calldata
  const results = await tracker.trackByTxHash(txHash);
  const stage = results[0].stages[0];
  const { calldatas, targets } = stage.data;

  // 2. Decode and extract simulation data
  const allSimulations = [];
  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");
    const sims = extractAllSimulationsFromDecoded(decoded, "arb1");
    allSimulations.push(...sims);
  }

  // 3. Simulate each action with Tenderly
  for (const sim of allSimulations) {
    const simulation = sim.simulation;

    // Prepare Tenderly simulation request
    const tenderlyPayload = {
      network_id: simulation.networkId,
      from: simulation.from,
      to: simulation.to,
      input: simulation.data,
      value: simulation.value || "0",
      save: true,
      save_if_fails: true,
      simulation_type: "quick", // or "full" for traces
    };

    console.log(`Simulating: [${simulation.type}] ${sim.label}`);

    try {
      const response = await axios.post(
        `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/simulate`,
        tenderlyPayload,
        {
          headers: {
            "X-Access-Key": TENDERLY_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      const result = response.data.transaction;
      console.log(`  Status: ${result.status ? "✅ Success" : "❌ Failed"}`);
      console.log(`  Gas Used: ${result.gas_used}`);
      console.log(`  Simulation: https://dashboard.tenderly.co/simulator/${result.id}`);

      // Check state changes
      if (result.state_diff && result.state_diff.length > 0) {
        console.log(`  State Changes: ${result.state_diff.length} contracts affected`);
      }

    } catch (error) {
      console.error(`  Simulation failed:`, error.response?.data || error.message);
    }
  }
}

// Usage
await simulateWithTenderly("0x0625ecb14f56cd385d7838e2c691e0d9cf096fd109fed915ec689d24c8cda068");
```

### Tenderly State Overrides for Timelock Simulations

Timelock simulations require state overrides to mark operations as ready to execute. The SDK provides pre-computed storage slots, or you can use Tenderly's State API for symbolic encoding.

#### Option 1: Using Pre-Computed Storage Slots (Recommended)

The SDK pre-calculates storage slots using the same algorithm as OpenZeppelin TimelockController.

```typescript
import axios from "axios";
import {
  decodeCalldata,
  extractAllSimulationsFromDecoded,
} from "@gzeoneth/gov-tracker";

async function simulateTimelockWithStateOverride(txHash: string) {
  const results = await tracker.trackByTxHash(txHash);
  const stage = results[0].stages[0];
  const { calldatas, targets } = stage.data;

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");
    const sims = extractAllSimulationsFromDecoded(decoded, "arb1");

    for (const sim of sims) {
      // Check if this is a timelock simulation
      if (sim.simulation.type === "timelock") {
        const { timelockAddress, operationId, stateOverrides } = sim.simulation;

        console.log(`Simulating timelock execution: ${operationId}`);

        // Use pre-computed storage slot from SDK
        const stateObjects = {
          [timelockAddress]: {
            storage: {
              [stateOverrides.timestampSlot]: stateOverrides.timestampValue,
            },
          },
        };

        const response = await axios.post(
          `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/simulate`,
          {
            network_id: sim.simulation.networkId,
            from: sim.simulation.from,
            to: sim.simulation.to,
            input: sim.simulation.input,
            value: sim.simulation.value || "0",
            state_objects: stateObjects, // Apply state override
            save: true,
          },
          {
            headers: {
              "X-Access-Key": TENDERLY_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(`  Status: ${response.data.transaction.status ? "✅" : "❌"}`);
        console.log(`  Simulation: https://dashboard.tenderly.co/simulator/${response.data.transaction.id}`);
      }
    }
  }
}
```

#### Option 2: Using Tenderly State Encoding API

For complex state overrides or when you need Tenderly's symbolic state encoding.

```typescript
async function simulateWithTenderlyStateAPI(txHash: string) {
  const results = await tracker.trackByTxHash(txHash);
  const stage = results[0].stages[0];
  const { calldatas, targets } = stage.data;

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");
    const sims = extractAllSimulationsFromDecoded(decoded, "arb1");

    for (const sim of sims) {
      if (sim.simulation.type === "timelock") {
        const { timelockAddress, operationId } = sim.simulation;

        // Step 1: Encode state using Tenderly State API
        const encodeResponse = await axios.post(
          `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/contracts/encode-states`,
          {
            networkID: sim.simulation.networkId,
            stateOverrides: {
              [timelockAddress]: {
                value: {
                  // Symbolic format: mapping[key] = value
                  [`_timestamps[${operationId}]`]: "1", // 1 = ready to execute
                },
              },
            },
          },
          {
            headers: {
              "X-Access-Key": TENDERLY_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        // Step 2: Use encoded state in simulation
        const encodedState = encodeResponse.data.stateOverrides[timelockAddress].value;

        const simResponse = await axios.post(
          `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/simulate`,
          {
            network_id: sim.simulation.networkId,
            from: sim.simulation.from,
            to: sim.simulation.to,
            input: sim.simulation.input,
            value: sim.simulation.value || "0",
            state_objects: {
              [timelockAddress]: {
                storage: encodedState,
              },
            },
            save: true,
          },
          {
            headers: {
              "X-Access-Key": TENDERLY_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(`Operation: ${operationId}`);
        console.log(`Status: ${simResponse.data.transaction.status ? "✅" : "❌"}`);
        console.log(`Simulation: https://dashboard.tenderly.co/simulator/${simResponse.data.transaction.id}`);
      }
    }
  }
}
```

**When to use each approach:**
- **Pre-computed slots (Option 1)**: Faster, no extra API calls, works for standard OpenZeppelin TimelockController
- **State API (Option 2)**: Required for custom storage layouts or complex state modifications beyond simple mapping updates

### Foundry CLI Integration

Prepare simulation data for Foundry's `cast` command.

```typescript
import { decodeCalldata, extractAllSimulationsFromDecoded } from "@gzeoneth/gov-tracker";

async function prepareFoundrySimulation(txHash: string) {
  const results = await tracker.trackByTxHash(txHash);
  const stage = results[0].stages[0];
  const { calldatas, targets } = stage.data;

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");
    const sims = extractAllSimulationsFromDecoded(decoded, "arb1");

    for (const sim of sims) {
      const { from, to, data, value, networkId } = sim.simulation;
      const rpc = networkId === "1" ? process.env.ETH_RPC : process.env.ARB1_RPC;

      console.log(`# Simulate: ${sim.label}`);
      console.log(`cast call ${to} \\`);
      console.log(`  ${data} \\`);
      console.log(`  --from ${from} \\`);
      console.log(`  --value ${value || 0} \\`);
      console.log(`  --rpc-url ${rpc}`);
      console.log();
    }
  }
}
```

### Address Aliasing for L1→L2 Messages

When simulating L1→L2 messages, use address aliasing to match on-chain behavior.

```typescript
import { calculateAddressAlias, getL1TimelockAlias } from "@gzeoneth/gov-tracker";

// Calculate alias for any L1 address
const l1Address = "0xE6841D92B0C345144506576eC13ECf5103aC7f49"; // L1 Timelock
const aliasedAddress = calculateAddressAlias(l1Address);
console.log(aliasedAddress); // 0xf6951Cd6...

// Get L1 Timelock alias (commonly used)
const timelockAlias = getL1TimelockAlias();

// Use in simulation
const simulation = {
  networkId: "42161", // Arb1
  from: timelockAlias, // Aliased address as msg.sender
  to: upgradeExecutorAddress,
  data: executeCalldata,
  value: "0",
};
```
