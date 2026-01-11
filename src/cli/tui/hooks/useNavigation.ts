/**
 * Navigation state management hook
 */

import { useState, useCallback } from "react";
import type {
  NavigationState,
  ProposalListItem,
  FilterType,
  ViewType,
  SortType,
} from "../types.js";

export const MAX_STAGE_INDEX = 6;
export const STAGE_COUNT = 7;

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

export interface UseNavigationResult {
  state: NavigationState;
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

const FILTER_ORDER: FilterType[] = ["all", "active", "complete", "timelocks"];
const SORT_ORDER: SortType[] = ["newest", "oldest", "progress", "status"];
const PAGE_SIZE = 10;
const SCROLLABLE_VIEWS: ViewType[] = ["calldata", "stage", "description"];

export function useNavigation(): UseNavigationResult {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);

  const setFilter = useCallback((filter: FilterType) => {
    setState((prev) => ({ ...prev, filter, selectedIndex: 0, scrollOffset: 0 }));
  }, []);

  const cycleFilter = useCallback(() => {
    setState((prev) => {
      const nextIndex = (FILTER_ORDER.indexOf(prev.filter) + 1) % FILTER_ORDER.length;
      return { ...prev, filter: FILTER_ORDER[nextIndex], selectedIndex: 0, scrollOffset: 0 };
    });
  }, []);

  const cycleSort = useCallback(() => {
    setState((prev) => {
      const nextIndex = (SORT_ORDER.indexOf(prev.sort) + 1) % SORT_ORDER.length;
      return { ...prev, sort: SORT_ORDER[nextIndex], selectedIndex: 0, scrollOffset: 0 };
    });
  }, []);

  const selectItem = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const moveUp = useCallback(() => {
    setState((prev) => {
      if (prev.view === "list") {
        return { ...prev, selectedIndex: Math.max(0, prev.selectedIndex - 1) };
      }
      if (prev.view === "detail") {
        return { ...prev, selectedStageIndex: Math.max(0, prev.selectedStageIndex - 1) };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        return { ...prev, scrollOffset: Math.max(0, prev.scrollOffset - 1) };
      }
      return prev;
    });
  }, []);

  const moveDown = useCallback((maxIndex: number) => {
    setState((prev) => {
      if (prev.view === "list") {
        if (maxIndex <= 0) {
          return { ...prev, selectedIndex: 0 };
        }
        return { ...prev, selectedIndex: Math.min(maxIndex - 1, prev.selectedIndex + 1) };
      }
      if (prev.view === "detail") {
        return {
          ...prev,
          selectedStageIndex: Math.min(MAX_STAGE_INDEX, prev.selectedStageIndex + 1),
        };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        const lastIndex = Math.max(0, maxIndex - 1);
        return { ...prev, scrollOffset: Math.min(lastIndex, prev.scrollOffset + 1) };
      }
      return prev;
    });
  }, []);

  const pageUp = useCallback((_maxIndex: number) => {
    setState((prev) => {
      if (prev.view === "list") {
        return { ...prev, selectedIndex: Math.max(0, prev.selectedIndex - PAGE_SIZE) };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        return { ...prev, scrollOffset: Math.max(0, prev.scrollOffset - PAGE_SIZE) };
      }
      return prev;
    });
  }, []);

  const pageDown = useCallback((maxIndex: number) => {
    setState((prev) => {
      if (prev.view === "list") {
        if (maxIndex <= 0) {
          return { ...prev, selectedIndex: 0 };
        }
        return { ...prev, selectedIndex: Math.min(maxIndex - 1, prev.selectedIndex + PAGE_SIZE) };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        const lastIndex = Math.max(0, maxIndex - 1);
        return { ...prev, scrollOffset: Math.min(lastIndex, prev.scrollOffset + PAGE_SIZE) };
      }
      return prev;
    });
  }, []);

  const goToTop = useCallback(() => {
    setState((prev) => {
      if (prev.view === "list") {
        return { ...prev, selectedIndex: 0 };
      }
      if (prev.view === "detail") {
        return { ...prev, selectedStageIndex: 0 };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        return { ...prev, scrollOffset: 0 };
      }
      return prev;
    });
  }, []);

  const goToBottom = useCallback((maxIndex: number) => {
    setState((prev) => {
      if (prev.view === "list") {
        if (maxIndex <= 0) {
          return { ...prev, selectedIndex: 0 };
        }
        return { ...prev, selectedIndex: maxIndex - 1 };
      }
      if (prev.view === "detail") {
        return { ...prev, selectedStageIndex: MAX_STAGE_INDEX };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view)) {
        return { ...prev, scrollOffset: Math.max(0, maxIndex - 1) };
      }
      return prev;
    });
  }, []);

  const enter = useCallback((items: ProposalListItem[]) => {
    setState((prev) => {
      if (prev.view === "list" && items[prev.selectedIndex]) {
        return {
          ...prev,
          view: "detail",
          selectedProposal: items[prev.selectedIndex],
          selectedStageIndex: 0,
        };
      }
      if (prev.view === "detail") {
        return { ...prev, view: "stage", scrollOffset: 0 };
      }
      return prev;
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      if ((prev.view === "help" || prev.view === "settings") && prev.previousView) {
        return { ...prev, view: prev.previousView, previousView: null };
      }
      if (prev.view === "detail" || prev.view === "election") {
        return { ...prev, view: "list", selectedProposal: null, selectedStageIndex: 0 };
      }
      if (SCROLLABLE_VIEWS.includes(prev.view) || prev.view === "simulation") {
        return { ...prev, view: "detail", scrollOffset: 0, calldataActionIndex: 0 };
      }
      return prev;
    });
  }, []);

  const goToSubView = useCallback((targetView: ViewType) => {
    setState((prev) => {
      if (prev.view !== "detail" && prev.view !== "list") return prev;
      return { ...prev, view: targetView, scrollOffset: 0, calldataActionIndex: 0 };
    });
  }, []);

  const goToCalldata = useCallback(() => goToSubView("calldata"), [goToSubView]);
  const goToSimulation = useCallback(() => goToSubView("simulation"), [goToSubView]);
  const goToDescription = useCallback(() => goToSubView("description"), [goToSubView]);
  const goToElection = useCallback(() => goToSubView("election"), [goToSubView]);

  const goToStage = useCallback((index: number) => {
    setState((prev) => ({ ...prev, view: "stage", selectedStageIndex: index, scrollOffset: 0 }));
  }, []);

  const nextAction = useCallback((maxIndex: number) => {
    setState((prev) => ({
      ...prev,
      calldataActionIndex: Math.min(maxIndex - 1, prev.calldataActionIndex + 1),
      scrollOffset: 0,
    }));
  }, []);

  const prevAction = useCallback(() => {
    setState((prev) => ({
      ...prev,
      calldataActionIndex: Math.max(0, prev.calldataActionIndex - 1),
      scrollOffset: 0,
    }));
  }, []);

  const setScrollOffset = useCallback((offset: number) => {
    setState((prev) => ({ ...prev, scrollOffset: offset }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const startSearch = useCallback(() => {
    setState((prev) => ({ ...prev, isSearching: true, searchQuery: "" }));
  }, []);

  const finishSearch = useCallback(() => {
    setState((prev) => ({ ...prev, isSearching: false }));
  }, []);

  const clearSearch = useCallback(() => {
    setState((prev) => ({ ...prev, isSearching: false, searchQuery: "" }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query, selectedIndex: 0 }));
  }, []);

  const appendSearchChar = useCallback((char: string) => {
    setState((prev) => ({ ...prev, searchQuery: prev.searchQuery + char, selectedIndex: 0 }));
  }, []);

  const deleteSearchChar = useCallback(() => {
    setState((prev) => ({
      ...prev,
      searchQuery: prev.searchQuery.slice(0, -1),
      selectedIndex: 0,
    }));
  }, []);

  const goToHelp = useCallback(() => {
    setState((prev) => ({
      ...prev,
      view: "help",
      previousView: prev.view,
    }));
  }, []);

  const goToSettings = useCallback(() => {
    setState((prev) => ({
      ...prev,
      view: "settings",
      previousView: prev.view,
    }));
  }, []);

  return {
    state,
    setFilter,
    cycleFilter,
    cycleSort,
    selectItem,
    moveUp,
    moveDown,
    pageUp,
    pageDown,
    goToTop,
    goToBottom,
    enter,
    back,
    goToCalldata,
    goToStage,
    goToSimulation,
    goToDescription,
    goToElection,
    nextAction,
    prevAction,
    setScrollOffset,
    reset,
    startSearch,
    finishSearch,
    clearSearch,
    setSearchQuery,
    appendSearchChar,
    deleteSearchChar,
    goToHelp,
    goToSettings,
  };
}
