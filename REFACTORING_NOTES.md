# Chain Type Refactoring - Remaining Work

## Completed
1. ✅ Created unified `Chain` type = "ethereum" | "arb1" | "nova" | "unknown"
2. ✅ Created `ChainId` type for numeric chain IDs (1 | 42161 | 42170 | number)
3. ✅ Added conversion functions: `chainIdToChain()`, `chainToChainId()`
4. ✅ Added legacy conversion helpers for migration
5. ✅ Updated core type definitions (TrackedStage, StageTransaction, PreparedTransaction)
6. ✅ Updated cross-chain types (RetryableTicketInfo, etc.)
7. ✅ Updated calldata and simulation types
8. ✅ Updated utility functions (chain.ts, urls.ts)
9. ✅ Updated stage base and builder
10. ✅ Ran automated migration script on all files

## Remaining Work

### Files Still Needing Manual Fixes:
1. `src/cli/lib/json-state.ts` - needs Chain import and chainId handling
2. `src/election.ts` - missing chainId in PreparedTransaction
3. `src/index.ts` - duplicate Chain export (remove legacy one)
4. `src/simulation/simulation-data.ts` - remove SimulationChainType, add chainId fields
5. `src/stages/l2-to-l1-message.ts` - fix ChainType usage
6. `src/stages/proposal-queued.ts` - add chainId to PreparedTransaction
7. `src/stages/retryables.ts` - fix remaining targetChain comparisons with "NOVA" vs "nova"
8. `src/stages/timelock.ts` - fix Chain imports and add chainId to PreparedTransaction

### Common Patterns to Fix:
1. **Add chainId to PreparedTransaction returns:**
   ```typescript
   return {
     success: true,
     prepared: {
       to: address,
       data: calldata,
       value: "0",
       chain: "arb1",
       chainId: 42161,  // ADD THIS
       description: "...",
     },
   };
   ```

2. **Fix comparisons with legacy types:**
   - Replace `chain === "NOVA"` with `chain === "nova"`
   - Replace `chain === "L2"` with `chain === "arb1"`
   - Replace `chain === "L1"` with `chain === "ethereum"`

3. **Import Chain instead of ChainType:**
   ```typescript
   import { Chain, ChainId } from "../types";
   ```

4. **Add chainId to StageTransaction:**
   ```typescript
   .tx(hash, blockNumber, "arb1", 42161, { ...options })
   ```

### Testing After Fixes:
1. Run `yarn build` to check compilation
2. Run `yarn lint` to check linting
3. Run `yarn test` for unit tests
4. Test CLI commands

## chainContext vs targetChain Explanation

**Question**: Why do we need both in DecodedCalldata?

**Answer**: They serve different purposes for cross-chain operations:
- `chainContext`: Where the calldata is **executed** (e.g., "ethereum" for L1 transactions)
- `targetChain`: Only for retryable tickets - where the ticket will be **redeemed** (e.g., "arb1" or "nova")

For retryable tickets created on L1:
- `chainContext = "ethereum"` (executed on L1)
- `targetChain = "arb1"` or `"nova"` (redeemed on L2)

This distinction is essential for:
1. Proper address label resolution (labels differ by chain)
2. Correct simulation data preparation
3. Cross-chain message tracking

Regular calldata doesn't need `targetChain` since it's not cross-chain.
