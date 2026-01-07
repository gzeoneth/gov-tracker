#!/bin/bash

# Script to systematically migrate chain types from legacy to new unified types
# This script performs automated replacements across the codebase

set -e

echo "Starting chain type migration..."

# Step 1: Replace ChainType string literals with Chain equivalents
echo "Step 1: Replacing chain type string literals..."
find src -type f -name "*.ts" -not -path "*/types/core.ts" | while read file; do
  # Replace "L1" with "ethereum" in assignments and function arguments
  sed -i 's/: "L1"/: "ethereum"/g' "$file"
  sed -i 's/= "L1"/= "ethereum"/g' "$file"
  sed -i 's/, "L1"/, "ethereum"/g' "$file"
  sed -i 's/("L1")/("ethereum")/g' "$file"
  
  # Replace "L2" with "arb1"  
  sed -i 's/: "L2"/: "arb1"/g' "$file"
  sed -i 's/= "L2"/= "arb1"/g' "$file"
  sed -i 's/, "L2"/, "arb1"/g' "$file"
  sed -i 's/("L2")/("arb1")/g' "$file"
  
  # Replace "NOVA" with "nova"
  sed -i 's/: "NOVA"/: "nova"/g' "$file"
  sed -i 's/= "NOVA"/= "nova"/g' "$file"
  sed -i 's/, "NOVA"/, "nova"/g' "$file"
  sed -i 's/("NOVA")/("nova")/g' "$file"
  
  # Replace Target chain types
  sed -i 's/: "Arb1"/: "arb1"/g' "$file"
  sed -i 's/= "Arb1"/= "arb1"/g' "$file"
  sed -i 's/, "Arb1"/, "arb1"/g' "$file"
  sed -i 's/("Arb1")/("arb1")/g' "$file"
  
  sed -i 's/: "Nova"/: "nova"/g' "$file"
  sed -i 's/= "Nova"/= "nova"/g' "$file"
  sed -i 's/, "Nova"/, "nova"/g' "$file"
  sed -i 's/("Nova")/("nova")/g' "$file"
done

echo "Step 1 complete."

# Step 2: Replace type annotations
echo "Step 2: Replacing type annotations..."
find src -type f -name "*.ts" -not -path "*/types/*" | while read file; do
  sed -i 's/: ChainType/: Chain/g' "$file"
  sed -i 's/<ChainType>/<Chain>/g' "$file"
  sed -i 's/TargetChainType/Chain/g' "$file"  
done

echo "Step 2 complete."

echo "Migration script complete. Please review changes and run: yarn build"
