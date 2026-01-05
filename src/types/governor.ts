/**
 * Governor-related types for Arbitrum Governance
 */

import { BigNumber } from "ethers";

/**
 * Proposal types in Arbitrum governance
 *
 * Naming aligned with governance documentation:
 * - CONSTITUTIONAL: Core Governor proposals (require L1 round-trip)
 * - NON_CONSTITUTIONAL: Treasury Governor proposals (L2 only)
 * - ELECTION_*: Security Council election governors
 *
 * @see https://docs.arbitrum.foundation/concepts/lifecycle-anatomy-aip-proposal
 */
export type ProposalType =
  | "CONSTITUTIONAL"
  | "NON_CONSTITUTIONAL"
  | "ELECTION_NOMINEE"
  | "ELECTION_MEMBER"
  | "UNKNOWN";

/**
 * Governor capability determines the proposal execution path
 */
export type GovernorCapability = "WITH_TIMELOCK" | "WITH_VETTING" | "NO_TIMELOCK";

/**
 * Proposal state from the governor contract
 */
export type ProposalState =
  | "Pending"
  | "Active"
  | "Canceled"
  | "Defeated"
  | "Succeeded"
  | "Queued"
  | "Expired"
  | "Executed";

/**
 * Parsed proposal data from ProposalCreated event
 */
export interface ProposalData {
  proposalId: string;
  proposer: string;
  targets: string[];
  values: BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: BigNumber;
  endBlock: BigNumber;
  description: string;
  creationBlock: number;
  creationTxHash: string;
}

/**
 * Voting information for a proposal
 */
export interface VotingData {
  startBlock: BigNumber;
  endBlock: BigNumber;
  deadline: BigNumber;
  forVotes: BigNumber;
  againstVotes: BigNumber;
  abstainVotes: BigNumber;
  quorum: BigNumber;
  hasReachedQuorum: boolean;
  isVotingPeriodOver: boolean;
  extendedDeadline?: BigNumber;
  vettingDeadline?: BigNumber;
  isVettingPeriod?: boolean;
}

/**
 * Parsed arguments from ProposalCreated event
 */
export interface ProposalCreatedEventArgs {
  proposalId: BigNumber;
  proposer: string;
  targets: string[];
  values: BigNumber[];
  signatures: string[];
  calldatas: string[];
  startBlock: BigNumber;
  endBlock: BigNumber;
  description: string;
}
