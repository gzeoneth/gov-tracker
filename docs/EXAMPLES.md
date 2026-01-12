# Usage Examples

Practical examples for the `@gzeoneth/gov-tracker` SDK.

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

### Bundled Cache Bootstrap

The npm package includes a pre-built cache of completed proposals (~2.4MB, ~95 proposals).

#### Node.js

```typescript
import * as fs from "fs";
import { createTracker, getBundledCachePath } from "@gzeoneth/gov-tracker";

// Option 1: Copy bundled cache to your app's cache location (recommended)
const bundledPath = getBundledCachePath();
const appCachePath = "./my-app-cache.json";
if (bundledPath && !fs.existsSync(appCachePath)) {
  fs.copyFileSync(bundledPath, appCachePath);
  console.log("Initialized cache from bundled data");
}

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cachePath: appCachePath,
});

// Option 2: Use bundled cache directly (read-only, new proposals won't persist)
const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cachePath: getBundledCachePath(),
});
```

#### Bundlers (webpack, vite, Next.js)

```typescript
import { createTracker, LocalStorageCache } from "@gzeoneth/gov-tracker";
import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";

// Initialize localStorage cache with bundled data
const cache = new LocalStorageCache("arb-gov:");

// Populate cache (only needed once, check if already done)
if (!(await cache.has("tx:0x91226f5bfad5d1c0911ed590287734241f6b3101d8b60970911987dfa74fe37e"))) {
  for (const [key, checkpoint] of Object.entries(bundledCache)) {
    await cache.set(key, checkpoint);
  }
  console.log(`Initialized cache with ${Object.keys(bundledCache).length} entries`);
}

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cache,
});
```

### Browser (localStorage)

```typescript
import { createTracker, LocalStorageCache } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider, l1Provider, novaProvider,
  cache: new LocalStorageCache("arb-gov:"), // Custom prefix
});

// Cached stages restore automatically on page reload
const results = await tracker.trackByTxHash(txHash);
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
    const signer = stage.chain === "ethereum" ? l1Signer : l2Signer;
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
// Simple concurrency limiter (built into CLI, or implement your own)
function pLimit(concurrency: number) {
  const queue: (() => void)[] = [];
  let active = 0;
  const next = () => { active--; if (queue.length > 0) queue.shift()!(); };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try { resolve(await fn()); } catch (e) { reject(e); } finally { next(); }
      };
      if (active < concurrency) run(); else queue.push(run);
    });
}

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

  console.log(`Action ${i + 1}: ${decoded.signature ?? "Unknown"}`);
  if (decoded.decodingTarget) {
    console.log(`Target: ${decoded.decodingTarget}`);
  }

  if (decoded.parameters) {
    for (const param of decoded.parameters) {
      console.log(`  ${param.name} (${param.type}): ${param.value}`);

      // Nested calls (e.g., timelock → upgradeExecutor → target)
      if (param.nested) {
        if (param.nested.isRetryable) {
          console.log(`    → Retryable Ticket to ${param.nested.targetChain}`);
        } else {
          console.log(`    → ${param.nested.signature || "Unknown"}`);
        }
      }
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
      input: simulation.input,
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

Timelock simulations require state overrides to mark operations as ready to execute. The SDK provides symbolic storage format that can be fed directly into Tenderly's State Encoding API.

```typescript
import axios from "axios";
import {
  decodeCalldata,
  extractAllSimulationsFromDecoded,
} from "@gzeoneth/gov-tracker";

async function simulateWithTenderlyStateAPI(txHash: string) {
  const results = await tracker.trackByTxHash(txHash);
  const stage = results[0].stages[0];
  const { calldatas, targets } = stage.data;

  for (let i = 0; i < calldatas.length; i++) {
    const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");
    const sims = extractAllSimulationsFromDecoded(decoded, "arb1");

    for (const sim of sims) {
      if (sim.simulation.type === "timelock") {
        const { timelockAddress, storageOverride } = sim.simulation;

        // Step 1: Encode state using Tenderly State API
        // SDK provides symbolic format ready to use
        const encodeResponse = await axios.post(
          `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/contracts/encode-states`,
          {
            networkID: sim.simulation.networkId,
            stateOverrides: {
              [timelockAddress]: {
                value: storageOverride.symbolic, // Use SDK's symbolic format
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

        console.log(`Operation: ${sim.simulation.operationId}`);
        console.log(`Status: ${simResponse.data.transaction.status ? "✅" : "❌"}`);
        console.log(`Simulation: https://dashboard.tenderly.co/simulator/${simResponse.data.transaction.id}`);
      }
    }
  }
}
```

**What the SDK provides:**
- `storageOverride.symbolic`: Ready-to-use symbolic format like `{ "_timestamps[0x123...]": "1" }`
- `operationId`: Timelock operation ID for reference
- `timelockAddress`: Target contract for state override

The SDK handles the symbolic format construction, and Tenderly's encode-states API converts it to actual storage slots

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
      const { from, to, input, value, networkId } = sim.simulation;
      const rpc = networkId === "1" ? process.env.ETH_RPC : process.env.ARB1_RPC;

      console.log(`# Simulate: ${sim.label}`);
      console.log(`cast call ${to} \\`);
      console.log(`  ${input} \\`);
      console.log(`  --from ${from} \\`);
      console.log(`  --value ${value || 0} \\`);
      console.log(`  --rpc-url ${rpc}`);
      console.log();
    }
  }
}
```

### Address Aliasing for L1→L2 Messages

When simulating L1→L2 messages, use the Arbitrum SDK for address aliasing to match on-chain behavior.

```typescript
import { Address } from "@arbitrum/sdk/dist/lib/dataEntities/address";

// Calculate alias for any L1 address
const l1Address = "0xE6841D92B0C345144506576eC13ECf5103aC7f49"; // L1 Timelock
const aliasedAddress = new Address(l1Address).applyAlias().value;
console.log(aliasedAddress); // 0xf6951Cd6...

// Use in simulation
const simulation = {
  networkId: "42161", // Arb1
  from: aliasedAddress, // Aliased address as msg.sender
  to: upgradeExecutorAddress,
  input: executeCalldata,
  value: "0",
};
```

---

## Election Tracking

### Check Election Status

```typescript
import { checkElectionStatus } from "@gzeoneth/gov-tracker";

const status = await checkElectionStatus(l2Provider, l1Provider);

console.log(`Election count: ${status.electionCount}`);
console.log(`Next cohort: ${status.cohort === 0 ? "First" : "Second"}`);
console.log(`Can create: ${status.canCreateElection}`);

if (!status.canCreateElection) {
  console.log(`Next election in: ${status.timeUntilElection}`);
}
```

### Track All Elections

```typescript
import { trackAllElections, trackIncompleteElections } from "@gzeoneth/gov-tracker";

// Track all elections (including completed)
const allElections = await trackAllElections(l2Provider, l1Provider);
for (const election of allElections) {
  console.log(`Election #${election.electionIndex}: ${election.phase}`);
  console.log(`  Cohort: ${election.cohort === 0 ? "First" : "Second"}`);
  console.log(`  Nominees: ${election.compliantNomineeCount}/6`);
}

// Track only active elections
const activeElections = await trackIncompleteElections(l2Provider, l1Provider);
```

### Track Single Election with Details

```typescript
import {
  trackElectionProposal,
  getNomineeElectionDetails,
  getMemberElectionDetails,
} from "@gzeoneth/gov-tracker";

// Track election by index
const election = await trackElectionProposal(0, l2Provider, l1Provider);
console.log(`Phase: ${election.phase}`);
console.log(`Nominee proposal: ${election.nomineeProposalId}`);
console.log(`Member proposal: ${election.memberProposalId}`);

// Get detailed nominee info
if (election.nomineeProposalId) {
  const nomineeDetails = await getNomineeElectionDetails(0, l2Provider);
  if (nomineeDetails) {
    console.log(`Contenders: ${nomineeDetails.contenders.length}`);
    console.log(`Nominees: ${nomineeDetails.nominees.length}`);
    console.log(`Compliant: ${nomineeDetails.compliantNominees.length}`);
    console.log(`Excluded: ${nomineeDetails.excludedNominees.length}`);

    // List nominees with votes
    for (const nominee of nomineeDetails.compliantNominees) {
      console.log(`  ${nominee.address}: ${nominee.votesReceived.toString()} votes`);
    }
  }
}

// Get detailed member election info
if (election.memberProposalId) {
  const memberDetails = await getMemberElectionDetails(0, l2Provider);
  if (memberDetails) {
    console.log(`Winners: ${memberDetails.winners.length}`);

    // List nominees by rank
    for (const nominee of memberDetails.nominees) {
      const tag = nominee.isWinner ? "[WINNER]" : "";
      console.log(`  #${nominee.rank} ${nominee.address}: ${nominee.weightReceived.toString()} ${tag}`);
    }
  }
}
```

### Execute Election Actions

```typescript
import {
  checkElectionStatus,
  prepareElectionCreation,
  trackElectionProposal,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
} from "@gzeoneth/gov-tracker";

// Step 1: Create new election (when time has elapsed)
const status = await checkElectionStatus(l2Provider, l1Provider);
if (status.canCreateElection) {
  const { transaction, electionIndex } = prepareElectionCreation(status);
  console.log(`Creating election #${electionIndex}`);
  const tx = await signer.sendTransaction(transaction);
  await tx.wait();
}

// Step 2: Track and advance election phases
const election = await trackElectionProposal(0, l2Provider, l1Provider);

// Trigger member election (after vetting period)
if (election.canProceedToMemberPhase) {
  const prepared = await prepareMemberElectionTrigger(election, l2Provider);
  if (prepared) {
    const tx = await signer.sendTransaction(prepared);
    await tx.wait();
    console.log("Member election triggered");
  }
}

// Execute member election (install new council members)
if (election.canExecuteMember) {
  const prepared = await prepareMemberElectionExecution(election, l2Provider);
  if (prepared) {
    const tx = await signer.sendTransaction(prepared);
    await tx.wait();
    console.log("New Security Council members installed");
  }
}
```

### Monitor Elections in Background

```typescript
import { trackAllElections, checkElectionStatus } from "@gzeoneth/gov-tracker";

async function monitorElections() {
  // Check for new election opportunity
  const status = await checkElectionStatus(l2Provider, l1Provider);
  if (status.canCreateElection) {
    await notifySlack(`Election #${status.electionCount} can be created!`);
  }

  // Check for actionable elections
  const elections = await trackAllElections(l2Provider, l1Provider);
  for (const election of elections) {
    if (election.canProceedToMemberPhase) {
      await notifySlack(`Election #${election.electionIndex}: Ready to trigger member phase`);
    }
    if (election.canExecuteMember) {
      await notifySlack(`Election #${election.electionIndex}: Ready to execute member election`);
    }
  }
}

// Run every 5 minutes
setInterval(monitorElections, 5 * 60 * 1000);
```
