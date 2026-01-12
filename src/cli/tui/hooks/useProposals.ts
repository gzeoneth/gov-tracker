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

function getAllStages(checkpoint: TrackingCheckpoint): TrackedStage[] {
  return checkpoint.cachedData.completedStages ?? [];
}

function findStageByType(stages: TrackedStage[], type: StageType): TrackedStage | undefined {
  return stages.find((s) => s.type === type);
}

function getCreatedData(stages: TrackedStage[]): ProposalCreatedData | undefined {
  return findStageByType(stages, "PROPOSAL_CREATED")?.data as ProposalCreatedData | undefined;
}

function getCreationTimestamp(stages: TrackedStage[]): number | null {
  const createdStage = findStageByType(stages, "PROPOSAL_CREATED");
  if (createdStage?.timing?.startedAt) {
    return createdStage.timing.startedAt * 1000;
  }
  const l2TimelockStage = findStageByType(stages, "L2_TIMELOCK");
  if (l2TimelockStage?.timing?.startedAt) {
    return l2TimelockStage.timing.startedAt * 1000;
  }
  return null;
}

function hasExecutableStage(stages: TrackedStage[]): boolean {
  return stages.some((s) => s.status === "READY" || s.executable === true);
}

function isElectionProposal(stages: TrackedStage[]): boolean {
  const proposalType = getCreatedData(stages)?.proposalType;
  return proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";
}

function countCompletedStages(stages: TrackedStage[]): number {
  return stages.filter((s) => s.status === "COMPLETED" || s.status === "SKIPPED").length;
}

function extractMarkdownTitle(description: string | undefined | null): string | null {
  if (!description) return null;
  const lines = description.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const title = trimmed.replace(/^#+\s*/, "").trim();
      return title || null;
    }
  }
  return null;
}

function getProposalTitle(checkpoint: TrackingCheckpoint): string {
  const data = getCreatedData(getAllStages(checkpoint));
  if (data?.description) {
    const mdTitle = extractMarkdownTitle(data.description);
    if (mdTitle) return mdTitle;

    const firstLine = data.description
      .split("\n")
      .find((l) => l.trim())
      ?.trim();
    if (firstLine) return firstLine;
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
  const stages = getAllStages(checkpoint);

  const votingStage = findStageByType(stages, "VOTING_ACTIVE");
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
  const stages = getAllStages(checkpoint);
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status !== "COMPLETED" && stages[i].status !== "SKIPPED") {
      return stages[i].type;
    }
  }
  return checkpoint.lastProcessedStage;
}

function getItemType(
  checkpoint: TrackingCheckpoint,
  stages: TrackedStage[]
): ProposalListItem["type"] {
  if (isElectionProposal(stages)) return "election";
  if (checkpoint.input.type === "timelock") return "timelock";
  return "governor";
}

const filterPredicates: Record<FilterType, (item: ProposalListItem) => boolean> = {
  all: () => true,
  active: (item) => item.status === "active",
  complete: (item) => item.status === "complete",
  timelocks: (item) => item.type === "timelock",
};

function matchesFilter(item: ProposalListItem, filter: FilterType): boolean {
  if (item.type === "election") return false;
  return filterPredicates[filter](item);
}

const STATUS_ORDER: Record<string, number> = { active: 0, complete: 1, failed: 2 };

function parseProgressNumber(progress: string): number {
  const match = progress.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

type SortComparator = (a: ProposalListItem, b: ProposalListItem) => number;

function nullSafeCompare(aVal: number | null, bVal: number | null, ascending: boolean): number {
  if (aVal === null && bVal === null) return 0;
  if (aVal === null) return 1;
  if (bVal === null) return -1;
  return ascending ? aVal - bVal : bVal - aVal;
}

const sortComparators: Record<SortType, SortComparator> = {
  newest: (a, b) => nullSafeCompare(a.createdAt, b.createdAt, false),
  oldest: (a, b) => nullSafeCompare(a.createdAt, b.createdAt, true),
  progress: (a, b) => parseProgressNumber(b.stageProgress) - parseProgressNumber(a.stageProgress),
  status: (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3),
};

function sortItems(items: ProposalListItem[], sort: SortType): ProposalListItem[] {
  return [...items].sort(sortComparators[sort]);
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

      const stages = getAllStages(checkpoint);

      if (stages.length === 0) {
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
          status: "active",
          stageProgress: "0/7",
          currentStage: null,
          hasExecutable: false,
          createdAt: checkpoint.createdAt,
          checkpoint,
        });
        continue;
      }

      items.push({
        key,
        title: getProposalTitle(checkpoint),
        type: getItemType(checkpoint, stages),
        proposalType: getCreatedData(stages)?.proposalType,
        status: getProposalStatus(checkpoint),
        stageProgress: `${countCompletedStages(stages)}/7`,
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
