# Arbitrum Governance Stage Tracking SDK - Formal Specification

**Version**: 1.0.0
**Status**: Draft
**Audience**: SDK Implementers (other languages)

---

## 1. Overview

This specification defines the behavior of a governance proposal tracking SDK for Arbitrum governance. The SDK tracks proposals through a 7-stage lifecycle from creation to final execution, providing prepare-only transaction preparation without execution.

### 1.1 Design Principles

1. **Prepare-only**: SDK tracks stages and prepares transactions; never executes
2. **Functional pipeline**: Immutable state flows through pure tracking functions
3. **Read-only operations**: All RPC operations are idempotent and safe to retry
4. **Graceful degradation**: Performance optimizations may silently fail without affecting correctness

### 1.2 Scope

This specification covers:
- Proposal stage tracking (7 stages)
- Security Council elections (separate state machine)
- Transaction preparation for READY stages
- Caching and checkpoint persistence
- Discovery of proposals and timelock operations

**Out of scope**:
- CLI behavior (consumer of SDK)
- Gas estimation (caller responsibility)
- Transaction execution (caller responsibility)
- Security Council emergency actions (bypass timelocks entirely)

---

## 2. Chain Configuration

### 2.1 Supported Chains

| Chain | Name | Chain ID | Type |
|-------|------|----------|------|
| Ethereum | `ethereum` | 1 | L1 |
| Arbitrum One | `arb1` | 42161 | L2 |
| Arbitrum Nova | `nova` | 42170 | L2 |

All L2 chains follow the same specification; chain-specific timing and addresses are configuration values.

### 2.2 Chain Type Definitions

```typescript
type Chain = "ethereum" | "arb1" | "nova" | "unknown";
type KnownChain = Exclude<Chain, "unknown">;
type L2Chain = "arb1" | "nova";
```

---

## 3. Stage Model

### 3.1 Stage Types

All proposals follow a single linear path through 7 stages. Stages that don't apply are marked SKIPPED but remain in the stage array.

| Order | Stage Type | Chain | Description |
|-------|------------|-------|-------------|
| 1 | `PROPOSAL_CREATED` | L2 | Proposal submitted to governor |
| 2 | `VOTING_ACTIVE` | L2 | Voting period with quorum tracking |
| 3 | `PROPOSAL_QUEUED` | L2 | Queued in L2 timelock |
| 4 | `L2_TIMELOCK` | L2 | L2 timelock delay period |
| 5 | `L2_TO_L1_MESSAGE` | L2→L1 | Cross-chain message challenge period (~6.4 days) |
| 6 | `L1_TIMELOCK` | L1 | L1 timelock delay period |
| 7 | `RETRYABLE_EXECUTED` | L2/Nova | Retryable ticket redemption |

### 3.2 Stage Status

```typescript
type StageStatus =
  | "NOT_STARTED"  // Stage not yet reached
  | "PENDING"      // Stage active, waiting for condition
  | "READY"        // Stage ready for execution
  | "COMPLETED"    // Stage successfully completed
  | "FAILED"       // Stage failed (includes expired retryables)
  | "SKIPPED"      // Stage not applicable
  | "CANCELED";    // Proposal was canceled
```

#### 3.2.1 State Transitions

```
NOT_STARTED ─────────────────────────────────────┐
     │                                            │
     ▼                                            │
  PENDING ──────────────────────────┐             │
     │                               │             │
     ▼                               ▼             ▼
   READY ───────────────────────> FAILED ◄───── CANCELED
     │                               ▲
     ▼                               │
 COMPLETED ──────────────────────────┘

(SKIPPED is set directly from NOT_STARTED when stage doesn't apply)
```

### 3.3 Terminal States

A stage is terminal when it cannot transition further:
- `COMPLETED`: Stage successfully finished
- `FAILED`: Stage failed (defeat, expiration, error)
- `SKIPPED`: Stage not applicable
- `CANCELED`: Proposal was canceled by proposer

### 3.4 Stage Data Structures

Each stage type has specific data fields. All large numbers (BigInt values) MUST be serialized as decimal strings.

#### 3.4.1 Common Fields

All stage data extends BaseStageData:

```typescript
interface BaseStageData {
  reason?: string;      // Reason for current status
  skipReason?: string;  // Why stage was skipped
  note?: string;        // Informational note
  message?: string;     // Status message
  fastPath?: boolean;   // Was fast-path optimization used
  isElection?: boolean; // Is this an election-related proposal
}
```

#### 3.4.2 PROPOSAL_CREATED

```typescript
interface ProposalCreatedData extends BaseStageData {
  proposalId?: string;     // Proposal ID (decimal string)
  proposer: string;        // Proposer address
  description: string;     // Proposal description (may be truncated to 100KB)
  startBlock: string;      // Voting start block
  endBlock: string;        // Voting end block
  targetCount?: number;    // Number of target contracts
  targets?: string[];      // Target contract addresses
  values?: string[];       // ETH values (decimal strings)
  signatures?: string[];   // Function signatures (may be empty)
  calldatas?: string[];    // Encoded calldata
  proposalType?: string;   // "constitutional" | "nonConstitutional" | "election"
}
```

#### 3.4.3 VOTING_ACTIVE

```typescript
interface VotingActiveData extends BaseStageData {
  forVotes: string;        // For votes (formatted)
  forVotesRaw: string;     // For votes (raw decimal)
  againstVotes: string;    // Against votes (formatted)
  againstVotesRaw: string;
  abstainVotes: string;    // Abstain votes (formatted)
  abstainVotesRaw: string;
  quorum: string;          // Required quorum (formatted)
  quorumRaw: string;       // Required quorum (raw decimal)
  quorumReached: boolean;  // Has quorum been reached
  deadline: string;        // Voting deadline block
  extendedDeadline?: string;  // Extended deadline if vote was close
  wasExtended?: boolean;
  extensionPossible?: boolean;
  hasVettingPeriod?: boolean; // SC governors have vetting periods
  vettingDeadline?: string;
  isVettingActive?: boolean;
  waitingForVetting?: boolean;
  proposalState?: string;  // Current governor proposal state
  startBlock?: string;
  currentBlock?: string;
}
```

When voting fails (defeated or quorum not reached), the stage transitions to FAILED with `reason` set to the failure cause.

#### 3.4.4 PROPOSAL_QUEUED

```typescript
interface ProposalQueuedData extends BaseStageData {
  proposalState: string;     // "Queued" or similar
  timelockAddress?: string;  // L2 timelock address
  operationId?: string;      // Timelock operation ID (32-byte hex)
  eta?: number;              // Timestamp when executable
  callCount?: number;        // Number of calls in operation
  canQueue?: boolean;        // Can this proposal be queued now
  governorAddress?: string;
  proposalId?: string;
  targets?: string[];
  values?: string[];
  calldatas?: string[];
  description?: string;
  callScheduledData?: SerializedCallScheduledData[];
}
```

#### 3.4.5 Timelock Stages (L2_TIMELOCK, L1_TIMELOCK)

```typescript
interface TimelockStageData extends BaseStageData {
  operationId: string;       // 32-byte hex operation ID
  timelockAddress: string;   // Timelock contract address
  callScheduledData?: SerializedCallScheduledData[];
  eta?: number;              // Timestamp when executable
  state?: string;            // Timelock operation state
  waitingForDelay?: boolean;
  isSecurityCouncilOperation?: boolean;
  securityCouncilMembers?: string[];
  securityCouncilNonce?: string;
  salt?: string;             // 32-byte hex salt for execution
  predecessor?: string;      // 32-byte hex predecessor ID
  description?: string;
  isBatchOperation?: boolean; // schedule vs scheduleBatch
}
```

Note: L2_TIMELOCK does NOT store `callScheduledData` to avoid duplication with PROPOSAL_QUEUED. Implementations must resolve callScheduledData from PROPOSAL_QUEUED when preparing L2_TIMELOCK transactions.

#### 3.4.6 L2_TO_L1_MESSAGE

```typescript
interface L2ToL1MessageStageData extends BaseStageData {
  messageCount: number;           // Number of L2→L1 messages
  l2Block: number;                // L2 block containing the message
  l2TxHash: string;               // L2 transaction hash
  messagePositions: string[];     // Message indices in the outbox
  firstExecutableBlock?: number;  // L1 block when messages become executable
  currentL1Block?: number;
  status?: string;                // Arbitrum SDK message status
  messageDetails?: Array<{ index: number; status: string }>;
  hasMultipleMessages?: boolean;

  // Internal optimization field (unstable - may change without notice)
  cachedSendProps?: { sendRootSize: string; sendRootHash: string };
}
```

The `cachedSendProps` field is an internal optimization that caches data from the Arbitrum SDK to avoid redundant ~3-4 second calls. Implementations SHOULD NOT rely on this field; if unavailable, fall back to calling the Arbitrum SDK's `getSendProps()` method.

#### 3.4.7 RETRYABLE_EXECUTED

```typescript
interface RetryableStageData extends BaseStageData {
  ticketCount?: number;           // Number of retryable tickets
  targetChains?: L2Chain[];       // Target chains (arb1, nova, or both)
  targetChainIds?: number[];
  l2TxHash?: string;              // Original L2 tx creating the message
  l1Block?: number;               // L1 block of retryable creation
  creationDetails?: RetryableCreationDetail[];
  redemptionDetails?: RetryableRedemptionDetail[];
  statuses?: string[];            // Per-ticket status
  redeemedCount?: number;
  pendingCount?: number;
  txNotIndexedYet?: boolean;      // L1 tx not yet indexed on L2
}
```

When retryable tickets expire (not redeemed within ~7 days), the stage transitions to FAILED with appropriate reason.

### 3.5 Stage Timing

```typescript
interface StageTiming {
  startedAt?: number;    // Unix timestamp when stage started
  eta?: number;          // Estimated completion timestamp (best-effort, not guaranteed)
  delaySeconds?: number; // Required delay in seconds
  expiresAt?: number;    // When stage expires (for retryables)
}
```

**Timing accuracy**: All timing values are best-effort estimates. ETAs depend on block production rates which vary. Implementations SHOULD NOT rely on timing for correctness.

### 3.6 Staleness Detection

Implementations MUST provide a mechanism to detect stale stages:

```typescript
interface TrackedStage {
  // ... other fields ...
  isStale?: boolean;  // Computed based on configurable threshold
}
```

A stage is considered stale when:
- Status is READY
- Current time > (eta + configurable grace period)
- Stage has not transitioned

Default staleness threshold SHOULD be 7 days for timelocks, 14 days for retryables.

---

## 4. Tracking Pipeline

### 4.1 Entry Points

The SDK supports two tracking entry points:

#### 4.1.1 Governor Tracking

Track from a proposal creation transaction:

```typescript
interface GovernorTrackingInput {
  type: "governor";
  governorAddress: string;
  proposalId: string;
  creationTxHash: string;
}
```

#### 4.1.2 Timelock Tracking

Track from a timelock operation (bypasses governor stages):

```typescript
interface TimelockTrackingInput {
  type: "timelock";
  timelockAddress: string;
  operationId: string;
  scheduledTxHash: string;
}
```

When tracking from timelock, stages 1-3 (PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED) are marked SKIPPED.

### 4.2 Tracking Result

```typescript
interface TrackingResult {
  input: TrackingInput;
  stages: TrackedStage[];        // All 7 stages, in order
  checkpoint: TrackingCheckpoint;
  isComplete: boolean;           // All stages terminal
  proposalType?: ProposalType;
  proposalData?: ProposalData;
  timelockState?: TimelockState;
  currentState?: ProposalState;
  isElection?: boolean;
}
```

`isComplete` is true when all stages have reached a terminal status (COMPLETED, FAILED, SKIPPED, or CANCELED).

### 4.3 Stage Transitions

Each tracking invocation evaluates stages sequentially. A stage transitions when:

| From | To | Condition |
|------|-----|-----------|
| NOT_STARTED | PENDING | Previous stage completed, stage conditions detected |
| NOT_STARTED | SKIPPED | Stage doesn't apply (e.g., no cross-chain message) |
| PENDING | READY | Stage preconditions met (e.g., delay passed) |
| PENDING | FAILED | Error or timeout occurred |
| READY | COMPLETED | Execution transaction confirmed |
| READY | FAILED | Expiration or error |
| Any | CANCELED | Proposal canceled by proposer |

---

## 5. Transaction Preparation

### 5.1 Prepare-Only Philosophy

The SDK prepares transactions but NEVER executes them. Execution is the caller's responsibility.

### 5.2 PreparedTransaction

```typescript
interface PreparedTransaction {
  to: string;           // Target contract address
  data: string;         // Encoded calldata (hex)
  value: string;        // ETH value (decimal string wei)
  chain: Chain;         // Target chain
  chainId: number;      // Target chain ID
  description: string;  // Human-readable description
  operationId?: string; // Timelock operation ID if applicable
  hashValidation?: {    // Validation result
    isValid: boolean;
    error?: string;
  };
}
```

### 5.3 Preparation Rules

1. Only READY stages can be prepared (unless `prepareCompleted: true`)
2. Gas estimation is out of scope
3. Preparation may fail; returns `PrepareResult` with success/error

```typescript
type PrepareResult =
  | { success: true; prepared: PreparedTransaction }
  | { success: false; error: string };
```

### 5.4 Stage-Specific Preparation

| Stage | Transaction | Notes |
|-------|-------------|-------|
| PROPOSAL_QUEUED | `governor.queue(proposalId)` | Queue in timelock |
| L2_TIMELOCK | `timelock.execute(...)` | Execute L2 timelock operation |
| L2_TO_L1_MESSAGE | `outbox.executeTransaction(...)` | Execute L2→L1 message via Outbox |
| L1_TIMELOCK | `timelock.execute(...)` | Execute L1 timelock operation |
| RETRYABLE_EXECUTED | `arbRetryableTx.redeem(ticketId)` | Redeem retryable ticket |

---

## 6. Caching and Checkpoints

### 6.1 Checkpoint Structure

```typescript
interface TrackingCheckpoint {
  version: 1;                    // Schema version
  createdAt: number;             // Unix timestamp
  input: TrackingInput;          // Tracking entry point
  lastProcessedStage: StageType | null;
  lastProcessedBlock: {
    l1: number;
    l2: number;
    nova?: number;
  };
  cachedData: {
    completedStages?: TrackedStage[];  // All non-NOT_STARTED stages
    discoveryWatermarks?: DiscoveryWatermarks;
  };
  metadata?: {
    errorCount: number;
    lastTrackedAt: number;
  };
}
```

### 6.2 Schema Evolution

Checkpoint schema follows **additive-only** evolution:
- New optional fields MAY be added without version bump
- Existing fields MUST NOT be removed or renamed
- Old checkpoints remain valid; missing optional fields use defaults

### 6.3 Cache Adapter Interface

```typescript
interface CacheAdapter {
  get(key: string): Promise<TrackingCheckpoint | null>;
  set(key: string, checkpoint: TrackingCheckpoint): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  getAll(): Promise<Array<{ key: string; checkpoint: TrackingCheckpoint }>>;
}
```

**Consistency guarantees**: Implementation-defined. The CacheAdapter contract is minimal; consistency is the adapter's responsibility.

### 6.4 Cache Key Format

```
proposal:{governorAddress}:{proposalId}
timelock:{timelockAddress}:{operationId}
discovery:watermarks
```

All addresses MUST be lowercase.

---

## 7. Discovery

### 7.1 Watermark-Based Scanning

Discovery uses watermarks for incremental block scanning:

```typescript
type DiscoveryKey =
  | "constitutionalGovernor"
  | "nonConstitutionalGovernor"
  | "electionNomineeGovernor"
  | "electionMemberGovernor"
  | "l2ConstitutionalTimelock"
  | "l2NonConstitutionalTimelock";

type DiscoveryWatermarks = Partial<Record<DiscoveryKey, number>>;
```

### 7.2 Reorg Handling

Implementations MUST detect chain reorganizations and roll back watermarks appropriately.

Detection method:
1. Store block hash with watermark
2. On discovery, verify stored hash matches chain
3. If mismatch, roll back watermark to last confirmed block

### 7.3 Discovery Result

Discovery returns newly found proposals/operations. Each item can then be tracked individually.

---

## 8. Elections (Separate State Machine)

Security Council elections use a distinct state machine from regular proposals.

### 8.1 Election Governors

| Governor | Purpose |
|----------|---------|
| Election Nominee Governor | Nominate candidates |
| Election Member Governor | Elect members |

### 8.2 Election Tracking

Elections are tracked separately with `isElection: true` flag. The stage semantics differ:
- No cross-chain messaging
- Different timelock configurations
- Election-specific data fields

Implementations SHOULD document election-specific behavior in a separate section.

---

## 9. Calldata Decoding

### 9.1 Decoder Behavior

The SDK provides calldata decoding as a **best-effort** feature.

```typescript
interface DecodedCalldata {
  signature: string;      // Function signature (may be unverified)
  name: string;           // Function name
  params: DecodedParam[]; // Decoded parameters
  raw: string;            // Original calldata (hex)
}
```

### 9.2 Signature Resolution

1. Check known ABIs (governor, timelock contracts)
2. Fallback to 4byte.directory lookup (if enabled)
3. Return null if decoding fails

**No correctness guarantee**: External signature databases may return incorrect data. Implementations MUST handle decode failures gracefully (return null, don't throw).

### 9.3 Opt-Out

Implementations MUST support disabling external lookups:
- Environment variable: `DISABLE_4BYTE_LOOKUP=1`

---

## 10. Simulation Data

### 10.1 Simulation Data Format

The simulation module provides data for Tenderly/Foundry integration. This is a **stable API**.

```typescript
interface SimulationData {
  from: string;           // Sender address
  to: string;             // Target contract
  data: string;           // Calldata (hex)
  value: string;          // ETH value (decimal string)
  chainId: number;        // Target chain ID
  blockNumber?: number;   // Block context
  // Additional Tenderly/Foundry-specific fields
}
```

### 10.2 Address Aliasing

L1→L2 transactions use address aliasing. The simulation module handles this:
- L1 address + offset = L2 alias
- Offset: `0x1111000000000000000000000000000000001111`

---

## 11. External Dependencies

### 11.1 Arbitrum SDK

Cross-chain operations (L2→L1 messages, retryable tickets) use the Arbitrum SDK.

Implementations SHOULD:
1. Reference Arbitrum SDK for message handling algorithms
2. Gracefully degrade if SDK internals change
3. Document specific version compatibility

### 11.2 Graceful Degradation

Performance optimizations that depend on SDK internals (e.g., `cachedSendProps`) MUST:
1. Fail silently if optimization unavailable
2. Fall back to standard SDK methods
3. Not affect correctness

---

## 12. Public API Surface

This specification defines a **dual API**:

### 12.1 Class API (Convenience)

```typescript
class ProposalStageTracker {
  // Tracking
  trackByTxHash(txHash: string): Promise<TrackingResult>;
  trackFromCheckpoint(checkpoint: TrackingCheckpoint): Promise<TrackingResult>;

  // Discovery
  discoverProposals(governor, fromBlock, toBlock): Promise<ProposalData[]>;
  discoverTimelockOps(timelock, fromBlock, toBlock): Promise<TimelockOperation[]>;
  discoverAll(targets, toBlock, watermarks): Promise<DiscoveryResult>;

  // Checkpoints
  getCheckpoint(key: string): Promise<TrackingCheckpoint | null>;
  getAllCheckpoints(): Promise<TrackingCheckpoint[]>;
  queryIncompleteCheckpoints(options): Promise<TrackingCheckpoint[]>;
  getStats(maxErrorCount): Promise<TrackerStats>;

  // Execution
  prepareTransaction(stage: TrackedStage): Promise<PrepareResult>;

  // Static
  static readCacheStatus(cachePath): CacheStatus;
}
```

### 12.2 Functional API (Advanced)

Pure functions for custom pipelines:

```typescript
// State creation
function createTrackingState(input: TrackingInput, options: TrackingOptions): TrackingState;

// Stage tracking (pure)
function trackProposalCreated(state: TrackingState): Promise<StageTrackResult>;
function trackVotingActive(state: TrackingState): Promise<StageTrackResult>;
function trackProposalQueued(state: TrackingState): Promise<StageTrackResult>;
function trackL2Timelock(state: TrackingState): Promise<StageTrackResult>;
function trackL2ToL1Message(state: TrackingState): Promise<StageTrackResult>;
function trackL1Timelock(state: TrackingState): Promise<StageTrackResult>;
function trackRetryableExecuted(state: TrackingState): Promise<StageTrackResult>;

// Pipeline
function trackGovernorPipeline(state: TrackingState): Promise<TrackingState>;
function trackTimelockPipeline(state: TrackingState): Promise<TrackingState>;
```

---

## 13. Serialization

### 13.1 BigInt Handling

All large numbers MUST be serialized as decimal strings:

```typescript
// Correct
{ "proposalId": "123456789012345678901234567890" }

// Incorrect
{ "proposalId": 123456789012345678901234567890 }  // JSON precision loss
{ "proposalId": "0x123abc" }  // Inconsistent format
```

### 13.2 Addresses

All addresses MUST be:
- Lowercase
- 0x-prefixed
- 40 hex characters (20 bytes)

---

## 14. Versioning

This specification uses semantic versioning. Changes are documented per-release in CHANGELOG.

| Change Type | Version Impact |
|-------------|----------------|
| New optional field | Document in CHANGELOG; typically patch/minor |
| New required field | Minor or major depending on impact |
| Field removal/rename | Major |
| Behavior change | Document; version based on consumer impact |

---

## 15. Test Vectors

### 15.1 Reference Proposals

Implementations SHOULD test against these known proposals:

#### Constitutional Governor - Full Lifecycle (All 7 stages COMPLETED)

```
Proposal ID: 97685288731263391833044854304895851471157040105038894699042975271050068874277
Governor: 0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9
Creation TX: 0x0625ecb14f56cd385d7838e2c691e0d9cf096fd109fed915ec689d24c8cda068
Creation Block: 292019815

Expected Stages:
- PROPOSAL_CREATED: COMPLETED
- VOTING_ACTIVE: COMPLETED
- PROPOSAL_QUEUED: COMPLETED (block 369071489)
- L2_TIMELOCK: COMPLETED (block 371840413)
- L2_TO_L1_MESSAGE: COMPLETED
- L1_TIMELOCK: COMPLETED (block 23279739)
- RETRYABLE_EXECUTED: COMPLETED (block 375122111)

Operation ID: 0x8b915cc1882cbaa0f5dd0ead1d78fb96fbd9636f23d8ae93a0fe99a7e2be7c4b
```

#### Non-Constitutional Governor - L2-Only Path (Stages 5-7 SKIPPED)

```
Proposal ID: 57495998481040869152703890521939307107269690440073097268210566577740258992963
Governor: 0x789fC99093B09aD01C34DC7251D0C89ce743e5a4
Creation TX: 0xd426ee539f4bfc7ddda642a3db143f6054db97168c2e473a54720a2e363f4262
Creation Block: 389241837

Expected Stages:
- PROPOSAL_CREATED: COMPLETED
- VOTING_ACTIVE: COMPLETED (extended deadline: block 23704465)
- PROPOSAL_QUEUED: COMPLETED
- L2_TIMELOCK: COMPLETED (block 396707192)
- L2_TO_L1_MESSAGE: SKIPPED (L2-only execution)
- L1_TIMELOCK: SKIPPED
- RETRYABLE_EXECUTED: SKIPPED

Operation ID: 0x313821aa48ce176d399069d29c0de9199c0325afa24158f08745443a9539a67e
```

#### Constitutional Governor - Voting FAILED (Defeated)

```
Proposal ID: 60371879178081104082641012273221287927865067413661362234634146098631763379427
Governor: 0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9
Creation TX: 0x91226f5bfad5d1c0911ed590287734241f6b3101d8b60970911987dfa74fe37e

Expected Stages:
- PROPOSAL_CREATED: COMPLETED
- VOTING_ACTIVE: FAILED (reason: "Defeated")
- PROPOSAL_QUEUED: SKIPPED
- L2_TIMELOCK: SKIPPED
- L2_TO_L1_MESSAGE: SKIPPED
- L1_TIMELOCK: SKIPPED
- RETRYABLE_EXECUTED: SKIPPED
```

#### Direct Timelock Entry (No Governor)

```
Timelock: 0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0
Schedule TX: 0xc5dd701fba7cdd670d8f8f5b64542404737c389b3322d78b821a9417708d48ce
Operation ID: 0xaf607f045944b4a9caf0b7e13f0fca93facbf22e389b23ea6cfee07afe452016
Queue Block: 376175960

Expected Stages:
- PROPOSAL_CREATED: SKIPPED (timelock entry)
- VOTING_ACTIVE: SKIPPED
- PROPOSAL_QUEUED: SKIPPED
- L2_TIMELOCK: COMPLETED
- L2_TO_L1_MESSAGE: COMPLETED
- L1_TIMELOCK: COMPLETED
- RETRYABLE_EXECUTED: COMPLETED
```

### 15.2 Algorithm Test Cases

#### 15.2.1 Operation ID Calculation

```
Input: targets, values, payloads, predecessor, salt
Expected: keccak256(abi.encode(targets, values, payloads, predecessor, salt))
```

#### 15.2.2 Proposal ID Calculation

```
Input: targets, values, calldatas, descriptionHash
Expected: uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)))
```

---

## Appendix A: Contract Addresses

### A.1 Arbitrum One (chainId: 42161)

| Contract | Address |
|----------|---------|
| Constitutional Governor | `0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9` |
| Non-Constitutional Governor | `0x789fC99093B09aD01C34DC7251D0C89ce743e5a4` |
| L2 Constitutional Timelock | `0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0` |
| L2 Non-Constitutional Timelock | `0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58` |

### A.2 Ethereum (chainId: 1)

| Contract | Address |
|----------|---------|
| L1 Timelock | `0xE6841D92B0C345144506576eC13ECf5103aC7f49` |
| Outbox | `0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840` |

(Additional addresses in constants.ts)

---

## Appendix B: Timing Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| L2 Constitutional Timelock Delay | 3 days | 259200 seconds |
| L2 Non-Constitutional Timelock Delay | 8 days | 691200 seconds |
| L1 Timelock Delay | 3 days | 259200 seconds |
| L2→L1 Challenge Period | ~6.4 days | Depends on L1 blocks |
| Retryable Ticket Lifetime | ~7 days | Auto-redeem may extend |

---

## Changelog

### v1.0.0 (Draft)
- Initial specification based on SDK v0.2.1
- Defined 7-stage model with terminal states
- Documented dual API (class + functional)
- Specified checkpoint schema evolution rules
- Added election state machine reference
- Defined staleness detection requirement
- Added CANCELED status for canceled proposals
