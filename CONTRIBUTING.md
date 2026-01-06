# Contributing

## Development Setup

```bash
git clone https://github.com/gzeoneth/gov-tracker.git
cd gov-tracker
yarn install
```

Create a `.env` file for integration tests:
```bash
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB1_RPC=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
NOVA_RPC=https://nova.arbitrum.io/rpc
```

## Development Workflow

```bash
yarn build              # Compile TypeScript to dist/
yarn lint               # Run ESLint
yarn lint:fix           # Auto-fix ESLint issues
yarn format             # Format with Prettier
yarn format:check       # Check formatting
```

## Testing

```bash
yarn test               # Fast tests (no RPC, ~1.5s)
yarn test:coverage      # Tests with coverage report
yarn test:integration   # Full RPC tests (~10min)
yarn test:all           # All tests except fork tests
```

### Test a single file

```bash
npx vitest run test/utils.test.ts
```

### Skip RPC tests

```bash
NO_RPC=1 yarn test:all
```

## Code Quality

Pre-commit hooks run automatically via husky + lint-staged:
- ESLint auto-fix on staged `.ts` files
- Prettier formatting on staged `.ts` files

Before committing, ensure:
- `yarn test` passes
- `yarn lint` shows no errors
- `yarn format:check` passes

## Publishing to npm

This section is for maintainers publishing new versions.

### Prerequisites

1. npm account with publish access to `@gzeoneth` scope
2. Authenticate: `npm login`
3. Clean working directory

### Steps

1. **Bump version**:
   ```bash
   npm version patch  # 0.1.0 -> 0.1.1
   npm version minor  # 0.1.0 -> 0.2.0
   npm version major  # 0.1.0 -> 1.0.0
   ```

2. **Run tests**:
   ```bash
   yarn test:all
   ```

3. **Dry run**:
   ```bash
   npm publish --dry-run
   ```

4. **Publish**:
   ```bash
   npm publish --access public
   ```

5. **Push tags**:
   ```bash
   git push && git push --tags
   ```

### Verification

```bash
npm view @gzeoneth/gov-tracker
npx @gzeoneth/gov-tracker --help
```

### Troubleshooting

| Error | Solution |
|-------|----------|
| 403 Forbidden | No publish access to `@gzeoneth` scope |
| Version exists | Bump version number |
| Build failures | Fix lint/format errors |
| Missing files | Check `files` array in package.json |
