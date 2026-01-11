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
  | "election";

export type FilterType = "all" | "active" | "complete" | "timelocks";

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
  filter: FilterType;
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
  stats: TrackerStats;
}
