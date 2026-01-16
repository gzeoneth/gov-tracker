# @gzeoneth/gov-tracker

[![npm version](https://img.shields.io/npm/v/@gzeoneth/gov-tracker.svg)](https://www.npmjs.com/package/@gzeoneth/gov-tracker)
[![codecov](https://codecov.io/gh/gzeoneth/gov-tracker/graph/badge.svg?token=2WVH8Z82TE)](https://codecov.io/gh/gzeoneth/gov-tracker)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Track and execute Arbitrum DAO governance proposal lifecycle stages and Security Council elections.

## Installation

```bash
yarn add @gzeoneth/gov-tracker ethers@^5.8.0
```

## Quick Start

```typescript
import { ethers } from "ethers";
import { createTracker, findExecutableStage, ADDRESSES } from "@gzeoneth/gov-tracker";

// Use StaticJsonRpcProvider for better performance
const tracker = createTracker({
  l2Provider: new ethers.providers.StaticJsonRpcProvider(process.env.ARB1_RPC),
  l1Provider: new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC),
  novaProvider: new ethers.providers.StaticJsonRpcProvider(process.env.NOVA_RPC),
  cachePath: "./gov-tracker-cache.json",
});

// Track from transaction hash
const results = await tracker.trackByTxHash("0x...");
for (const stage of results[0].stages) {
  console.log(`${stage.type}: ${stage.status}`);
}

// Or track from governor
const result = await tracker.trackFromGovernor(ADDRESSES.CONSTITUTIONAL_GOVERNOR, proposalId);

// Execute ready stages
const readyStage = findExecutableStage(results[0].stages);
if (readyStage) {
  const prep = await tracker.prepareTransaction(readyStage);
  if (prep.success) {
    await signer.sendTransaction(prep.prepared);
  }
}
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

## CLI

```bash
# Track a proposal
npx @gzeoneth/gov-tracker track 0x...

# Track AND decode calldata
npx @gzeoneth/gov-tracker track 0x... -i

# Decode calldata only (no tracking)
npx @gzeoneth/gov-tracker track 0x... --inspect-only

# Show simulation data
npx @gzeoneth/gov-tracker track 0x... --show-simulation

# Execute ready stages
npx @gzeoneth/gov-tracker track 0x... -w --private-key $PRIVATE_KEY

# Discover and track all proposals
npx @gzeoneth/gov-tracker run

# Selective tracking (only track specific types)
npx @gzeoneth/gov-tracker run --track-core            # Constitutional proposals only
npx @gzeoneth/gov-tracker run --track-treasury        # Non-constitutional proposals only
npx @gzeoneth/gov-tracker run --track-elections       # Election governors only
npx @gzeoneth/gov-tracker run --track-timelocks       # Direct timelock operations only

# Track with elections enabled in run loop
npx @gzeoneth/gov-tracker run --loop --election

# Disable caching
npx @gzeoneth/gov-tracker track 0x... --no-cache

# Interactive TUI (requires ink)
npx @gzeoneth/gov-tracker ui

# Track election creation tx (auto-switches to election view)
npx @gzeoneth/gov-tracker track 0x82a0baf3...
```

**Shorthands:** `-v` (verbose), `-p` (prepare), `-w` (write), `-i` (inspect)

### Interactive TUI

The `ui` command launches a cache-only terminal interface for browsing proposals:

```bash
# Browse proposals (uses bundled cache, no RPC required)
npx @gzeoneth/gov-tracker ui

# Use custom cache file
npx @gzeoneth/gov-tracker ui --cache ./my-cache.json
```

**Features:**
- Browse proposals with filter tabs (All, Active, Complete, Timelocks, Elections)
- View proposal details, voting statistics, and stage progress
- Inspect decoded calldata with nested parameter display
- View simulation data for Tenderly/Foundry fork testing
- View Security Council election status from cached data
- Search proposals with `/`, sort by date/progress/status

**Navigation:**
| Key | Action |
|-----|--------|
| `j/k` or `↑↓` | Navigate |
| `Ctrl+d/u` | Page down/up |
| `g/G` | Jump to top/bottom |
| `Enter/l` | View details |
| `Tab` | Cycle filter |
| `o` | Cycle sort |
| `/` | Search |
| `c` | View calldata |
| `s` | View simulation |
| `e` | Election status |
| `y` | Copy to clipboard |
| `b/Esc` | Go back |
| `q` | Quit |

**Note:** The TUI requires `ink` and `react` packages (installed as optional dependencies). Use `run` command with `--loop` for live tracking.

### Elections

```bash
# Check election status (next election, can create)
npx @gzeoneth/gov-tracker election

# List all elections with statuses
npx @gzeoneth/gov-tracker election --list

# Track specific election by index
npx @gzeoneth/gov-tracker election --track 0

# Track with detailed nominee/member info
npx @gzeoneth/gov-tracker election --track 0 --details -v

# Create election or execute phase transition
npx @gzeoneth/gov-tracker election --track 0 -w --private-key $PRIVATE_KEY

# Monitor elections in loop mode
npx @gzeoneth/gov-tracker election --loop --interval 300
```

**Election Phases:** `NOT_STARTED` → `CONTENDER_SUBMISSION` → `NOMINEE_SELECTION` → `VETTING_PERIOD` → `MEMBER_ELECTION` → `PENDING_EXECUTION` → `COMPLETED`

**Bundled Cache**: The CLI includes a pre-built cache of completed proposals. On first run, this eliminates initial discovery RPC calls. SDK users can access via `getBundledCachePath()` or direct JSON import - see [Examples](./docs/EXAMPLES.md#bundled-cache-bootstrap).

## Environment

```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # For execution
```

The CLI warns when using default public RPCs. For production, set these environment variables.

## Security & Privacy

**External API Lookups**: When decoding calldata, unknown function selectors are looked up via [4byte.directory](https://www.4byte.directory/). To disable:

```bash
DISABLE_4BYTE_LOOKUP=1 npx @gzeoneth/gov-tracker track 0x...
```

```typescript
import { lookupSignature } from "@gzeoneth/gov-tracker";
const result = await lookupSignature("0x12345678", { disableApiLookup: true });
```

## Documentation

- [API Reference](./docs/API.md) - Complete API documentation
- [Examples](./docs/EXAMPLES.md) - Common patterns and use cases
- [Architecture](./docs/ARCHITECTURE.md) - SDK internals and design

## Development

```bash
yarn build              # Compile TypeScript
yarn test               # Run fast tests (no RPC)
yarn test:coverage      # Run tests with coverage
yarn lint               # Run ESLint
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow.

## Terminology

| SDK Term | Description |
|----------|-------------|
| Constitutional | Core proposals requiring L1 round-trip (8-day L2 timelock) |
| Non-Constitutional | Treasury proposals, L2-only execution (3-day L2 timelock) |
| Election | Security Council election with 6-phase lifecycle |
| Cohort | Security Council has two cohorts (0 and 1) that alternate elections |

See [Arbitrum governance docs](https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal) for more details.

## License

Apache-2.0
