/**
 * Unified state machine for TUI using React's useReducer pattern.
 *
 * Consolidates state from:
 * - useCache (cache data loading)
 * - useCliProcess (CLI subprocess management)
 * - useElectionData (election data from cache)
 * - useElectionDetails (detailed election info via RPC)
 * - useNavigation (view and navigation state)
 * - useProposals (derived proposal list - kept as selector)
 * - useStageCalldata (decoded calldata)
 * - useTracker (live tracking operations)
 */

import { useReducer, useMemo } from "react";
import type {
  TrackingResult,
  PreparedTransaction,
  ElectionStatus,
  ElectionProposalStatus,
  NomineeElectionDetails,
  MemberElectionDetails,
} from "../../../types/index.js";
import type { DecodedCalldata } from "../../../types/calldata.js";
import type {
  ViewType,
  FilterType,
  SortType,
  NavigationState,
  CacheData,
  ProposalListItem,
} from "../types.js";

// ============================================================================
// State Types
// ============================================================================

export interface CacheState {
  data: CacheData | null;
  loading: boolean;
  error: string | null;
}

export interface CliProcessState {
  isRunning: boolean;
  progress: string | null;
  error: string | null;
}

export interface ElectionDataState {
  status: ElectionStatus | null;
  proposals: ElectionProposalStatus[];
  loading: boolean;
  error: string | null;
  warning: string | null;
}

export interface ElectionDetailsState {
  currentIndex: number | null;
  nomineeDetails: NomineeElectionDetails | null;
  memberDetails: MemberElectionDetails | null;
  loading: boolean;
  error: string | null;
}

export interface DecodedAction {
  target: string;
  value: string;
  decoded: DecodedCalldata;
}

export interface CalldataState {
  actions: DecodedAction[];
  loading: boolean;
  error: string | null;
}

export interface TrackerState {
  isTracking: boolean;
  progress: string | null;
  lastResult: TrackingResult | null;
  preparedTxs: PreparedTransaction[];
  error: string | null;
}

export interface GovTrackerState {
  cache: CacheState;
  cliProcess: CliProcessState;
  electionData: ElectionDataState;
  electionDetails: ElectionDetailsState;
  navigation: NavigationState;
  calldata: CalldataState;
  tracker: TrackerState;
}

// ============================================================================
// Initial State
// ============================================================================

const INITIAL_NAVIGATION_STATE: NavigationState = {
  view: "list",
  previousView: null,
  filter: "all",
  sort: "newest",
  selectedIndex: 0,
  selectedProposal: null,
  selectedStageIndex: 0,
  calldataActionIndex: 0,
  scrollOffset: 0,
  searchQuery: "",
  isSearching: false,
};

const INITIAL_STATE: GovTrackerState = {
  cache: {
    data: null,
    loading: true,
    error: null,
  },
  cliProcess: {
    isRunning: false,
    progress: null,
    error: null,
  },
  electionData: {
    status: null,
    proposals: [],
    loading: true,
    error: null,
    warning: null,
  },
  electionDetails: {
    currentIndex: null,
    nomineeDetails: null,
    memberDetails: null,
    loading: false,
    error: null,
  },
  navigation: INITIAL_NAVIGATION_STATE,
  calldata: {
    actions: [],
    loading: false,
    error: null,
  },
  tracker: {
    isTracking: false,
    progress: null,
    lastResult: null,
    preparedTxs: [],
    error: null,
  },
};

// ============================================================================
// Action Types
// ============================================================================

export type GovTrackerAction =
  // Cache actions
  | { type: "CACHE_LOAD_START" }
  | { type: "CACHE_LOAD_SUCCESS"; payload: CacheData }
  | { type: "CACHE_LOAD_ERROR"; payload: string }
  // CLI Process actions
  | { type: "CLI_PROCESS_START" }
  | { type: "CLI_PROCESS_PROGRESS"; payload: string }
  | { type: "CLI_PROCESS_SUCCESS" }
  | { type: "CLI_PROCESS_ERROR"; payload: string }
  | { type: "CLI_PROCESS_RESET" }
  // Election data actions
  | { type: "ELECTION_DATA_LOAD_START" }
  | {
      type: "ELECTION_DATA_LOAD_SUCCESS";
      payload: { status: ElectionStatus | null; proposals: ElectionProposalStatus[] };
    }
  | { type: "ELECTION_DATA_LOAD_ERROR"; payload: string }
  | { type: "ELECTION_DATA_SET_WARNING"; payload: string | null }
  // Election details actions
  | { type: "ELECTION_DETAILS_LOAD_START"; payload: number }
  | {
      type: "ELECTION_DETAILS_LOAD_SUCCESS";
      payload: {
        nomineeDetails: NomineeElectionDetails | null;
        memberDetails: MemberElectionDetails | null;
      };
    }
  | { type: "ELECTION_DETAILS_LOAD_ERROR"; payload: string }
  | { type: "ELECTION_DETAILS_CLEAR" }
  // Navigation actions
  | { type: "NAV_SET_FILTER"; payload: FilterType }
  | { type: "NAV_CYCLE_FILTER" }
  | { type: "NAV_CYCLE_SORT" }
  | { type: "NAV_SELECT_ITEM"; payload: number }
  | { type: "NAV_MOVE"; payload: { delta: number; maxIndex: number } }
  | { type: "NAV_GO_TO"; payload: { position: "top" | "bottom"; maxIndex: number } }
  | { type: "NAV_ENTER"; payload: { items: ProposalListItem[] } }
  | { type: "NAV_BACK" }
  | { type: "NAV_GO_TO_VIEW"; payload: ViewType }
  | { type: "NAV_GO_TO_STAGE"; payload: number }
  | { type: "NAV_GO_TO_OVERLAY"; payload: "help" | "settings" }
  | { type: "NAV_NAVIGATE_ACTION"; payload: { delta: number; maxIndex: number } }
  | { type: "NAV_SET_SCROLL_OFFSET"; payload: number }
  | { type: "NAV_RESET" }
  | { type: "NAV_START_SEARCH" }
  | { type: "NAV_FINISH_SEARCH" }
  | { type: "NAV_CLEAR_SEARCH" }
  | { type: "NAV_SET_SEARCH_QUERY"; payload: string }
  | { type: "NAV_APPEND_SEARCH_CHAR"; payload: string }
  | { type: "NAV_DELETE_SEARCH_CHAR" }
  // Calldata actions
  | { type: "CALLDATA_LOAD_START" }
  | { type: "CALLDATA_LOAD_SUCCESS"; payload: DecodedAction[] }
  | { type: "CALLDATA_LOAD_ERROR"; payload: string }
  | { type: "CALLDATA_RESET" }
  // Tracker actions
  | { type: "TRACKER_START" }
  | { type: "TRACKER_PROGRESS"; payload: string }
  | {
      type: "TRACKER_SUCCESS";
      payload: { result: TrackingResult | null; preparedTxs: PreparedTransaction[] };
    }
  | { type: "TRACKER_ERROR"; payload: string }
  | { type: "TRACKER_RESET" }
  | { type: "TRACKER_CLEAR_ERROR" };

// ============================================================================
// Reducer Helpers
// ============================================================================

export const MAX_STAGE_INDEX = 6;
const FILTER_ORDER: FilterType[] = ["all", "active", "complete", "timelocks"];
const SORT_ORDER: SortType[] = ["newest", "oldest", "progress", "status"];
const PAGE_SIZE = 10;
const SCROLLABLE_VIEWS: ViewType[] = ["calldata", "stage", "description"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cycleArray<T>(array: T[], current: T): T {
  const nextIndex = (array.indexOf(current) + 1) % array.length;
  return array[nextIndex];
}

function isScrollableView(view: ViewType): boolean {
  return SCROLLABLE_VIEWS.includes(view);
}

type NavigableField = "selectedIndex" | "selectedStageIndex" | "scrollOffset";

function getNavigableField(view: ViewType): NavigableField | null {
  if (view === "list") return "selectedIndex";
  if (view === "detail") return "selectedStageIndex";
  if (isScrollableView(view)) return "scrollOffset";
  return null;
}

function getMaxForField(field: NavigableField, maxIndex: number): number {
  if (field === "selectedStageIndex") return MAX_STAGE_INDEX;
  return maxIndex <= 0 ? 0 : maxIndex - 1;
}

// ============================================================================
// Reducer
// ============================================================================

function govTrackerReducer(state: GovTrackerState, action: GovTrackerAction): GovTrackerState {
  switch (action.type) {
    // Cache actions
    case "CACHE_LOAD_START":
      return {
        ...state,
        cache: { ...state.cache, loading: true, error: null },
      };

    case "CACHE_LOAD_SUCCESS":
      return {
        ...state,
        cache: { data: action.payload, loading: false, error: null },
      };

    case "CACHE_LOAD_ERROR":
      return {
        ...state,
        cache: { ...state.cache, loading: false, error: action.payload },
      };

    // CLI Process actions
    case "CLI_PROCESS_START":
      return {
        ...state,
        cliProcess: { isRunning: true, progress: "Starting CLI...", error: null },
      };

    case "CLI_PROCESS_PROGRESS":
      return {
        ...state,
        cliProcess: { ...state.cliProcess, progress: action.payload },
      };

    case "CLI_PROCESS_SUCCESS":
      return {
        ...state,
        cliProcess: { isRunning: false, progress: null, error: null },
      };

    case "CLI_PROCESS_ERROR":
      return {
        ...state,
        cliProcess: { isRunning: false, progress: null, error: action.payload },
      };

    case "CLI_PROCESS_RESET":
      return {
        ...state,
        cliProcess: { isRunning: false, progress: null, error: null },
      };

    // Election data actions
    case "ELECTION_DATA_LOAD_START":
      return {
        ...state,
        electionData: { ...state.electionData, loading: true, error: null },
      };

    case "ELECTION_DATA_LOAD_SUCCESS":
      return {
        ...state,
        electionData: {
          status: action.payload.status,
          proposals: action.payload.proposals,
          loading: false,
          error: null,
          warning: null,
        },
      };

    case "ELECTION_DATA_LOAD_ERROR":
      return {
        ...state,
        electionData: {
          status: null,
          proposals: [],
          loading: false,
          error: action.payload,
          warning: null,
        },
      };

    case "ELECTION_DATA_SET_WARNING":
      return {
        ...state,
        electionData: { ...state.electionData, warning: action.payload },
      };

    // Election details actions
    case "ELECTION_DETAILS_LOAD_START":
      return {
        ...state,
        electionDetails: {
          currentIndex: action.payload,
          nomineeDetails: null,
          memberDetails: null,
          loading: true,
          error: null,
        },
      };

    case "ELECTION_DETAILS_LOAD_SUCCESS":
      return {
        ...state,
        electionDetails: {
          ...state.electionDetails,
          nomineeDetails: action.payload.nomineeDetails,
          memberDetails: action.payload.memberDetails,
          loading: false,
          error: null,
        },
      };

    case "ELECTION_DETAILS_LOAD_ERROR":
      return {
        ...state,
        electionDetails: {
          ...state.electionDetails,
          loading: false,
          error: action.payload,
        },
      };

    case "ELECTION_DETAILS_CLEAR":
      return {
        ...state,
        electionDetails: {
          currentIndex: null,
          nomineeDetails: null,
          memberDetails: null,
          loading: false,
          error: null,
        },
      };

    // Navigation actions
    case "NAV_SET_FILTER":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          filter: action.payload,
          selectedIndex: 0,
          scrollOffset: 0,
        },
      };

    case "NAV_CYCLE_FILTER":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          filter: cycleArray(FILTER_ORDER, state.navigation.filter),
          selectedIndex: 0,
          scrollOffset: 0,
        },
      };

    case "NAV_CYCLE_SORT":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          sort: cycleArray(SORT_ORDER, state.navigation.sort),
          selectedIndex: 0,
          scrollOffset: 0,
        },
      };

    case "NAV_SELECT_ITEM":
      return {
        ...state,
        navigation: { ...state.navigation, selectedIndex: action.payload },
      };

    case "NAV_MOVE": {
      const { delta, maxIndex } = action.payload;
      const field = getNavigableField(state.navigation.view);
      if (!field) return state;
      const max = getMaxForField(field, maxIndex);
      const newValue = clamp(state.navigation[field] + delta, 0, max);
      return {
        ...state,
        navigation: { ...state.navigation, [field]: newValue },
      };
    }

    case "NAV_GO_TO": {
      const { position, maxIndex } = action.payload;
      const field = getNavigableField(state.navigation.view);
      if (!field) return state;
      const max = getMaxForField(field, maxIndex);
      return {
        ...state,
        navigation: { ...state.navigation, [field]: position === "top" ? 0 : max },
      };
    }

    case "NAV_ENTER": {
      const { items } = action.payload;
      const nav = state.navigation;
      if (nav.view === "list" && items[nav.selectedIndex]) {
        return {
          ...state,
          navigation: {
            ...nav,
            view: "detail",
            selectedProposal: items[nav.selectedIndex],
            selectedStageIndex: 0,
          },
        };
      }
      if (nav.view === "detail") {
        return {
          ...state,
          navigation: { ...nav, view: "stage", scrollOffset: 0 },
        };
      }
      return state;
    }

    case "NAV_BACK": {
      const nav = state.navigation;
      if ((nav.view === "help" || nav.view === "settings") && nav.previousView) {
        return {
          ...state,
          navigation: { ...nav, view: nav.previousView, previousView: null },
        };
      }
      if (nav.view === "detail" || nav.view === "election") {
        return {
          ...state,
          navigation: {
            ...nav,
            view: "list",
            selectedProposal: null,
            selectedStageIndex: 0,
          },
        };
      }
      if (isScrollableView(nav.view) || nav.view === "simulation") {
        return {
          ...state,
          navigation: {
            ...nav,
            view: "detail",
            scrollOffset: 0,
            calldataActionIndex: 0,
          },
        };
      }
      return state;
    }

    case "NAV_GO_TO_VIEW": {
      const nav = state.navigation;
      if (nav.view !== "detail" && nav.view !== "list") return state;
      return {
        ...state,
        navigation: {
          ...nav,
          view: action.payload,
          scrollOffset: 0,
          calldataActionIndex: 0,
          isSearching: false,
        },
      };
    }

    case "NAV_GO_TO_STAGE":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          view: "stage",
          selectedStageIndex: clamp(action.payload, 0, MAX_STAGE_INDEX),
          scrollOffset: 0,
        },
      };

    case "NAV_GO_TO_OVERLAY":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          view: action.payload,
          previousView: state.navigation.view,
        },
      };

    case "NAV_NAVIGATE_ACTION": {
      const { delta, maxIndex } = action.payload;
      const newIndex = clamp(
        state.navigation.calldataActionIndex + delta,
        0,
        Math.max(0, maxIndex - 1)
      );
      return {
        ...state,
        navigation: {
          ...state.navigation,
          calldataActionIndex: newIndex,
          scrollOffset: 0,
        },
      };
    }

    case "NAV_SET_SCROLL_OFFSET":
      return {
        ...state,
        navigation: { ...state.navigation, scrollOffset: action.payload },
      };

    case "NAV_RESET":
      return {
        ...state,
        navigation: INITIAL_NAVIGATION_STATE,
      };

    case "NAV_START_SEARCH":
      return {
        ...state,
        navigation: { ...state.navigation, isSearching: true, searchQuery: "" },
      };

    case "NAV_FINISH_SEARCH":
      return {
        ...state,
        navigation: { ...state.navigation, isSearching: false },
      };

    case "NAV_CLEAR_SEARCH":
      return {
        ...state,
        navigation: { ...state.navigation, isSearching: false, searchQuery: "" },
      };

    case "NAV_SET_SEARCH_QUERY":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          searchQuery: action.payload,
          selectedIndex: 0,
        },
      };

    case "NAV_APPEND_SEARCH_CHAR":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          searchQuery: state.navigation.searchQuery + action.payload,
          selectedIndex: 0,
        },
      };

    case "NAV_DELETE_SEARCH_CHAR":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          searchQuery: state.navigation.searchQuery.slice(0, -1),
          selectedIndex: 0,
        },
      };

    // Calldata actions
    case "CALLDATA_LOAD_START":
      return {
        ...state,
        calldata: { actions: [], loading: true, error: null },
      };

    case "CALLDATA_LOAD_SUCCESS":
      return {
        ...state,
        calldata: { actions: action.payload, loading: false, error: null },
      };

    case "CALLDATA_LOAD_ERROR":
      return {
        ...state,
        calldata: { actions: [], loading: false, error: action.payload },
      };

    case "CALLDATA_RESET":
      return {
        ...state,
        calldata: { actions: [], loading: false, error: null },
      };

    // Tracker actions
    case "TRACKER_START":
      return {
        ...state,
        tracker: {
          isTracking: true,
          progress: "Starting...",
          lastResult: null,
          preparedTxs: [],
          error: null,
        },
      };

    case "TRACKER_PROGRESS":
      return {
        ...state,
        tracker: { ...state.tracker, progress: action.payload },
      };

    case "TRACKER_SUCCESS":
      return {
        ...state,
        tracker: {
          isTracking: false,
          progress: null,
          lastResult: action.payload.result,
          preparedTxs: action.payload.preparedTxs,
          error: null,
        },
      };

    case "TRACKER_ERROR":
      return {
        ...state,
        tracker: {
          ...state.tracker,
          isTracking: false,
          progress: null,
          error: action.payload,
        },
      };

    case "TRACKER_RESET":
      return {
        ...state,
        tracker: {
          isTracking: false,
          progress: null,
          lastResult: null,
          preparedTxs: [],
          error: null,
        },
      };

    case "TRACKER_CLEAR_ERROR":
      return {
        ...state,
        tracker: { ...state.tracker, error: null },
      };

    default:
      return state;
  }
}

// ============================================================================
// Action Creators
// ============================================================================

export const actions = {
  // Cache
  cacheLoadStart: (): GovTrackerAction => ({ type: "CACHE_LOAD_START" }),
  cacheLoadSuccess: (data: CacheData): GovTrackerAction => ({
    type: "CACHE_LOAD_SUCCESS",
    payload: data,
  }),
  cacheLoadError: (error: string): GovTrackerAction => ({
    type: "CACHE_LOAD_ERROR",
    payload: error,
  }),

  // CLI Process
  cliProcessStart: (): GovTrackerAction => ({ type: "CLI_PROCESS_START" }),
  cliProcessProgress: (progress: string): GovTrackerAction => ({
    type: "CLI_PROCESS_PROGRESS",
    payload: progress,
  }),
  cliProcessSuccess: (): GovTrackerAction => ({ type: "CLI_PROCESS_SUCCESS" }),
  cliProcessError: (error: string): GovTrackerAction => ({
    type: "CLI_PROCESS_ERROR",
    payload: error,
  }),
  cliProcessReset: (): GovTrackerAction => ({ type: "CLI_PROCESS_RESET" }),

  // Election Data
  electionDataLoadStart: (): GovTrackerAction => ({ type: "ELECTION_DATA_LOAD_START" }),
  electionDataLoadSuccess: (
    status: ElectionStatus | null,
    proposals: ElectionProposalStatus[]
  ): GovTrackerAction => ({
    type: "ELECTION_DATA_LOAD_SUCCESS",
    payload: { status, proposals },
  }),
  electionDataLoadError: (error: string): GovTrackerAction => ({
    type: "ELECTION_DATA_LOAD_ERROR",
    payload: error,
  }),
  electionDataSetWarning: (warning: string | null): GovTrackerAction => ({
    type: "ELECTION_DATA_SET_WARNING",
    payload: warning,
  }),

  // Election Details
  electionDetailsLoadStart: (index: number): GovTrackerAction => ({
    type: "ELECTION_DETAILS_LOAD_START",
    payload: index,
  }),
  electionDetailsLoadSuccess: (
    nomineeDetails: NomineeElectionDetails | null,
    memberDetails: MemberElectionDetails | null
  ): GovTrackerAction => ({
    type: "ELECTION_DETAILS_LOAD_SUCCESS",
    payload: { nomineeDetails, memberDetails },
  }),
  electionDetailsLoadError: (error: string): GovTrackerAction => ({
    type: "ELECTION_DETAILS_LOAD_ERROR",
    payload: error,
  }),
  electionDetailsClear: (): GovTrackerAction => ({ type: "ELECTION_DETAILS_CLEAR" }),

  // Navigation
  navSetFilter: (filter: FilterType): GovTrackerAction => ({
    type: "NAV_SET_FILTER",
    payload: filter,
  }),
  navCycleFilter: (): GovTrackerAction => ({ type: "NAV_CYCLE_FILTER" }),
  navCycleSort: (): GovTrackerAction => ({ type: "NAV_CYCLE_SORT" }),
  navSelectItem: (index: number): GovTrackerAction => ({
    type: "NAV_SELECT_ITEM",
    payload: index,
  }),
  navMove: (delta: number, maxIndex: number): GovTrackerAction => ({
    type: "NAV_MOVE",
    payload: { delta, maxIndex },
  }),
  navGoTo: (position: "top" | "bottom", maxIndex: number): GovTrackerAction => ({
    type: "NAV_GO_TO",
    payload: { position, maxIndex },
  }),
  navEnter: (items: ProposalListItem[]): GovTrackerAction => ({
    type: "NAV_ENTER",
    payload: { items },
  }),
  navBack: (): GovTrackerAction => ({ type: "NAV_BACK" }),
  navGoToView: (view: ViewType): GovTrackerAction => ({
    type: "NAV_GO_TO_VIEW",
    payload: view,
  }),
  navGoToStage: (index: number): GovTrackerAction => ({
    type: "NAV_GO_TO_STAGE",
    payload: index,
  }),
  navGoToOverlay: (overlay: "help" | "settings"): GovTrackerAction => ({
    type: "NAV_GO_TO_OVERLAY",
    payload: overlay,
  }),
  navNavigateAction: (delta: number, maxIndex: number): GovTrackerAction => ({
    type: "NAV_NAVIGATE_ACTION",
    payload: { delta, maxIndex },
  }),
  navSetScrollOffset: (offset: number): GovTrackerAction => ({
    type: "NAV_SET_SCROLL_OFFSET",
    payload: offset,
  }),
  navReset: (): GovTrackerAction => ({ type: "NAV_RESET" }),
  navStartSearch: (): GovTrackerAction => ({ type: "NAV_START_SEARCH" }),
  navFinishSearch: (): GovTrackerAction => ({ type: "NAV_FINISH_SEARCH" }),
  navClearSearch: (): GovTrackerAction => ({ type: "NAV_CLEAR_SEARCH" }),
  navSetSearchQuery: (query: string): GovTrackerAction => ({
    type: "NAV_SET_SEARCH_QUERY",
    payload: query,
  }),
  navAppendSearchChar: (char: string): GovTrackerAction => ({
    type: "NAV_APPEND_SEARCH_CHAR",
    payload: char,
  }),
  navDeleteSearchChar: (): GovTrackerAction => ({ type: "NAV_DELETE_SEARCH_CHAR" }),

  // Calldata
  calldataLoadStart: (): GovTrackerAction => ({ type: "CALLDATA_LOAD_START" }),
  calldataLoadSuccess: (decodedActions: DecodedAction[]): GovTrackerAction => ({
    type: "CALLDATA_LOAD_SUCCESS",
    payload: decodedActions,
  }),
  calldataLoadError: (error: string): GovTrackerAction => ({
    type: "CALLDATA_LOAD_ERROR",
    payload: error,
  }),
  calldataReset: (): GovTrackerAction => ({ type: "CALLDATA_RESET" }),

  // Tracker
  trackerStart: (): GovTrackerAction => ({ type: "TRACKER_START" }),
  trackerProgress: (progress: string): GovTrackerAction => ({
    type: "TRACKER_PROGRESS",
    payload: progress,
  }),
  trackerSuccess: (
    result: TrackingResult | null,
    preparedTxs: PreparedTransaction[]
  ): GovTrackerAction => ({
    type: "TRACKER_SUCCESS",
    payload: { result, preparedTxs },
  }),
  trackerError: (error: string): GovTrackerAction => ({
    type: "TRACKER_ERROR",
    payload: error,
  }),
  trackerReset: (): GovTrackerAction => ({ type: "TRACKER_RESET" }),
  trackerClearError: (): GovTrackerAction => ({ type: "TRACKER_CLEAR_ERROR" }),
} as const;

// ============================================================================
// Store Hook
// ============================================================================

export type Dispatch = (action: GovTrackerAction) => void;

export interface GovTrackerStore {
  state: GovTrackerState;
  dispatch: Dispatch;
}

export function useGovTrackerStore(): GovTrackerStore {
  const [state, dispatch] = useReducer(govTrackerReducer, INITIAL_STATE);
  return { state, dispatch };
}

// ============================================================================
// Selector Hooks
// ============================================================================

export interface ProposalListState {
  view: ViewType;
  filter: FilterType;
  sort: SortType;
  selectedIndex: number;
  searchQuery: string;
  isSearching: boolean;
  scrollOffset: number;
  cacheData: CacheData | null;
  cacheLoading: boolean;
  cacheError: string | null;
  isTracking: boolean;
  trackingProgress: string | null;
  trackingError: string | null;
}

export function useProposalListState(store: GovTrackerStore): ProposalListState {
  const { state } = store;
  return useMemo(
    () => ({
      view: state.navigation.view,
      filter: state.navigation.filter,
      sort: state.navigation.sort,
      selectedIndex: state.navigation.selectedIndex,
      searchQuery: state.navigation.searchQuery,
      isSearching: state.navigation.isSearching,
      scrollOffset: state.navigation.scrollOffset,
      cacheData: state.cache.data,
      cacheLoading: state.cache.loading,
      cacheError: state.cache.error,
      isTracking: state.tracker.isTracking || state.cliProcess.isRunning,
      trackingProgress: state.cliProcess.progress ?? state.tracker.progress,
      trackingError: state.cliProcess.error ?? state.tracker.error,
    }),
    [state.navigation, state.cache, state.tracker, state.cliProcess]
  );
}

export interface ProposalDetailState {
  view: ViewType;
  selectedProposal: ProposalListItem | null;
  selectedStageIndex: number;
  scrollOffset: number;
  calldataActionIndex: number;
  isTracking: boolean;
  trackingProgress: string | null;
  trackingError: string | null;
  lastResult: TrackingResult | null;
  preparedTxs: PreparedTransaction[];
  calldataActions: DecodedAction[];
  calldataLoading: boolean;
  calldataError: string | null;
}

export function useProposalDetailState(store: GovTrackerStore): ProposalDetailState {
  const { state } = store;
  return useMemo(
    () => ({
      view: state.navigation.view,
      selectedProposal: state.navigation.selectedProposal,
      selectedStageIndex: state.navigation.selectedStageIndex,
      scrollOffset: state.navigation.scrollOffset,
      calldataActionIndex: state.navigation.calldataActionIndex,
      isTracking: state.tracker.isTracking,
      trackingProgress: state.tracker.progress,
      trackingError: state.tracker.error,
      lastResult: state.tracker.lastResult,
      preparedTxs: state.tracker.preparedTxs,
      calldataActions: state.calldata.actions,
      calldataLoading: state.calldata.loading,
      calldataError: state.calldata.error,
    }),
    [state.navigation, state.tracker, state.calldata]
  );
}

export interface ElectionViewState {
  view: ViewType;
  electionStatus: ElectionStatus | null;
  electionProposals: ElectionProposalStatus[];
  electionLoading: boolean;
  electionError: string | null;
  electionWarning: string | null;
  detailsIndex: number | null;
  nomineeDetails: NomineeElectionDetails | null;
  memberDetails: MemberElectionDetails | null;
  detailsLoading: boolean;
  detailsError: string | null;
  isTracking: boolean;
  trackingProgress: string | null;
  trackingError: string | null;
}

export function useElectionViewState(store: GovTrackerStore): ElectionViewState {
  const { state } = store;
  return useMemo(
    () => ({
      view: state.navigation.view,
      electionStatus: state.electionData.status,
      electionProposals: state.electionData.proposals,
      electionLoading: state.electionData.loading,
      electionError: state.electionData.error,
      electionWarning: state.electionData.warning,
      detailsIndex: state.electionDetails.currentIndex,
      nomineeDetails: state.electionDetails.nomineeDetails,
      memberDetails: state.electionDetails.memberDetails,
      detailsLoading: state.electionDetails.loading,
      detailsError: state.electionDetails.error,
      isTracking: state.cliProcess.isRunning,
      trackingProgress: state.cliProcess.progress,
      trackingError: state.cliProcess.error,
    }),
    [state.navigation.view, state.electionData, state.electionDetails, state.cliProcess]
  );
}

export interface NavigationActions {
  setFilter: (filter: FilterType) => void;
  cycleFilter: () => void;
  cycleSort: () => void;
  selectItem: (index: number) => void;
  moveUp: () => void;
  moveDown: (maxIndex: number) => void;
  pageUp: (maxIndex: number) => void;
  pageDown: (maxIndex: number) => void;
  goToTop: () => void;
  goToBottom: (maxIndex: number) => void;
  enter: (items: ProposalListItem[]) => void;
  back: () => void;
  goToCalldata: () => void;
  goToStage: (index: number) => void;
  goToSimulation: () => void;
  goToDescription: () => void;
  goToElection: () => void;
  nextAction: (maxIndex: number) => void;
  prevAction: () => void;
  setScrollOffset: (offset: number) => void;
  reset: () => void;
  startSearch: () => void;
  finishSearch: () => void;
  clearSearch: () => void;
  setSearchQuery: (query: string) => void;
  appendSearchChar: (char: string) => void;
  deleteSearchChar: () => void;
  goToHelp: () => void;
  goToSettings: () => void;
}

export function useNavigationActions(dispatch: Dispatch): NavigationActions {
  return useMemo(
    () => ({
      setFilter: (filter: FilterType) => dispatch(actions.navSetFilter(filter)),
      cycleFilter: () => dispatch(actions.navCycleFilter()),
      cycleSort: () => dispatch(actions.navCycleSort()),
      selectItem: (index: number) => dispatch(actions.navSelectItem(index)),
      moveUp: () => dispatch(actions.navMove(-1, Infinity)),
      moveDown: (maxIndex: number) => dispatch(actions.navMove(1, maxIndex)),
      pageUp: () => dispatch(actions.navMove(-PAGE_SIZE, Infinity)),
      pageDown: (maxIndex: number) => dispatch(actions.navMove(PAGE_SIZE, maxIndex)),
      goToTop: () => dispatch(actions.navGoTo("top", 0)),
      goToBottom: (maxIndex: number) => dispatch(actions.navGoTo("bottom", maxIndex)),
      enter: (items: ProposalListItem[]) => dispatch(actions.navEnter(items)),
      back: () => dispatch(actions.navBack()),
      goToCalldata: () => dispatch(actions.navGoToView("calldata")),
      goToStage: (index: number) => dispatch(actions.navGoToStage(index)),
      goToSimulation: () => dispatch(actions.navGoToView("simulation")),
      goToDescription: () => dispatch(actions.navGoToView("description")),
      goToElection: () => dispatch(actions.navGoToView("election")),
      nextAction: (maxIndex: number) => dispatch(actions.navNavigateAction(1, maxIndex)),
      prevAction: () => dispatch(actions.navNavigateAction(-1, Infinity)),
      setScrollOffset: (offset: number) => dispatch(actions.navSetScrollOffset(offset)),
      reset: () => dispatch(actions.navReset()),
      startSearch: () => dispatch(actions.navStartSearch()),
      finishSearch: () => dispatch(actions.navFinishSearch()),
      clearSearch: () => dispatch(actions.navClearSearch()),
      setSearchQuery: (query: string) => dispatch(actions.navSetSearchQuery(query)),
      appendSearchChar: (char: string) => dispatch(actions.navAppendSearchChar(char)),
      deleteSearchChar: () => dispatch(actions.navDeleteSearchChar()),
      goToHelp: () => dispatch(actions.navGoToOverlay("help")),
      goToSettings: () => dispatch(actions.navGoToOverlay("settings")),
    }),
    [dispatch]
  );
}

// ============================================================================
// Constants (re-exported for compatibility)
// ============================================================================

export const STAGE_COUNT = 7;
export { PAGE_SIZE };
