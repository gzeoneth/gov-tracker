/**
 * Election-related types for Security Council elections
 */

import { ProposalState } from "./governor";
import { PreparedTransaction } from "./tracking";

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
  currentElection?: ElectionProposalStatus;
  prepared: {
    createElection?: PreparedTransaction;
    triggerMember?: PreparedTransaction;
  };
}
