/**
 * TUI-specific types
 */

import type { TrackingCheckpoint, TrackerStats, StageType } from "../../types/index.js";

export type ViewType =
  | "list"
  | "detail"
  | "calldata"
  | "stage"
  | "simulation"
  | "description"
  | "election"
  | "help"
  | "settings";

export type FilterType = "all" | "active" | "complete" | "timelocks";

export type SortType = "newest" | "oldest" | "progress" | "status";

export interface ProposalListItem {
  key: string;
  title: string;
  type: "governor" | "timelock" | "election";
  proposalType?: string;
  status: "active" | "complete" | "failed";
  stageProgress: string;
  currentStage: StageType | null;
  hasExecutable: boolean;
  createdAt: number | null;
  checkpoint: TrackingCheckpoint;
}

export interface NavigationState {
  view: ViewType;
  previousView: ViewType | null;
  filter: FilterType;
  sort: SortType;
  selectedIndex: number;
  selectedProposal: ProposalListItem | null;
  selectedStageIndex: number;
  calldataActionIndex: number;
  scrollOffset: number;
  searchQuery: string;
  isSearching: boolean;
}

export interface CacheData {
  checkpoints: Map<string, TrackingCheckpoint>;
  elections: Map<number, TrackingCheckpoint>;
  stats: TrackerStats;
}
