# @gzeoneth/gov-tracker

[![npm version](https://img.shields.io/npm/v/@gzeoneth/gov-tracker.svg)](https://www.npmjs.com/package/@gzeoneth/gov-tracker)
[![codecov](https://codecov.io/gh/gzeoneth/gov-tracker/graph/badge.svg?token=2WVH8Z82TE)](https://codecov.io/gh/gzeoneth/gov-tracker)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Track and execute Arbitrum DAO governance proposal lifecycle stages.

## Installation

```bash
yarn add @gzeoneth/gov-tracker
```

## Quick Start

```typescript
import { createTracker, ADDRESSES } from "@gzeoneth/gov-tracker";

// Use StaticJsonRpcProvider for better performance
const tracker = createTracker({
  l2Provider: new ethers.providers.StaticJsonRpcProvider(ARB1_RPC_URL),
  l1Provider: new ethers.providers.StaticJsonRpcProvider(ETH_RPC_URL),
  novaProvider: new ethers.providers.StaticJsonRpcProvider(NOVA_RPC),
});

// Track from governor proposal
const result = await tracker.trackFromGovernor(ADDRESSES.CONSTITUTIONAL_GOVERNOR, proposalId);

for (const stage of result.stages) {
  console.log(`${stage.type}: ${stage.status}`);
}

// Track from transaction hash
const results = await tracker.trackByTxHash("0x...");
```

## Stages

| # | StageType             | Description                                 |
|---|---------------------- | ------------------------------------------- |
| 1 | `PROPOSAL_CREATED`    | Proposal submitted on-chain                 |
| 2 | `VOTING_ACTIVE`       | Voting period (~14-16 days)                 |
| 3 | `PROPOSAL_QUEUED`     | Queued in L2 timelock                       |
| 4 | `L2_TIMELOCK`         | L2 timelock delay + execution (3-8 days)    |
| 5 | `L2_TO_L1_MESSAGE`    | Cross-chain message + challenge (~6.4 days) |
| 6 | `L1_TIMELOCK`         | L1 timelock delay + execution (3 days)      |
| 7 | `RETRYABLE_EXECUTED`  | Retryable tickets redeemed on L2            |

Statuses: `NOT_STARTED`, `PENDING`, `READY`, `COMPLETED`, `FAILED`, `SKIPPED`

## Execution

```typescript
import { findExecutableStage } from "@gzeoneth/gov-tracker";

const readyStage = findExecutableStage(result.stages);
if (readyStage) {
  const prepResult = await tracker.prepareTransaction(readyStage);
  if (prepResult.success) {
    const { to, data, value, chain } = prepResult.prepared;
    const tx = await signer.sendTransaction({ to, data, value });
    await tx.wait();
  }
}
```

## Calldata Decoding & Simulation

Decode proposal calldata and prepare simulation data for Tenderly, Foundry, or other tools.

```typescript
import {
  decodeCalldata,
  extractAllSimulationsFromDecoded,
  getAddressLabel
} from "@gzeoneth/gov-tracker";

// Decode proposal actions
const stage = result.stages[0]; // PROPOSAL_CREATED
const { calldatas, targets } = stage.data;

for (let i = 0; i < calldatas.length; i++) {
  const decoded = await decodeCalldata(calldatas[i], targets[i], 0, "arb1");

  console.log(`${decoded.signature}`);
  console.log(`Target: ${getAddressLabel(targets[i], "arb1")}`);

  // Extract simulation data
  const sims = extractAllSimulationsFromDecoded(decoded, "arb1");
  for (const sim of sims) {
    console.log(`Network: ${sim.simulation.networkId}`);
    console.log(`From: ${sim.simulation.from}`);
    console.log(`To: ${sim.simulation.to}`);
  }
}
```

See [Examples](./docs/EXAMPLES.md#calldata-decoding--simulation) for Tenderly and Foundry integration.

## CLI

```bash
# Track a proposal by transaction hash
npx @gzeoneth/gov-tracker track 0x...

# Decode and inspect calldata
npx @gzeoneth/gov-tracker track 0x... --inspect-only

# Show simulation data for Tenderly/Foundry integration
npx @gzeoneth/gov-tracker track 0x... --show-simulation

# Execute ready stages
npx @gzeoneth/gov-tracker track 0x... --write --private-key $PRIVATE_KEY

# Discover and track all proposals
npx @gzeoneth/gov-tracker run

# Disable caching (useful for one-off checks)
npx @gzeoneth/gov-tracker track 0x... --no-cache
```

**Bundled Cache**: The CLI includes a pre-built cache of completed proposals. On first run, this is copied to your local cache directory, eliminating initial discovery RPC calls. SDK users can access via `getBundledCachePath()` - see [Bundled Cache](./docs/EXAMPLES.md#bundled-cache-bootstrap).

## Environment

```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # For execution
```

## Documentation

- [Getting Started](./docs/GETTING_STARTED.md) - Installation and basic usage
- [API Reference](./docs/API.md) - Complete API documentation
- [Examples](./docs/EXAMPLES.md) - Common patterns and use cases
- [Architecture](./docs/ARCHITECTURE.md) - SDK internals and design

## Development

```bash
yarn build              # Compile TypeScript
yarn test               # Run fast tests (no RPC)
yarn test:coverage      # Run tests with coverage
yarn test:coverage:fork # Run fork tests with coverage (requires archive RPC)
yarn test:coverage:all  # Merge all coverage reports
yarn lint               # Run ESLint
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow and publishing instructions.

## Terminology

| SDK Term | Description |
|----------|-------------|
| Constitutional | Core proposals requiring L1 round-trip (8-day L2 timelock) |
| Non-Constitutional | Treasury proposals, L2-only execution (3-day L2 timelock) |
| Election | Security Council election proposals |

See [Arbitrum governance docs](https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal) for more details.

## License

Apache-2.0
