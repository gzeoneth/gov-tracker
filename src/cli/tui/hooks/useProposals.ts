/**
 * Transform cache checkpoints into displayable proposal list
 */

import { useMemo } from "react";
import type { TrackingCheckpoint, StageType } from "../../../types";
import type { ProposalListItem, FilterType, CacheData } from "../types";

function truncateTitle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function getProposalTitle(checkpoint: TrackingCheckpoint): string {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");

  if (createdStage?.data) {
    const data = createdStage.data as { description?: string };
    if (data.description) {
      const firstLine = data.description.split("\n")[0];
      return truncateTitle(firstLine, 60);
    }
  }

  if (checkpoint.input.type === "governor") {
    return `Proposal ${checkpoint.input.proposalId.slice(0, 12)}...`;
  } else if (checkpoint.input.type === "timelock") {
    return `Timelock Op ${checkpoint.input.operationId.slice(0, 12)}...`;
  }

  return "Unknown";
}

function getProposalStatus(checkpoint: TrackingCheckpoint): "active" | "complete" | "failed" {
  const stages = checkpoint.cachedData.completedStages ?? [];

  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  if (votingStage?.data) {
    const votingData = votingStage.data as { proposalState?: string };
    if (votingData.proposalState === "Defeated" || votingData.proposalState === "Canceled") {
      return "failed";
    }
  }

  const lastStage = stages[stages.length - 1];
  if (
    stages.length === 7 &&
    (lastStage?.status === "COMPLETED" || lastStage?.status === "SKIPPED")
  ) {
    return "complete";
  }

  if ((checkpoint.metadata?.errorCount ?? 0) >= 5) {
    return "failed";
  }

  return "active";
}

function getCurrentStageType(checkpoint: TrackingCheckpoint): StageType | null {
  const stages = checkpoint.cachedData.completedStages ?? [];
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i];
    if (stage.status !== "COMPLETED" && stage.status !== "SKIPPED") {
      return stage.type;
    }
  }
  return checkpoint.lastProcessedStage;
}

function hasExecutableStage(checkpoint: TrackingCheckpoint): boolean {
  const stages = checkpoint.cachedData.completedStages ?? [];
  return stages.some((s) => s.status === "READY" || s.executable === true);
}

function isElectionProposal(checkpoint: TrackingCheckpoint): boolean {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  if (createdStage?.data) {
    const data = createdStage.data as { proposalType?: string };
    return data.proposalType === "ELECTION_NOMINEE" || data.proposalType === "ELECTION_MEMBER";
  }
  return false;
}

function getProposalType(checkpoint: TrackingCheckpoint): string | undefined {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  if (createdStage?.data) {
    const data = createdStage.data as { proposalType?: string };
    return data.proposalType;
  }
  return undefined;
}

function getCreationTimestamp(checkpoint: TrackingCheckpoint): number | null {
  const stages = checkpoint.cachedData.completedStages ?? [];

  // For governor proposals, use PROPOSAL_CREATED stage timing
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  if (createdStage?.timing?.startedAt) {
    return createdStage.timing.startedAt * 1000; // Convert seconds to milliseconds
  }

  // For timelock operations, use L2_TIMELOCK stage timing
  const l2TimelockStage = stages.find((s) => s.type === "L2_TIMELOCK");
  if (l2TimelockStage?.timing?.startedAt) {
    return l2TimelockStage.timing.startedAt * 1000;
  }

  // No timestamp available - don't fallback to cache time
  return null;
}

export function useProposals(
  data: CacheData | null,
  filter: FilterType
): { items: ProposalListItem[]; filteredCount: number; totalCount: number } {
  return useMemo(() => {
    if (!data) return { items: [], filteredCount: 0, totalCount: 0 };

    const items: ProposalListItem[] = [];

    for (const [key, checkpoint] of data.checkpoints) {
      if (checkpoint.input.type === "discovery") continue;

      // Skip entries with no tracked stages (incomplete tracking)
      const stages = checkpoint.cachedData.completedStages ?? [];
      if (stages.length === 0) continue;

      const isElection = isElectionProposal(checkpoint);
      const status = getProposalStatus(checkpoint);
      const completedCount = stages.filter(
        (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
      ).length;

      const item: ProposalListItem = {
        key,
        title: getProposalTitle(checkpoint),
        type: isElection
          ? "election"
          : checkpoint.input.type === "timelock"
            ? "timelock"
            : "governor",
        proposalType: getProposalType(checkpoint),
        status,
        stageProgress: `${completedCount}/7`,
        currentStage: getCurrentStageType(checkpoint),
        hasExecutable: hasExecutableStage(checkpoint),
        createdAt: getCreationTimestamp(checkpoint),
        checkpoint,
      };

      items.push(item);
    }

    // Sort by createdAt (newest first), null timestamps go to the end
    items.sort((a, b) => {
      if (a.createdAt === null && b.createdAt === null) return 0;
      if (a.createdAt === null) return 1;
      if (b.createdAt === null) return -1;
      return b.createdAt - a.createdAt;
    });

    const totalCount = items.length;

    const filtered = items.filter((item) => {
      switch (filter) {
        case "active":
          return item.status === "active";
        case "complete":
          return item.status === "complete";
        case "elections":
          return item.type === "election";
        case "timelocks":
          return item.type === "timelock";
        default:
          return true;
      }
    });

    return { items: filtered, filteredCount: filtered.length, totalCount };
  }, [data, filter]);
}
