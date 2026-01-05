# @gzeoneth/gov-tracker

Track and execute Arbitrum DAO governance proposal lifecycle stages.

## Terminology

The SDK uses terminology aligned with [Arbitrum governance documentation](https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal):

| SDK Term | Description |
|----------|-------------|
| Constitutional | Core proposals requiring L1 round-trip (8-day L2 timelock) |
| Non-Constitutional | Treasury proposals, L2-only execution (3-day L2 timelock) |
| Election | Security Council election proposals |

## Installation

```bash
yarn add @gzeoneth/gov-tracker
```

## Quick Start

```typescript
import { createTracker, ADDRESSES } from "@gzeoneth/gov-tracker";

const tracker = createTracker({
  l2Provider: new ethers.providers.JsonRpcProvider(ARB1_RPC_URL),
  l1Provider: new ethers.providers.JsonRpcProvider(ETH_RPC_URL),
  novaProvider: new ethers.providers.JsonRpcProvider(NOVA_RPC),
});

// Track from governor proposal
const result = await tracker.trackFromGovernor(ADDRESSES.CONSTITUTIONAL_GOVERNOR, proposalId);

for (const stage of result.stages) {
  console.log(`${stage.type}: ${stage.status}`);
}

// Track from timelock operation
const result = await tracker.trackFromTimelock(timelockAddress, { operationId: "0x..." });

// Track from transaction hash
const results = await tracker.trackByTxHash("0x...");
```

## Stages

| # | StageType             | Description                                      |
|---|---------------------- | ------------------------------------------------ |
| 1 | `PROPOSAL_CREATED`    | Proposal submitted on-chain                      |
| 2 | `VOTING_ACTIVE`       | Voting period (~14-16 days)                      |
| 3 | `PROPOSAL_QUEUED`     | Queued in L2 timelock                            |
| 4 | `L2_TIMELOCK`         | L2 timelock delay + execution (3-8 days)         |
| 5 | `L2_TO_L1_MESSAGE`    | Cross-chain message + challenge (~6.4 days)      |
| 6 | `L1_TIMELOCK`         | L1 timelock delay + execution (3 days)           |
| 7 | `RETRYABLE_EXECUTED`  | Retryable tickets redeemed on L2                 |

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

## CLI

The package includes a CLI tool for monitoring and executing governance proposals:

```bash
# After installation, you can use the CLI directly
npx @gzeoneth/gov-tracker track --tx 0x...

# Or if installed globally
gov-tracker track --tx 0x...

# Execute ready stages
gov-tracker track --tx 0x... --write --private-key $PRIVATE_KEY

# Discover and track all proposals
gov-tracker run

# Run with custom chunk sizes for log searches
gov-tracker run --l1-chunk-size 500000 --l2-chunk-size 5000000

# Run with concurrent tracking (faster for many proposals)
gov-tracker run --concurrency 4
```

For development, you can also use:
```bash
yarn monitor:track --tx 0x...
yarn monitor:run
```

## Environment

```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
PRIVATE_KEY=0x...  # For execution
```

## Testing

```bash
yarn test              # Utils tests (~1.5s, pre-commit)
yarn test:unit         # Smoke tests (~45s, quick CI)
yarn test:integration  # Full RPC tests (~10min)
```

## Publishing to npm

This section is for maintainers publishing new versions of the package.

### Prerequisites

1. **npm account**: You must have an npm account with publish access to the `@gzeoneth` scope
2. **Authentication**: Log in to npm locally:
   ```bash
   npm login
   ```
3. **Clean state**: Ensure your working directory is clean (no uncommitted changes)

### Publishing Steps

1. **Update version**: Bump the version number in `package.json` using npm's version command:
   ```bash
   # Patch release (0.1.0 -> 0.1.1)
   npm version patch

   # Minor release (0.1.0 -> 0.2.0)
   npm version minor

   # Major release (0.1.0 -> 1.0.0)
   npm version major
   ```
   This will automatically update `package.json` and create a git commit + tag.

2. **Run tests**: Ensure all tests pass before publishing:
   ```bash
   yarn test:all
   ```

3. **Dry run**: Preview what will be published without actually publishing:
   ```bash
   npm publish --dry-run
   ```
   Review the output to ensure all necessary files are included and no unexpected files are being published.

4. **Publish to npm**:
   ```bash
   npm publish --access public
   ```
   Note: The `--access public` flag is required for scoped packages to be publicly accessible.

   The `prepublishOnly` hook will automatically run linting, format checking, and build before publishing.

5. **Push to GitHub**: Push the version commit and tag to the repository:
   ```bash
   git push && git push --tags
   ```

### Verification

After publishing, verify the package:

1. **Check npm registry**:
   ```bash
   npm view @gzeoneth/gov-tracker
   ```

2. **Test installation** in a separate directory:
   ```bash
   mkdir test-install && cd test-install
   npm init -y
   npm install @gzeoneth/gov-tracker
   ```

3. **Verify CLI** is available:
   ```bash
   npx @gzeoneth/gov-tracker --help
   ```

### Troubleshooting

- **403 Forbidden**: You don't have publish access to the `@gzeoneth` scope. Contact the package owner.
- **Version already exists**: The version in `package.json` has already been published. Bump the version number.
- **Build failures**: The `prepublishOnly` hook will fail if linting, formatting, or build fails. Fix the errors and try again.
- **Missing files**: Check the `files` array in `package.json` includes all necessary files (currently set to `["dist"]`).
