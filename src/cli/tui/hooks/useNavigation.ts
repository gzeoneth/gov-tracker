/**
 * Navigation state management hook
 */

import { useReducer, useMemo } from "react";
import type {
  NavigationState,
  ProposalListItem,
  FilterType,
  ViewType,
  SortType,
} from "../types.js";
import { clamp, cycleArray, PAGE_SIZE } from "../utils/navigation.js";

export const MAX_STAGE_INDEX = 6;
export const STAGE_COUNT = 7;

const FILTER_ORDER: FilterType[] = ["all", "active", "complete", "timelocks"];
const SORT_ORDER: SortType[] = ["newest", "oldest", "progress", "status"];
const SCROLLABLE_VIEWS: ViewType[] = ["calldata", "stage", "description"];

const INITIAL_STATE: NavigationState = {
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

type Action =
  | { type: "SET_FILTER"; filter: FilterType }
  | { type: "CYCLE_FILTER" }
  | { type: "CYCLE_SORT" }
  | { type: "SELECT"; index: number }
  | { type: "MOVE"; delta: number; max: number }
  | { type: "GOTO"; position: "top" | "bottom"; max: number }
  | { type: "ENTER"; items: ProposalListItem[] }
  | { type: "BACK" }
  | { type: "SUBVIEW"; view: ViewType }
  | { type: "STAGE"; index: number }
  | { type: "ACTION_NAV"; delta: number; max: number }
  | { type: "SCROLL"; offset: number }
  | { type: "RESET" }
  | { type: "SEARCH_START" }
  | { type: "SEARCH_FINISH" }
  | { type: "SEARCH_CLEAR" }
  | { type: "SEARCH_SET"; query: string }
  | { type: "SEARCH_APPEND"; char: string }
  | { type: "SEARCH_DELETE" }
  | { type: "HELP" };

function getNavigableField(
  view: ViewType
): "selectedIndex" | "selectedStageIndex" | "scrollOffset" | null {
  if (view === "list") return "selectedIndex";
  if (view === "detail") return "selectedStageIndex";
  if (SCROLLABLE_VIEWS.includes(view)) return "scrollOffset";
  return null;
}

function reducer(state: NavigationState, action: Action): NavigationState {
  switch (action.type) {
    case "SET_FILTER":
      return { ...state, filter: action.filter, selectedIndex: 0, scrollOffset: 0 };
    case "CYCLE_FILTER":
      return {
        ...state,
        filter: cycleArray(FILTER_ORDER, state.filter),
        selectedIndex: 0,
        scrollOffset: 0,
      };
    case "CYCLE_SORT":
      return {
        ...state,
        sort: cycleArray(SORT_ORDER, state.sort),
        selectedIndex: 0,
        scrollOffset: 0,
      };
    case "SELECT":
      return { ...state, selectedIndex: action.index };
    case "MOVE": {
      const field = getNavigableField(state.view);
      if (!field) return state;
      const max = field === "selectedStageIndex" ? MAX_STAGE_INDEX : Math.max(0, action.max - 1);
      return { ...state, [field]: clamp(state[field] + action.delta, 0, max) };
    }
    case "GOTO": {
      const field = getNavigableField(state.view);
      if (!field) return state;
      const max = field === "selectedStageIndex" ? MAX_STAGE_INDEX : Math.max(0, action.max - 1);
      return { ...state, [field]: action.position === "top" ? 0 : max };
    }
    case "ENTER":
      if (state.view === "list" && action.items[state.selectedIndex]) {
        return {
          ...state,
          view: "detail",
          selectedProposal: action.items[state.selectedIndex],
          selectedStageIndex: 0,
        };
      }
      if (state.view === "detail") {
        return { ...state, view: "stage", scrollOffset: 0 };
      }
      return state;
    case "BACK":
      if (state.view === "help" && state.previousView) {
        return { ...state, view: state.previousView, previousView: null };
      }
      if (state.view === "detail" || state.view === "election") {
        return { ...state, view: "list", selectedProposal: null, selectedStageIndex: 0 };
      }
      if (SCROLLABLE_VIEWS.includes(state.view) || state.view === "simulation") {
        return { ...state, view: "detail", scrollOffset: 0, calldataActionIndex: 0 };
      }
      return state;
    case "SUBVIEW":
      if (state.view !== "detail" && state.view !== "list") return state;
      return {
        ...state,
        view: action.view,
        scrollOffset: 0,
        calldataActionIndex: 0,
        isSearching: false,
      };
    case "STAGE":
      return {
        ...state,
        view: "stage",
        selectedStageIndex: clamp(action.index, 0, MAX_STAGE_INDEX),
        scrollOffset: 0,
      };
    case "ACTION_NAV":
      return {
        ...state,
        calldataActionIndex: clamp(
          state.calldataActionIndex + action.delta,
          0,
          Math.max(0, action.max - 1)
        ),
        scrollOffset: 0,
      };
    case "SCROLL":
      return { ...state, scrollOffset: action.offset };
    case "RESET":
      return INITIAL_STATE;
    case "SEARCH_START":
      return { ...state, isSearching: true, searchQuery: "" };
    case "SEARCH_FINISH":
      return { ...state, isSearching: false };
    case "SEARCH_CLEAR":
      return { ...state, isSearching: false, searchQuery: "" };
    case "SEARCH_SET":
      return { ...state, searchQuery: action.query, selectedIndex: 0 };
    case "SEARCH_APPEND":
      return { ...state, searchQuery: state.searchQuery + action.char, selectedIndex: 0 };
    case "SEARCH_DELETE":
      return { ...state, searchQuery: state.searchQuery.slice(0, -1), selectedIndex: 0 };
    case "HELP":
      return { ...state, view: "help", previousView: state.view };
  }
}

export interface UseNavigationResult {
  state: NavigationState;
  setFilter: (filter: FilterType) => void;
  cycleFilter: () => void;
  cycleSort: () => void;
  selectItem: (index: number) => void;
  moveUp: () => void;
  moveDown: (max: number) => void;
  pageUp: (max: number) => void;
  pageDown: (max: number) => void;
  goToTop: () => void;
  goToBottom: (max: number) => void;
  enter: (items: ProposalListItem[]) => void;
  back: () => void;
  goToCalldata: () => void;
  goToStage: (index: number) => void;
  goToSimulation: () => void;
  goToDescription: () => void;
  goToElection: () => void;
  nextAction: (max: number) => void;
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
}

export function useNavigation(): UseNavigationResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  return useMemo(
    () => ({
      state,
      setFilter: (filter: FilterType) => dispatch({ type: "SET_FILTER", filter }),
      cycleFilter: () => dispatch({ type: "CYCLE_FILTER" }),
      cycleSort: () => dispatch({ type: "CYCLE_SORT" }),
      selectItem: (index: number) => dispatch({ type: "SELECT", index }),
      moveUp: () => dispatch({ type: "MOVE", delta: -1, max: Infinity }),
      moveDown: (max: number) => dispatch({ type: "MOVE", delta: 1, max }),
      pageUp: () => dispatch({ type: "MOVE", delta: -PAGE_SIZE, max: Infinity }),
      pageDown: (max: number) => dispatch({ type: "MOVE", delta: PAGE_SIZE, max }),
      goToTop: () => dispatch({ type: "GOTO", position: "top", max: 0 }),
      goToBottom: (max: number) => dispatch({ type: "GOTO", position: "bottom", max }),
      enter: (items: ProposalListItem[]) => dispatch({ type: "ENTER", items }),
      back: () => dispatch({ type: "BACK" }),
      goToCalldata: () => dispatch({ type: "SUBVIEW", view: "calldata" }),
      goToStage: (index: number) => dispatch({ type: "STAGE", index }),
      goToSimulation: () => dispatch({ type: "SUBVIEW", view: "simulation" }),
      goToDescription: () => dispatch({ type: "SUBVIEW", view: "description" }),
      goToElection: () => dispatch({ type: "SUBVIEW", view: "election" }),
      nextAction: (max: number) => dispatch({ type: "ACTION_NAV", delta: 1, max }),
      prevAction: () => dispatch({ type: "ACTION_NAV", delta: -1, max: Infinity }),
      setScrollOffset: (offset: number) => dispatch({ type: "SCROLL", offset }),
      reset: () => dispatch({ type: "RESET" }),
      startSearch: () => dispatch({ type: "SEARCH_START" }),
      finishSearch: () => dispatch({ type: "SEARCH_FINISH" }),
      clearSearch: () => dispatch({ type: "SEARCH_CLEAR" }),
      setSearchQuery: (query: string) => dispatch({ type: "SEARCH_SET", query }),
      appendSearchChar: (char: string) => dispatch({ type: "SEARCH_APPEND", char }),
      deleteSearchChar: () => dispatch({ type: "SEARCH_DELETE" }),
      goToHelp: () => dispatch({ type: "HELP" }),
    }),
    [state]
  );
}
