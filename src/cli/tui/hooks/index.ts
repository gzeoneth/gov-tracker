export { useCache } from "./useCache.js";
export type { UseCacheResult } from "./useCache.js";

export { useProposals } from "./useProposals.js";

export { useNavigation, MAX_STAGE_INDEX, STAGE_COUNT } from "./useNavigation.js";
export type { UseNavigationResult } from "./useNavigation.js";

export { useTracker } from "./useTracker.js";
export type { UseTrackerResult, UseTrackerOptions } from "./useTracker.js";

export { useStageCalldata } from "./useStageCalldata.js";
export type { UseStageCalldataResult, DecodedAction } from "./useStageCalldata.js";

export { useCliProcess } from "./useCliProcess.js";
export type { UseCliProcessResult, CliProcessResult } from "./useCliProcess.js";

export { useElectionData } from "./useElectionData.js";
export type { ElectionData } from "./useElectionData.js";

export { useElectionDetails } from "./useElectionDetails.js";
export type { ElectionDetails, UseElectionDetailsResult } from "./useElectionDetails.js";

// New unified store
export {
  useGovTrackerStore,
  useProposalListState,
  useProposalDetailState,
  useElectionViewState,
  useNavigationActions,
  actions,
  MAX_STAGE_INDEX as STORE_MAX_STAGE_INDEX,
  STAGE_COUNT as STORE_STAGE_COUNT,
  PAGE_SIZE,
} from "./useGovTrackerStore.js";
export type {
  GovTrackerState,
  GovTrackerAction,
  GovTrackerStore,
  Dispatch,
  CacheState,
  CliProcessState,
  ElectionDataState,
  ElectionDetailsState,
  CalldataState,
  TrackerState,
  ProposalListState,
  ProposalDetailState,
  ElectionViewState,
  NavigationActions,
  DecodedAction as StoreDecodedAction,
} from "./useGovTrackerStore.js";
