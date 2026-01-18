#!/bin/bash
# Merge coverage from regular and fork tests
# Usage: ./scripts/merge-coverage.sh

set -e

COVERAGE_DIR="coverage"
FORK_COVERAGE_DIR="coverage-fork"
MERGED_DIR="coverage-merged"

# Check if both coverage directories exist
if [ ! -d "$COVERAGE_DIR" ]; then
  echo "Error: $COVERAGE_DIR directory not found. Run 'yarn test:cov' first."
  exit 1
fi

if [ ! -d "$FORK_COVERAGE_DIR" ]; then
  echo "Error: $FORK_COVERAGE_DIR directory not found. Run 'yarn test:cov:fork' first."
  exit 1
fi

# Clean and create merged directory
rm -rf "$MERGED_DIR"
mkdir -p "$MERGED_DIR/.nyc_output"

# Copy coverage JSON files to nyc_output for merging
# Vitest outputs coverage-final.json which is Istanbul-compatible
if [ -f "$COVERAGE_DIR/coverage-final.json" ]; then
  cp "$COVERAGE_DIR/coverage-final.json" "$MERGED_DIR/.nyc_output/regular.json"
else
  echo "Warning: $COVERAGE_DIR/coverage-final.json not found"
fi

if [ -f "$FORK_COVERAGE_DIR/coverage-final.json" ]; then
  cp "$FORK_COVERAGE_DIR/coverage-final.json" "$MERGED_DIR/.nyc_output/fork.json"
else
  echo "Warning: $FORK_COVERAGE_DIR/coverage-final.json not found"
fi

# Merge and generate report
cd "$MERGED_DIR"
npx nyc merge .nyc_output merged-coverage.json
npx nyc report --reporter=text --reporter=html --reporter=json-summary --reporter=lcov -t . --report-dir=.

echo ""
echo "=== Merged Coverage Report ==="
echo "HTML report: $MERGED_DIR/index.html"
echo "Text summary above, JSON summary: $MERGED_DIR/coverage-summary.json"
