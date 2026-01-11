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

function isScrollableView(view: ViewType): boolean {
  return SCROLLABLE_VIEWS.includes(view);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cycleArray<T>(array: T[], current: T): T {
  const nextIndex = (array.indexOf(current) + 1) % array.length;
  return array[nextIndex];
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

export function useNavigation(): UseNavigationResult {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);

  const setFilter = useCallback((filter: FilterType) => {
    setState((prev) => ({ ...prev, filter, selectedIndex: 0, scrollOffset: 0 }));
  }, []);

  const cycleFilter = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filter: cycleArray(FILTER_ORDER, prev.filter),
      selectedIndex: 0,
      scrollOffset: 0,
    }));
  }, []);

  const cycleSort = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sort: cycleArray(SORT_ORDER, prev.sort),
      selectedIndex: 0,
      scrollOffset: 0,
    }));
  }, []);

  const selectItem = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const navigate = useCallback((delta: number, maxIndex: number): void => {
    setState((prev) => {
      const field = getNavigableField(prev.view);
      if (!field) return prev;
      const max = getMaxForField(field, maxIndex);
      const newValue = clamp(prev[field] + delta, 0, max);
      return { ...prev, [field]: newValue };
    });
  }, []);

  const navigateTo = useCallback((position: "top" | "bottom", maxIndex: number): void => {
    setState((prev) => {
      const field = getNavigableField(prev.view);
      if (!field) return prev;
      const max = getMaxForField(field, maxIndex);
      return { ...prev, [field]: position === "top" ? 0 : max };
    });
  }, []);

  const moveUp = useCallback(() => navigate(-1, Infinity), [navigate]);
  const moveDown = useCallback((maxIndex: number) => navigate(1, maxIndex), [navigate]);
  const pageUp = useCallback((_maxIndex: number) => navigate(-PAGE_SIZE, Infinity), [navigate]);
  const pageDown = useCallback((maxIndex: number) => navigate(PAGE_SIZE, maxIndex), [navigate]);
  const goToTop = useCallback(() => navigateTo("top", 0), [navigateTo]);
  const goToBottom = useCallback(
    (maxIndex: number) => navigateTo("bottom", maxIndex),
    [navigateTo]
  );

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
      if (isScrollableView(prev.view) || prev.view === "simulation") {
        return { ...prev, view: "detail", scrollOffset: 0, calldataActionIndex: 0 };
      }
      return prev;
    });
  }, []);

  const goToSubView = useCallback((targetView: ViewType) => {
    setState((prev) => {
      if (prev.view !== "detail" && prev.view !== "list") return prev;
      return {
        ...prev,
        view: targetView,
        scrollOffset: 0,
        calldataActionIndex: 0,
        isSearching: false,
      };
    });
  }, []);

  const goToCalldata = useCallback(() => goToSubView("calldata"), [goToSubView]);
  const goToSimulation = useCallback(() => goToSubView("simulation"), [goToSubView]);
  const goToDescription = useCallback(() => goToSubView("description"), [goToSubView]);
  const goToElection = useCallback(() => goToSubView("election"), [goToSubView]);

  const goToStage = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      view: "stage",
      selectedStageIndex: clamp(index, 0, MAX_STAGE_INDEX),
      scrollOffset: 0,
    }));
  }, []);

  const navigateAction = useCallback((delta: number, maxIndex: number) => {
    setState((prev) => ({
      ...prev,
      calldataActionIndex: clamp(prev.calldataActionIndex + delta, 0, Math.max(0, maxIndex - 1)),
      scrollOffset: 0,
    }));
  }, []);

  const nextAction = useCallback(
    (maxIndex: number) => navigateAction(1, maxIndex),
    [navigateAction]
  );
  const prevAction = useCallback(() => navigateAction(-1, Infinity), [navigateAction]);

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

  const goToOverlay = useCallback((targetView: "help" | "settings") => {
    setState((prev) => ({ ...prev, view: targetView, previousView: prev.view }));
  }, []);

  const goToHelp = useCallback(() => goToOverlay("help"), [goToOverlay]);
  const goToSettings = useCallback(() => goToOverlay("settings"), [goToOverlay]);

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
