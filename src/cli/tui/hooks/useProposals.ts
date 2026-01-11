/**
 * Transform cache checkpoints into displayable proposal list
 */

import { useMemo } from "react";
import type { TrackingCheckpoint, StageType, TrackedStage } from "../../../types/index.js";
import type { ProposalListItem, FilterType, SortType, CacheData } from "../types.js";
import { isElectionGovernor } from "../../../constants.js";

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

function extractMarkdownTitle(description: string | undefined | null): string | null {
  if (!description) return null;
  const lines = description.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const title = trimmed.replace(/^#+\s*/, "").trim();
      // Return null if empty so fallback logic continues
      return title || null;
    }
  }
  return null;
}

function getProposalTitle(checkpoint: TrackingCheckpoint): string {
  const data = getCreatedData(getStages(checkpoint));
  if (data?.description) {
    const mdTitle = extractMarkdownTitle(data.description);
    if (mdTitle) {
      return mdTitle;
    }
    const firstLine = data.description
      .split("\n")
      .find((l) => l.trim())
      ?.trim();
    if (firstLine) {
      return firstLine;
    }
  }
  if (checkpoint.input.type === "governor") {
    return `Proposal ${checkpoint.input.proposalId}`;
  }
  if (checkpoint.input.type === "timelock") {
    return `Timelock Op ${checkpoint.input.operationId}`;
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
  // Elections have their own view (press 'e'), exclude from main list
  if (item.type === "election") return false;

  switch (filter) {
    case "all":
      return true;
    case "active":
      return item.status === "active";
    case "complete":
      return item.status === "complete";
    case "timelocks":
      return item.type === "timelock";
    default:
      return true;
  }
}

function getProgressNumber(progress: string): number {
  const match = progress.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function compareByDate(aDate: number | null, bDate: number | null, ascending: boolean): number {
  if (aDate === null && bDate === null) return 0;
  if (aDate === null) return 1;
  if (bDate === null) return -1;
  return ascending ? aDate - bDate : bDate - aDate;
}

function sortItems(items: ProposalListItem[], sort: SortType): ProposalListItem[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case "newest":
        return compareByDate(a.createdAt, b.createdAt, false);

      case "oldest":
        return compareByDate(a.createdAt, b.createdAt, true);

      case "progress":
        return getProgressNumber(b.stageProgress) - getProgressNumber(a.stageProgress);

      case "status": {
        const statusOrder: Record<string, number> = { active: 0, complete: 1, failed: 2 };
        return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      }

      default:
        return 0;
    }
  });
}

export function useProposals(
  data: CacheData | null,
  filter: FilterType,
  searchQuery = "",
  sort: SortType = "newest"
): { items: ProposalListItem[]; filteredCount: number; totalCount: number } {
  return useMemo(() => {
    if (!data) return { items: [], filteredCount: 0, totalCount: 0 };

    const items: ProposalListItem[] = [];

    for (const [key, checkpoint] of data.checkpoints) {
      if (checkpoint.input.type === "discovery") continue;

      const stages = getStages(checkpoint);

      // Handle proposals with no stages yet (discovered but not tracked)
      if (stages.length === 0) {
        // Skip untracked election proposals - they belong in the Elections view
        if (
          checkpoint.input.type === "governor" &&
          isElectionGovernor(checkpoint.input.governorAddress)
        ) {
          continue;
        }

        let title: string;
        if (checkpoint.input.type === "governor") {
          title = `Proposal ${checkpoint.input.proposalId.slice(0, 8)}...`;
        } else if (checkpoint.input.type === "timelock") {
          title = `Timelock ${checkpoint.input.operationId.slice(0, 10)}...`;
        } else {
          title = "Unknown";
        }

        items.push({
          key,
          title,
          type: checkpoint.input.type === "timelock" ? "timelock" : "governor",
          proposalType: undefined,
          status: "active", // Needs tracking
          stageProgress: "0/7",
          currentStage: null,
          hasExecutable: false,
          createdAt: checkpoint.createdAt,
          checkpoint,
        });
        continue;
      }

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

    const sorted = sortItems(items, sort);

    const lowerSearch = searchQuery.toLowerCase();
    const filtered = sorted.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (lowerSearch) {
        const matchesTitle = item.title.toLowerCase().includes(lowerSearch);
        const matchesKey = item.key.toLowerCase().includes(lowerSearch);
        if (!matchesTitle && !matchesKey) return false;
      }
      return true;
    });
    return { items: filtered, filteredCount: filtered.length, totalCount: items.length };
  }, [data, filter, searchQuery, sort]);
}
