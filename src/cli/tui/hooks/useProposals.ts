/**
 * Transform cache checkpoints into displayable proposal list
 */

import { useMemo } from "react";
import type { TrackingCheckpoint, StageType } from "../../../types/index.js";
import type { ProposalListItem, FilterType, SortType, CacheData } from "../types.js";
import { isElectionGovernor } from "../../../constants.js";

type ProposalCreatedData = { description?: string; proposalType?: string };
type VotingData = { proposalState?: string };

function extractMarkdownTitle(description: string | undefined): string | null {
  if (!description) return null;
  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || null;
    }
  }
  return null;
}

function getProposalInfo(checkpoint: TrackingCheckpoint) {
  const stages = checkpoint.cachedData.completedStages ?? [];
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  const createdData = createdStage?.data as ProposalCreatedData | undefined;
  const votingData = votingStage?.data as VotingData | undefined;

  const createdAt = createdStage?.timing?.startedAt
    ? createdStage.timing.startedAt * 1000
    : stages.find((s) => s.type === "L2_TIMELOCK")?.timing?.startedAt
      ? stages.find((s) => s.type === "L2_TIMELOCK")!.timing!.startedAt! * 1000
      : null;

  let title = "Unknown";
  if (createdData?.description) {
    const mdTitle = extractMarkdownTitle(createdData.description);
    const firstLine = createdData.description
      .split("\n")
      .find((l) => l.trim())
      ?.trim();
    title = mdTitle ?? firstLine ?? title;
  } else if (checkpoint.input.type === "governor") {
    title = `Proposal ${checkpoint.input.proposalId}`;
  } else if (checkpoint.input.type === "timelock") {
    title = `Timelock Op ${checkpoint.input.operationId}`;
  }

  const proposalType = createdData?.proposalType;
  const isElection = proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";
  const completedCount = stages.filter(
    (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
  ).length;
  const hasExecutable = stages.some((s) => s.status === "READY" || s.executable === true);

  let status: "active" | "complete" | "failed" = "active";
  if (votingData?.proposalState === "Defeated" || votingData?.proposalState === "Canceled") {
    status = "failed";
  } else if (
    stages.length === 7 &&
    (stages[6]?.status === "COMPLETED" || stages[6]?.status === "SKIPPED")
  ) {
    status = "complete";
  } else if ((checkpoint.metadata?.errorCount ?? 0) >= 5) {
    status = "failed";
  }

  let currentStage: StageType | null = checkpoint.lastProcessedStage;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status !== "COMPLETED" && stages[i].status !== "SKIPPED") {
      currentStage = stages[i].type;
      break;
    }
  }

  const itemType: ProposalListItem["type"] = isElection
    ? "election"
    : checkpoint.input.type === "timelock"
      ? "timelock"
      : "governor";

  return {
    stages,
    title,
    proposalType,
    status,
    completedCount,
    hasExecutable,
    currentStage,
    createdAt,
    itemType,
  };
}

const FILTER_FN: Record<FilterType, (item: ProposalListItem) => boolean> = {
  all: () => true,
  active: (i) => i.status === "active",
  complete: (i) => i.status === "complete",
  timelocks: (i) => i.type === "timelock",
};

const STATUS_ORDER: Record<string, number> = { active: 0, complete: 1, failed: 2 };
const parseProgress = (p: string) => parseInt(p.match(/^(\d+)/)?.[1] ?? "0", 10);

const SORT_FN: Record<SortType, (a: ProposalListItem, b: ProposalListItem) => number> = {
  newest: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  oldest: (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
  progress: (a, b) => parseProgress(b.stageProgress) - parseProgress(a.stageProgress),
  status: (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3),
};

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
      if (checkpoint.input.type === "discovery" || checkpoint.input.type === "election") continue;

      const info = getProposalInfo(checkpoint);

      if (info.stages.length === 0) {
        if (
          checkpoint.input.type === "governor" &&
          isElectionGovernor(checkpoint.input.governorAddress)
        )
          continue;

        const title =
          checkpoint.input.type === "governor"
            ? `Proposal ${checkpoint.input.proposalId.slice(0, 8)}...`
            : checkpoint.input.type === "timelock"
              ? `Timelock ${checkpoint.input.operationId.slice(0, 10)}...`
              : "Unknown";

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
        title: info.title,
        type: info.itemType,
        proposalType: info.proposalType,
        status: info.status,
        stageProgress: `${info.completedCount}/7`,
        currentStage: info.currentStage,
        hasExecutable: info.hasExecutable,
        createdAt: info.createdAt,
        checkpoint,
      });
    }

    const sorted = [...items].sort(SORT_FN[sort]);
    const lowerSearch = searchQuery.toLowerCase();

    const filtered = sorted.filter((item) => {
      if (item.type === "election") return false;
      if (!FILTER_FN[filter](item)) return false;
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
