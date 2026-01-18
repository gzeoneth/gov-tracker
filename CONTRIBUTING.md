# Contributing

## Development Setup

```bash
git clone https://github.com/gzeoneth/gov-tracker.git
cd gov-tracker
yarn install
```

### Environment Variables

Create a `.env` file for integration tests and CLI usage:

```bash
# Required for integration tests
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc

# Required for fork tests (needs archive access)
ARB1_ARCHIVE_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY

# Optional: for CLI --write mode (transaction execution)
PRIVATE_KEY=0x...
```

## Development Workflow

```bash
yarn build              # Compile TypeScript to dist/
yarn lint               # Run ESLint
yarn lint:fix           # Auto-fix ESLint issues
yarn format             # Format with Prettier
yarn format:check       # Check formatting
yarn check:unused       # Check for dead code with knip
```

## Testing

```bash
yarn test               # Fast tests (NO_RPC=1, ~15s)
yarn test:rpc           # All regular tests with RPC (~3min)
yarn test:fork          # Fork tests with Anvil (~7min)
```

### Coverage

```bash
yarn test:cov           # Regular tests with coverage → coverage/
yarn test:cov:fork      # Fork tests with coverage → coverage-fork/
yarn test:cov:all       # Both + merge → coverage-merged/
```

### Test a single file

```bash
npx vitest run test/utils.test.ts
yarn test:cov test/tracker.test.ts   # with coverage
```

### Fork tests

Fork tests use Anvil to fork chains at historical blocks for deterministic testing. Requires:
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- `ARB1_ARCHIVE_RPC` with archive node access

```bash
yarn test:fork
```

## Code Quality

Pre-commit hooks run automatically via husky + lint-staged:
- ESLint auto-fix on staged `.ts` files
- Prettier formatting on staged `.ts` files
- Dead code check with knip

Before committing, ensure:
- `yarn test` passes
- `yarn lint` shows no errors
- `yarn format:check` passes

## Release Process

This project uses automated npm publishing via GitHub Actions with OIDC authentication.

### npm Tags

| Tag | Source | Description |
|-----|--------|-------------|
| `@alpha` | Manual workflow dispatch | Feature branch testing, version: `X.Y.Z-alpha.<branch>.<sha>` |
| `@beta` | Every merge to `main` | Auto-published, version: `X.Y.Z-beta.<sha>` |
| `@latest` | Manual git tag `v*` | Stable release |

### Alpha Releases (Feature Branch Testing)

1. Go to **Actions** → **Publish to npm** → **Run workflow**
2. Select your branch and npm tag (`alpha` default)

```bash
npm install @gzeoneth/gov-tracker@alpha  # X.Y.Z-alpha.<branch>.<sha>
```

> **Note:** Branch names are sanitized for npm compatibility: non-alphanumeric characters are replaced with `-` and converted to lowercase (e.g., `feature/my-branch` → `feature-my-branch`).

### Automatic Beta Releases

Every push to `main` auto-publishes a beta:

```bash
npm install @gzeoneth/gov-tracker@beta  # X.Y.Z-beta.<sha>
```

### Stable Releases (Maintainers)

```bash
npm version patch  # or minor/major
# Update CHANGELOG.md: move [Unreleased] to new version
git add package.json CHANGELOG.md
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags  # CI publishes automatically
```

### Verification

```bash
npm view @gzeoneth/gov-tracker
npx @gzeoneth/gov-tracker --help
```

### Troubleshooting

| Error | Solution |
|-------|----------|
| 403 Forbidden | Check GitHub environment secrets for `publish` |
| Version exists | Version already published, bump again |
| Build failures | Fix lint/format/test errors |
| Beta not published | Check if commit message starts with `release:` (skipped) |
