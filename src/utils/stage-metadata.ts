/**
 * Stage Metadata - Human-readable stage information for UI display
 *
 * Provides titles, descriptions, and timing info for governance stages.
 */

import type { StageType, ProposalType, Chain } from "../types";
import { GOVERNANCE_STAGE_DURATION_DAYS } from "../constants";

/**
 * Metadata for a governance stage
 */
export interface StageMetadata {
  /** Short human-readable title */
  title: string;
  /** Longer description of what happens in this stage */
  description: string;
  /** Which chain this stage occurs on */
  chain: Chain | "CROSS_CHAIN";
  /** Estimated duration in days (may vary by governor type) */
  estimatedDays: number;
  /** Whether this stage requires user action to proceed */
  requiresAction: boolean;
}

const BASE_METADATA: Record<StageType, Omit<StageMetadata, "estimatedDays">> = {
  PROPOSAL_CREATED: {
    title: "Proposal Created",
    description: "Proposal submitted on-chain and awaiting voting period to begin",
    chain: "arb1",
    requiresAction: false,
  },
  VOTING_ACTIVE: {
    title: "Voting Active",
    description: "Token holders are voting on the proposal",
    chain: "arb1",
    requiresAction: false,
  },
  PROPOSAL_QUEUED: {
    title: "Proposal Queued",
    description: "Voting succeeded, proposal queued in L2 timelock",
    chain: "arb1",
    requiresAction: false,
  },
  L2_TIMELOCK: {
    title: "L2 Timelock",
    description:
      "L2 timelock delay and execution. Status: PENDING (waiting for delay), READY (can execute), COMPLETED (executed)",
    chain: "arb1",
    requiresAction: true,
  },
  L2_TO_L1_MESSAGE: {
    title: "L2→L1 Message",
    description:
      "Cross-chain message with challenge period. Status: PENDING (in challenge period), READY (can execute outbox), COMPLETED (confirmed on L1)",
    chain: "CROSS_CHAIN",
    requiresAction: true,
  },
  L1_TIMELOCK: {
    title: "L1 Timelock",
    description:
      "L1 timelock delay and execution. Status: PENDING (waiting for delay), READY (can execute), COMPLETED (executed)",
    chain: "ethereum",
    requiresAction: true,
  },
  RETRYABLE_EXECUTED: {
    title: "Retryable Executed",
    description: "Retryable ticket(s) executed on target chain",
    chain: "CROSS_CHAIN",
    requiresAction: true,
  },
  CREATE_ELECTION: {
    title: "Create Election",
    description: "Security Council election created on-chain",
    chain: "arb1",
    requiresAction: true,
  },
  NOMINEE_ELECTION: {
    title: "Nominee Election",
    description: "Token holders voting on nominee candidates",
    chain: "arb1",
    requiresAction: false,
  },
  NOMINEE_VETTING: {
    title: "Nominee Vetting",
    description: "Vetting period for nominated candidates before member election",
    chain: "arb1",
    requiresAction: true,
  },
  MEMBER_ELECTION: {
    title: "Member Election",
    description: "Token holders voting to elect Security Council members",
    chain: "arb1",
    requiresAction: true,
  },
};

const DEFAULT_DURATIONS: Record<StageType, number> = {
  PROPOSAL_CREATED: 0,
  VOTING_ACTIVE: GOVERNANCE_STAGE_DURATION_DAYS.VOTING,
  PROPOSAL_QUEUED: 0,
  // L2_TIMELOCK combines delay (8 days for Core, 3 for Treasury) + execution (0 days)
  L2_TIMELOCK: GOVERNANCE_STAGE_DURATION_DAYS.L2_CONSTITUTIONAL_TIMELOCK,
  // L2_TO_L1_MESSAGE combines sent (0 days) + challenge period (6.4 days)
  L2_TO_L1_MESSAGE: GOVERNANCE_STAGE_DURATION_DAYS.CHALLENGE_PERIOD,
  // L1_TIMELOCK combines delay (3 days) + execution (0 days)
  L1_TIMELOCK: GOVERNANCE_STAGE_DURATION_DAYS.L1_TIMELOCK,
  RETRYABLE_EXECUTED: 0,
  // Election stages
  CREATE_ELECTION: 0,
  NOMINEE_ELECTION: 7, // ~7 days voting
  NOMINEE_VETTING: 7, // ~7 days vetting
  MEMBER_ELECTION: 21, // ~21 days voting
};

/**
 * Get metadata for a specific stage
 *
 * @example
 * ```typescript
 * const meta = getStageMetadata("VOTING_ACTIVE");
 * console.log(`${meta.title}: ${meta.description}`);
 * // => "Voting Active: Token holders are voting on the proposal"
 * ```
 */
export function getStageMetadata(
  stageType: StageType,
  _proposalType?: ProposalType
): StageMetadata {
  const base = BASE_METADATA[stageType];
  const estimatedDays = DEFAULT_DURATIONS[stageType];

  return {
    ...base,
    estimatedDays,
  };
}

/**
 * Format stage type as human-readable title
 *
 * @example
 * ```typescript
 * formatStageTitle("L2_TIMELOCK") // => "L2 Timelock"
 * ```
 */
export function formatStageTitle(stageType: StageType): string {
  return BASE_METADATA[stageType].title;
}
