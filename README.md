# @gzeoneth/gov-tracker

[![npm version](https://img.shields.io/npm/v/@gzeoneth/gov-tracker.svg)](https://www.npmjs.com/package/@gzeoneth/gov-tracker)
[![codecov](https://codecov.io/gh/gzeoneth/gov-tracker/graph/badge.svg?token=2WVH8Z82TE)](https://codecov.io/gh/gzeoneth/gov-tracker)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Track and execute Arbitrum DAO governance proposal lifecycle stages, Security Council elections, and delegate participation.

## Installation

```bash
yarn add @gzeoneth/gov-tracker ethers@^5.8.0
```

## Quick Start

```typescript
import { createTracker, findExecutableStage } from "@gzeoneth/gov-tracker";

// Accepts RPC URLs directly (or ethers Provider objects)
const tracker = createTracker({
  l2Provider: process.env.ARB1_RPC,  // URL string or Provider
  l1Provider: process.env.ETH_RPC,
  novaProvider: process.env.NOVA_RPC,
  cachePath: "./gov-tracker-cache.json",
});

// Track from transaction hash (auto-detects proposal type)
const results = await tracker.trackByTxHash("0x...");
for (const stage of results[0].stages) {
  console.log(`${stage.type}: ${stage.status}`);
}

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

## Voting & Write Actions

Prepare-only functions return `PreparedTransaction` objects — `{ to, data, value, chain, chainId, description }` plus optional `operationId` / `hashValidation` — and you always sign and send yourself.

```typescript
import { ethers } from "ethers";
import {
  prepareCastVote,
  prepareCastVoteWithReason,
  VOTE_SUPPORT,
  prepareNomineeElectionVote,
  prepareContenderRegistration,
  NOMINEE_ELECTION_GOVERNOR_ABI,
  ADDRESSES,
} from "@gzeoneth/gov-tracker";

// Governor proposal vote
const tx = prepareCastVote(proposalId, VOTE_SUPPORT.FOR, "constitutional");
await signer.sendTransaction(tx);

// Vote with on-chain reason
const tx2 = prepareCastVoteWithReason(proposalId, VOTE_SUPPORT.AGAINST, "Insufficient detail");

// Security Council nominee vote (castVoteWithReasonAndParams)
const tx3 = prepareNomineeElectionVote(proposalId, nomineeAddress, votes);

// Contender registration (two-phase: sign EIP-712 typed data, then submit)
// governorName MUST match the governor's on-chain name() value (EIP-712 domain)
const governor = new ethers.Contract(
  ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  NOMINEE_ELECTION_GOVERNOR_ABI,
  l2Provider
);
const governorName: string = await governor.name();
const { typedData, buildTransaction } = prepareContenderRegistration(governorName, proposalId);
const signature = await signer._signTypedData(typedData.domain, typedData.types, typedData.message);
await signer.sendTransaction(buildTransaction(signature));
```

See [API Reference](./docs/API.md#governance-vote-preparation) and [Examples](./docs/EXAMPLES.md#voting) for details.

## Delegates

Indexed ARB delegate registry with cached voting power and live queries:

```typescript
import {
  loadBundledDelegateCache,
  getTopDelegates,
  getDelegateRankInfo,
  queryDelegatesNotVoted,
} from "@gzeoneth/gov-tracker";

// Load bundled cache (sync, no RPC)
const cache = loadBundledDelegateCache();
const top10 = getTopDelegates(cache, 10);

// O(1) rank lookup
const info = getDelegateRankInfo(cache, "0x1234...");
console.log(`Rank ${info?.rank}, voting power ${info?.votingPower}`);

// Live: find top delegates who haven't voted yet on an active proposal
const notVoted = await queryDelegatesNotVoted(l2Provider, proposalId, "constitutional", {
  limit: 10,
  maxDelegatesToCheck: 100,
});
```

Build or refresh the cache via CLI: `npx @gzeoneth/gov-tracker delegates`.

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

# Build or refresh delegate cache from live RPC
npx @gzeoneth/gov-tracker delegates                          # Incremental update
npx @gzeoneth/gov-tracker delegates --force                  # Rebuild from genesis
npx @gzeoneth/gov-tracker delegates --min-power 1000 \
  --output ./my-delegates.json                               # Custom filters/output
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

### RPC Provider Recommendations

For reliable operation, especially during election tracking which makes many RPC calls:

| Chain | Recommended Providers |
|-------|----------------------|
| Ethereum | [Alchemy](https://www.alchemy.com/), [Infura](https://infura.io/), [ethereum.publicnode.com](https://ethereum.publicnode.com/) |
| Arbitrum One | [Alchemy](https://www.alchemy.com/), [arb1.arbitrum.io/rpc](https://arb1.arbitrum.io/rpc), [arbitrum.publicnode.com](https://arbitrum.publicnode.com/) |
| Arbitrum Nova | [nova.arbitrum.io/rpc](https://nova.arbitrum.io/rpc) |

**Note:** Some public RPCs like `cloudflare-eth.com` may return `-32603` internal errors during high load. If you experience intermittent failures, try switching to a dedicated provider.

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
