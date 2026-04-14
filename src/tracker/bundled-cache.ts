/**
 * Bundled Cache Extraction Utilities
 *
 * Type-safe utilities for extracting data from the bundled cache JSON.
 * These eliminate the need for consumers to parse checkpoint internals.
 *
 * @example
 * ```typescript
 * import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";
 * import { extractProposals, getWatermarksFromCache } from "@gzeoneth/gov-tracker";
 *
 * const proposals = extractProposals(bundledCache);
 * const watermarks = getWatermarksFromCache(bundledCache);
 * ```
 */

import type {
  TrackingCheckpoint,
  TrackedStage,
  TimelockLink,
  DiscoveryWatermarks,
  GovernorTrackingInput,
  TimelockTrackingInput,
  ElectionTrackingInput,
  ProposalQueuedData,
  VotingActiveData,
  ProposalState,
} from "../types";
import { deriveProposalState, findStage, mergeStages, normalizeTimeline } from "../stages/utils";
import { isElectionKey, isTimelockOpKey, isDiscoveryKey } from "./checkpoint-helpers";

/**
 * Type for the bundled cache JSON structure
 */
export type BundledCache = Record<string, TrackingCheckpoint>;

/**
 * Extracted proposal metadata from a checkpoint
 */
export interface ExtractedProposal {
  cacheKey: string;
  proposalId: string;
  governorAddress: string;
  creationTxHash: string;
  stages: TrackedStage[];
  isComplete: boolean;
  timelockLink?: TimelockLink;
  currentState?: ProposalState;
  operationId?: string;
}

/**
 * Extracted timelock operation metadata from a checkpoint
 */
export interface ExtractedTimelockOp {
  cacheKey: string;
  timelockAddress: string;
  operationId: string;
  scheduledTxHash: string;
  stages: TrackedStage[];
  isComplete: boolean;
}

/**
 * Extracted election metadata from a checkpoint
 */
export interface ExtractedElection {
  cacheKey: string;
  electionIndex: number;
  stages: TrackedStage[];
  phase?: string;
  isComplete: boolean;
}

/**
 * Extract proposal metadata from bundled cache
 *
 * Filters to governor-type checkpoints (excludes elections, timelocks, discovery).
 *
 * @example
 * ```typescript
 * import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";
 * const proposals = extractProposals(bundledCache);
 *
 * for (const p of proposals) {
 *   console.log(`Proposal ${p.proposalId}: ${p.isComplete ? "done" : "active"}`);
 * }
 * ```
 */
export function extractProposals(cache: BundledCache): ExtractedProposal[] {
  const results: ExtractedProposal[] = [];

  for (const [key, checkpoint] of Object.entries(cache)) {
    if (checkpoint.input.type !== "governor") continue;
    if (isElectionKey(key) || isTimelockOpKey(key) || isDiscoveryKey(key)) continue;

    const input = checkpoint.input as GovernorTrackingInput;
    const parentStages = checkpoint.cachedData?.completedStages ?? [];

    // Merge linked timelock stages so consumers see the full lifecycle. Under
    // modular caching the parent stores only the 3 governor stages
    // (PROPOSAL_CREATED, VOTING_ACTIVE, PROPOSAL_QUEUED) and the timelock
    // stages live in a separate checkpoint referenced via metadata.timelockOpKey.
    // Without this merge the list view would freeze at "Queued" forever.
    const timelockOpKey = checkpoint.metadata?.timelockOpKey;
    const linkedStages =
      typeof timelockOpKey === "string"
        ? (cache[timelockOpKey]?.cachedData?.completedStages ?? [])
        : [];
    const stages =
      linkedStages.length > 0
        ? normalizeTimeline(mergeStages(parentStages, linkedStages))
        : parentStages;

    const queuedStage = findStage(stages, "PROPOSAL_QUEUED");
    const votingStage = findStage(stages, "VOTING_ACTIVE");

    const timelockLink = extractTimelockLinkFromStages(stages);
    const votingData = votingStage?.data as VotingActiveData | undefined;
    const snapshotState = votingData?.proposalState as ProposalState | undefined;
    const currentState = deriveProposalState(stages, snapshotState);

    results.push({
      cacheKey: key,
      proposalId: input.proposalId,
      governorAddress: input.governorAddress,
      creationTxHash: input.creationTxHash,
      stages,
      isComplete: stages.length > 0 && stages.every((s) => isTerminal(s.status)),
      timelockLink,
      currentState,
      operationId: (queuedStage?.data as ProposalQueuedData | undefined)?.operationId,
    });
  }

  return results;
}

/**
 * Extract timelock operation metadata from bundled cache
 *
 * Filters to timelock-type checkpoints only.
 */
export function extractTimelockOps(cache: BundledCache): ExtractedTimelockOp[] {
  const results: ExtractedTimelockOp[] = [];

  for (const [key, checkpoint] of Object.entries(cache)) {
    if (checkpoint.input.type !== "timelock") continue;

    const input = checkpoint.input as TimelockTrackingInput;
    const stages = checkpoint.cachedData?.completedStages ?? [];

    results.push({
      cacheKey: key,
      timelockAddress: input.timelockAddress,
      operationId: input.operationId,
      scheduledTxHash: input.scheduledTxHash,
      stages,
      isComplete: stages.length > 0 && stages.every((s) => isTerminal(s.status)),
    });
  }

  return results;
}

/**
 * Extract election metadata from bundled cache
 *
 * Filters to election-type checkpoints only.
 */
export function extractElections(cache: BundledCache): ExtractedElection[] {
  const results: ExtractedElection[] = [];

  for (const [key, checkpoint] of Object.entries(cache)) {
    if (checkpoint.input.type !== "election") continue;

    const input = checkpoint.input as ElectionTrackingInput;
    const stages = checkpoint.cachedData?.completedStages ?? [];
    const electionStatus = checkpoint.cachedData?.electionStatus as { phase?: string } | undefined;

    results.push({
      cacheKey: key,
      electionIndex: input.electionIndex,
      stages,
      phase: electionStatus?.phase,
      isComplete: electionStatus?.phase === "COMPLETED",
    });
  }

  return results;
}

/**
 * Get discovery watermarks from bundled cache
 *
 * Returns the watermarks stored in the discovery:watermarks checkpoint.
 *
 * @example
 * ```typescript
 * import bundledCache from "@gzeoneth/gov-tracker/bundled-cache.json";
 * const watermarks = getWatermarksFromCache(bundledCache);
 *
 * if (watermarks) {
 *   console.log("Core Governor scanned to block:", watermarks.constitutionalGovernor);
 * }
 * ```
 */
export function getWatermarksFromCache(cache: BundledCache): DiscoveryWatermarks | null {
  const checkpoint = cache["discovery:watermarks"];
  if (!checkpoint) return null;

  return checkpoint.cachedData?.discoveryWatermarks ?? null;
}

/**
 * Extract all operation IDs from governor checkpoints
 *
 * Returns a Map of proposalId -> operationId for all proposals that have
 * been queued in a timelock.
 *
 * @param cache - The bundled cache object to extract from
 * @returns Map of proposalId to operationId for queued proposals
 */
export function extractOperationIds(cache: BundledCache): Map<string, string> {
  const result = new Map<string, string>();

  for (const [, checkpoint] of Object.entries(cache)) {
    if (checkpoint.input.type !== "governor") continue;

    const input = checkpoint.input as GovernorTrackingInput;
    const stages = checkpoint.cachedData?.completedStages ?? [];
    const queuedStage = findStage(stages, "PROPOSAL_QUEUED");
    const operationId = (queuedStage?.data as ProposalQueuedData | undefined)?.operationId;

    if (operationId) {
      result.set(input.proposalId, operationId);
    }
  }

  return result;
}

/**
 * Extract TimelockLink from stages array
 *
 * Helper to get timelock link data from completed PROPOSAL_QUEUED stage.
 *
 * @param stages - Array of tracked stages from a proposal
 * @returns TimelockLink if PROPOSAL_QUEUED stage is complete, undefined otherwise
 */
export function extractTimelockLinkFromStages(stages: TrackedStage[]): TimelockLink | undefined {
  const queuedStage = findStage(stages, "PROPOSAL_QUEUED");
  if (queuedStage?.status !== "COMPLETED" || queuedStage.type !== "PROPOSAL_QUEUED") {
    return undefined;
  }

  const tx = queuedStage.transactions[0];
  const data = queuedStage.data as ProposalQueuedData;
  const { operationId, timelockAddress } = data;

  return tx?.hash && operationId && timelockAddress && tx.blockNumber
    ? { txHash: tx.hash, operationId, timelockAddress, queueBlockNumber: tx.blockNumber }
    : undefined;
}

/**
 * Get voting data from stages array
 *
 * Extracts typed vote counts and proposal state from VOTING_ACTIVE stage.
 *
 * @param stages - Array of tracked stages from a proposal
 * @returns VotingActiveData if VOTING_ACTIVE stage exists, null otherwise
 *
 * @example
 * ```typescript
 * const votingData = getVotingDataFromStages(result.stages);
 * if (votingData) {
 *   console.log(`For: ${votingData.forVotesRaw}, Against: ${votingData.againstVotesRaw}`);
 * }
 * ```
 */
export function getVotingDataFromStages(stages: TrackedStage[]): VotingActiveData | null {
  const votingStage = findStage(stages, "VOTING_ACTIVE");
  if (!votingStage || votingStage.type !== "VOTING_ACTIVE") {
    return null;
  }
  return votingStage.data as VotingActiveData;
}

function isTerminal(status: string | undefined): boolean {
  return status === "COMPLETED" || status === "SKIPPED" || status === "FAILED";
}
