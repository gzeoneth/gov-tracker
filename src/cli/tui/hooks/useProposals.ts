/**
 * Transform cache checkpoints into displayable proposal list
 */

import { useMemo } from "react";
import type { TrackingCheckpoint, StageType, TrackedStage } from "../../../types/index.js";
import type { ProposalListItem, FilterType, CacheData } from "../types.js";

interface ProposalCreatedData {
  description?: string;
  proposalType?: string;
}

interface VotingData {
  proposalState?: string;
}

function getStages(checkpoint: TrackingCheckpoint): TrackedStage[] {
  return checkpoint.cachedData.completedStages ?? [];
}

function getCreatedStage(stages: TrackedStage[]): TrackedStage | undefined {
  return stages.find((s) => s.type === "PROPOSAL_CREATED");
}

function getCreatedData(stages: TrackedStage[]): ProposalCreatedData | undefined {
  return getCreatedStage(stages)?.data as ProposalCreatedData | undefined;
}

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + "...";
}

function getProposalTitle(checkpoint: TrackingCheckpoint): string {
  const data = getCreatedData(getStages(checkpoint));
  if (data?.description) {
    return truncate(data.description.split("\n")[0], 60);
  }
  if (checkpoint.input.type === "governor") {
    return `Proposal ${checkpoint.input.proposalId.slice(0, 12)}...`;
  }
  if (checkpoint.input.type === "timelock") {
    return `Timelock Op ${checkpoint.input.operationId.slice(0, 12)}...`;
  }
  return "Unknown";
}

function getProposalStatus(checkpoint: TrackingCheckpoint): "active" | "complete" | "failed" {
  const stages = getStages(checkpoint);

  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  const votingData = votingStage?.data as VotingData | undefined;
  if (votingData?.proposalState === "Defeated" || votingData?.proposalState === "Canceled") {
    return "failed";
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
  const stages = getStages(checkpoint);
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status !== "COMPLETED" && stages[i].status !== "SKIPPED") {
      return stages[i].type;
    }
  }
  return checkpoint.lastProcessedStage;
}

function hasExecutableStage(stages: TrackedStage[]): boolean {
  return stages.some((s) => s.status === "READY" || s.executable === true);
}

function isElectionProposal(stages: TrackedStage[]): boolean {
  const proposalType = getCreatedData(stages)?.proposalType;
  return proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";
}

function getCreationTimestamp(stages: TrackedStage[]): number | null {
  const createdStage = getCreatedStage(stages);
  if (createdStage?.timing?.startedAt) {
    return createdStage.timing.startedAt * 1000;
  }
  const l2TimelockStage = stages.find((s) => s.type === "L2_TIMELOCK");
  if (l2TimelockStage?.timing?.startedAt) {
    return l2TimelockStage.timing.startedAt * 1000;
  }
  return null;
}

function getItemType(
  checkpoint: TrackingCheckpoint,
  stages: TrackedStage[]
): ProposalListItem["type"] {
  if (isElectionProposal(stages)) return "election";
  if (checkpoint.input.type === "timelock") return "timelock";
  return "governor";
}

function matchesFilter(item: ProposalListItem, filter: FilterType): boolean {
  if (filter === "all") return true;
  if (filter === "active") return item.status === "active";
  if (filter === "complete") return item.status === "complete";
  if (filter === "elections") return item.type === "election";
  if (filter === "timelocks") return item.type === "timelock";
  return true;
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

      const stages = getStages(checkpoint);
      if (stages.length === 0) continue;

      const completedCount = stages.filter(
        (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
      ).length;

      items.push({
        key,
        title: getProposalTitle(checkpoint),
        type: getItemType(checkpoint, stages),
        proposalType: getCreatedData(stages)?.proposalType,
        status: getProposalStatus(checkpoint),
        stageProgress: `${completedCount}/7`,
        currentStage: getCurrentStageType(checkpoint),
        hasExecutable: hasExecutableStage(stages),
        createdAt: getCreationTimestamp(stages),
        checkpoint,
      });
    }

    items.sort((a, b) => {
      if (a.createdAt === null && b.createdAt === null) return 0;
      if (a.createdAt === null) return 1;
      if (b.createdAt === null) return -1;
      return b.createdAt - a.createdAt;
    });

    const filtered = items.filter((item) => matchesFilter(item, filter));
    return { items: filtered, filteredCount: filtered.length, totalCount: items.length };
  }, [data, filter]);
}
