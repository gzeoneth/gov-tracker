/**
 * Election-related types for Security Council elections
 */

import { BigNumber } from "ethers";
import { ProposalState } from "./governor";
import { PreparedTransaction } from "./tracking";

// ============================================================================
// Election Participant Types
// ============================================================================

/**
 * A contender who has registered for the nominee election
 */
export interface ElectionContender {
  address: string;
  /** Block number when they registered as contender */
  registeredAtBlock: number;
  /** Transaction hash of ContenderAdded event */
  registrationTxHash: string;
}

/**
 * A nominee who received enough votes to qualify
 */
export interface ElectionNominee {
  address: string;
  /** Total votes received from all voters */
  votesReceived: BigNumber;
  /** Whether excluded by the nominee vetter */
  isExcluded: boolean;
  /** Block when became nominee (crossed vote threshold) */
  nominatedAtBlock?: number;
  /** Block when excluded (if applicable) */
  excludedAtBlock?: number;
  /** Transaction hash of exclusion (if applicable) */
  exclusionTxHash?: string;
}

/**
 * Vote cast in the member election (with decreasing weight over time)
 */
export interface MemberElectionVote {
  voter: string;
  nominee: string;
  votes: BigNumber;
  weight: BigNumber;
  blockNumber: number;
  txHash: string;
}

/**
 * Nominee's standing in the member election
 */
export interface MemberElectionNominee {
  address: string;
  /** Total weighted votes received */
  weightReceived: BigNumber;
  /** Whether in top 6 (will be elected) */
  isWinner: boolean;
  /** Rank by weight (1 = highest) */
  rank: number;
}

// ============================================================================
// Election Detail Types
// ============================================================================

/**
 * Detailed nominee election information
 */
export interface NomineeElectionDetails {
  proposalId: string;
  electionIndex: number;
  /** All registered contenders */
  contenders: ElectionContender[];
  /** All nominees (including excluded) */
  nominees: ElectionNominee[];
  /** Compliant (non-excluded) nominees */
  compliantNominees: ElectionNominee[];
  /** Excluded nominees with reasons */
  excludedNominees: ElectionNominee[];
  /** Vote threshold to become nominee */
  quorumThreshold: BigNumber;
  /** Target number of nominees needed */
  targetNomineeCount: number;
}

/**
 * Detailed member election information
 */
export interface MemberElectionDetails {
  proposalId: string;
  electionIndex: number;
  /** All nominees with their weighted votes */
  nominees: MemberElectionNominee[];
  /** Top 6 winners who will be elected */
  winners: string[];
  /** Full weight voting deadline block */
  fullWeightDeadline: number;
  /** Proposal deadline block */
  proposalDeadline: number;
}

/**
 * Cohort identifier for Security Council elections
 */
export type CohortType = 0 | 1;

/**
 * Election phase in the Security Council election lifecycle
 */
export type ElectionPhase =
  | "NOT_STARTED"
  | "NOMINEE_SELECTION"
  | "VETTING_PERIOD"
  | "MEMBER_ELECTION"
  | "PENDING_EXECUTION"
  | "COMPLETED";

/**
 * Status of an election proposal
 */
export interface ElectionProposalStatus {
  electionIndex: number;
  phase: ElectionPhase;
  cohort: CohortType;
  nomineeProposalId: string | null;
  memberProposalId: string | null;
  nomineeProposalState: ProposalState | null;
  memberProposalState: ProposalState | null;
  compliantNomineeCount: number;
  targetNomineeCount: number;
  vettingDeadline: number | null;
  isInVettingPeriod: boolean;
  canProceedToMemberPhase: boolean;
  /** True when member election succeeded and can be executed to install new council */
  canExecuteMember: boolean;
}

/**
 * Election status information
 */
export interface ElectionStatus {
  electionCount: number;
  cohort: CohortType;
  nextElectionTimestamp: number;
  currentL1Timestamp: number;
  canCreateElection: boolean;
  secondsUntilElection: number;
  timeUntilElection: string;
}

/**
 * Result of checking Security Council election status
 */
export interface ElectionCheckResult {
  status: ElectionStatus;
  canCreate: boolean;
  canTriggerMember: boolean;
  canExecuteMember: boolean;
  currentElection?: ElectionProposalStatus;
  prepared: {
    createElection?: PreparedTransaction;
    triggerMember?: PreparedTransaction;
    executeMember?: PreparedTransaction;
  };
}
