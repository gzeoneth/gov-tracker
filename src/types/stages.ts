/**
 * Stage data types and TrackedStage definitions
 */

import {
  Chain,
  ChainId,
  L2Chain,
  StageType,
  StageStatus,
  StageTransaction,
  StageTiming,
} from "./core";
import { SerializedCallScheduledData } from "./timelock";
import {
  RetryableTicketInfo,
  RetryableRedemptionInfo,
  RetryableCreationDetail,
  RetryableRedemptionDetail,
} from "./cross-chain";

/**
 * Base stage data with common fields
 */
export interface BaseStageData {
  reason?: string;
  skipReason?: string;
  note?: string;
  message?: string;
  fastPath?: boolean;
}

/**
 * Data for PROPOSAL_CREATED stage
 */
export interface ProposalCreatedData extends BaseStageData {
  proposalId?: string;
  proposer: string;
  description: string;
  startBlock: string;
  endBlock: string;
  targetCount?: number;
  targets?: string[];
  values?: string[];
  signatures?: string[];
  calldatas?: string[];
  proposalType?: string;
}

/**
 * Data for VOTING_ACTIVE stage
 */
export interface VotingActiveData extends BaseStageData {
  forVotes: string;
  forVotesRaw: string;
  againstVotes: string;
  againstVotesRaw: string;
  abstainVotes: string;
  abstainVotesRaw: string;
  quorum: string;
  quorumRaw: string;
  quorumReached: boolean;
  deadline: string;
  extendedDeadline?: string;
  wasExtended?: boolean;
  extensionPossible?: boolean;
  hasVettingPeriod?: boolean;
  vettingDeadline?: string;
  isVettingActive?: boolean;
  proposalState?: string;
  startBlock?: string;
  currentBlock?: string;
}

/**
 * Data for PROPOSAL_QUEUED stage
 */
export interface ProposalQueuedData extends BaseStageData {
  proposalState: string;
  timelockAddress?: string;
  operationId?: string;
  eta?: number;
  callCount?: number;
  canQueue?: boolean;
  governorAddress?: string;
  proposalId?: string;
  targets?: string[];
  values?: string[];
  calldatas?: string[];
  description?: string;
  callScheduledData?: SerializedCallScheduledData[];
}

/**
 * Base for all timelock stages
 */
export interface BaseTimelockData extends BaseStageData {
  operationId: string;
  timelockAddress: string;
  callScheduledData: SerializedCallScheduledData[];
  eta?: number;
  state?: string;
  waitingForDelay?: boolean;
}

/**
 * Common data for all timelock stages (L2 and L1)
 */
export interface TimelockStageData extends BaseTimelockData {
  isSecurityCouncilOperation?: boolean;
  securityCouncilMembers?: string[];
  securityCouncilNonce?: string;
  salt?: string;
  predecessor?: string;
  description?: string;
  /** Whether operation uses scheduleBatch (true) or schedule (false) */
  isBatchOperation?: boolean;
}

/**
 * Data for L2_TO_L1_MESSAGE stage
 */
export interface L2ToL1MessageStageData extends BaseStageData {
  messageCount: number;
  l2Block: number;
  l2TxHash: string;
  messagePositions: string[];
  firstExecutableBlock?: number;
  currentL1Block?: number;
  status?: string;
  messageDetails?: Array<{ index: number; status: string }>;
  hasMultipleMessages?: boolean;
  /** L2ToL1Tx event from Arbitrum SDK (contains message data for salt decoding) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  l2ToL1TxEvent?: any;
}

/**
 * Data for RETRYABLE stages (CREATED and REDEEMED)
 */
export interface RetryableStageData extends BaseStageData {
  ticketCount?: number;
  /** All target chains for retryables (can be both arb1 and nova) */
  targetChains?: L2Chain[];
  targetChainIds?: ChainId[];
  l2TxHash?: string;
  l1Block?: number;
  tickets?: RetryableTicketInfo[];
  redemptions?: RetryableRedemptionInfo[];
  creationDetails?: RetryableCreationDetail[];
  redemptionDetails?: RetryableRedemptionDetail[];
  statuses?: string[];
  redeemedCount?: number;
  pendingCount?: number;
  txNotIndexedYet?: boolean;
}

/**
 * Maps each StageType to its corresponding data interface.
 *
 * Note: The consolidated stages (L2_TIMELOCK, L2_TO_L1_MESSAGE, L1_TIMELOCK)
 * use unified data types that contain all fields needed across their
 * sub-states (PENDING, READY, COMPLETED).
 */
export interface StageDataMap {
  PROPOSAL_CREATED: ProposalCreatedData;
  VOTING_ACTIVE: VotingActiveData;
  PROPOSAL_QUEUED: ProposalQueuedData;
  L2_TIMELOCK: TimelockStageData;
  L2_TO_L1_MESSAGE: L2ToL1MessageStageData;
  L1_TIMELOCK: TimelockStageData;
  RETRYABLE_EXECUTED: RetryableStageData;
}

/**
 * Union of all stage data types
 */
export type TrackedStageData = Partial<
  ProposalCreatedData &
    VotingActiveData &
    ProposalQueuedData &
    TimelockStageData &
    L2ToL1MessageStageData &
    RetryableStageData
> &
  BaseStageData & {
    isElection?: boolean;
    waitingForVetting?: boolean;
    proposalState?: string;
    currentL1Block?: number;
  };

/**
 * A tracked stage in the lifecycle
 */
export interface TrackedStage {
  type: StageType;
  status: StageStatus;
  chain: Chain;
  chainId: ChainId;
  transactions: StageTransaction[];
  data: TrackedStageData;
  timing?: StageTiming;
  executable?: boolean;
  error?: string;
}

/**
 * Type-safe tracked stage with properly typed data field
 */
export type TypedTrackedStage<T extends StageType> = Omit<TrackedStage, "type" | "data"> & {
  type: T;
  data: StageDataMap[T];
};

/**
 * Type guard to check if a stage is of a specific type
 */
export function isStageType<T extends StageType>(stage: TrackedStage, type: T): boolean {
  return stage.type === type;
}

/**
 * Safely get typed stage data, returning null if types don't match
 */
export function getStageData<T extends StageType>(
  stage: TrackedStage,
  expectedType: T
): StageDataMap[T] | null {
  if (stage.type !== expectedType) {
    return null;
  }
  return stage.data as unknown as StageDataMap[T];
}
