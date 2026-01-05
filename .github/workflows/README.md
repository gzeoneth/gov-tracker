# GitHub Actions Workflows

This directory contains automated workflows for the gov-tracker repository.

## Workflows

### `ci.yml` - Continuous Integration

Automated testing and quality checks that run on every push and pull request.

**Jobs:**

1. **Test and Lint** (Matrix: Node 22.x, 24.x)
   - Runs on all PRs and pushes
   - Checks: lint, format, build, fast tests
   - Duration: ~2-3 minutes

2. **Integration Tests** (Node 22.x)
   - Runs on pushes and PRs from the same repository
   - Requires RPC endpoint secrets
   - Duration: ~10 minutes
   - Continues on error if secrets not configured

3. **All Tests** (Node 22.x)
   - Runs only on main branch pushes
   - Complete test suite with all integration tests
   - Duration: ~10-15 minutes
   - Requires RPC endpoint secrets

**Required Secrets:**

Configure in repository Settings → Secrets and variables → Actions:

- `ETH_RPC` - Ethereum mainnet RPC URL (e.g., Alchemy, Infura)
- `ARB1_RPC` - Arbitrum One RPC URL
- `NOVA_RPC` - Arbitrum Nova RPC URL (can use public: https://nova.arbitrum.io/rpc)

**Status Badges:**

Add to README.md:
```markdown
[![CI](https://github.com/gzeoneth/gov-tracker/workflows/CI/badge.svg)](https://github.com/gzeoneth/gov-tracker/actions/workflows/ci.yml)
```

### `claude.yml` - Claude Code Integration

Enables automated code assistance via Claude AI.

**Triggers:**
- Issue comments containing `@claude`
- PR comments containing `@claude`
- New issues with `@claude` in title or body
- PR review comments containing `@claude`

**Required Secret:**
- `ANTHROPIC_API_KEY` - API key from https://console.anthropic.com

**Usage:**
- Comment `@claude` followed by your request on any issue or PR
- Claude will analyze the code and provide assistance

## Local Testing

Test workflows locally before pushing:

```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run CI workflow
act -j test

# Run with secrets
act -j integration --secret-file .env.secrets
```

## Debugging Workflow Failures

1. **Lint failures**: Run `yarn lint` locally
2. **Format failures**: Run `yarn format:check` and `yarn format` locally
3. **Build failures**: Run `yarn build` locally
4. **Test failures**: Run `yarn test` (fast) or `yarn test:all` (full suite)
5. **Integration test failures**: Check RPC secrets are configured and valid

## Workflow Maintenance

When updating workflows:
1. Test locally with `act` if possible
2. Validate YAML syntax: https://www.yamllint.com/
3. Check GitHub Actions documentation: https://docs.github.com/actions
4. Update CLAUDE.md if adding new workflows or changing behavior
