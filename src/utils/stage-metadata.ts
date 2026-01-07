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
 * Get metadata for all stages in order
 *
 * @example
 * ```typescript
 * const allMeta = getAllStageMetadata();
 * for (const [type, meta] of Object.entries(allMeta)) {
 *   console.log(`${meta.title} (${meta.estimatedDays}d)`);
 * }
 * ```
 */
export function getAllStageMetadata(proposalType?: ProposalType): Record<StageType, StageMetadata> {
  const stages: StageType[] = [
    "PROPOSAL_CREATED",
    "VOTING_ACTIVE",
    "PROPOSAL_QUEUED",
    "L2_TIMELOCK",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK",
    "RETRYABLE_EXECUTED",
  ];

  const result: Partial<Record<StageType, StageMetadata>> = {};
  for (const stage of stages) {
    result[stage] = getStageMetadata(stage, proposalType);
  }

  return result as Record<StageType, StageMetadata>;
}

/**
 * Get stages that require user action (executable stages)
 */
export function getActionableStages(): StageType[] {
  return Object.entries(BASE_METADATA)
    .filter(([, meta]) => meta.requiresAction)
    .map(([type]) => type as StageType);
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

/**
 * Get total expected duration for the full governance lifecycle in days
 */
export function getTotalExpectedDuration(): number {
  return Object.values(DEFAULT_DURATIONS).reduce((sum, d) => sum + d, 0);
}
