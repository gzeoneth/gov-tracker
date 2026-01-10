/**
 * Navigation state management hook
 */

import { useState, useCallback } from "react";
import type { NavigationState, ProposalListItem, FilterType } from "../types";

const INITIAL_STATE: NavigationState = {
  view: "list",
  filter: "all",
  selectedIndex: 0,
  selectedProposal: null,
  selectedStageIndex: 0,
  calldataActionIndex: 0,
  scrollOffset: 0,
};

export interface UseNavigationResult {
  state: NavigationState;
  setFilter: (filter: FilterType) => void;
  cycleFilter: () => void;
  selectItem: (index: number) => void;
  moveUp: () => void;
  moveDown: (maxIndex: number) => void;
  enter: (items: ProposalListItem[]) => void;
  back: () => void;
  goToCalldata: () => void;
  goToStage: (index: number) => void;
  goToSimulation: () => void;
  nextAction: (maxIndex: number) => void;
  prevAction: () => void;
  setScrollOffset: (offset: number) => void;
  reset: () => void;
}

const FILTER_ORDER: FilterType[] = ["all", "active", "complete", "elections", "timelocks"];

export function useNavigation(): UseNavigationResult {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);

  const setFilter = useCallback((filter: FilterType) => {
    setState((prev) => ({
      ...prev,
      filter,
      selectedIndex: 0,
      scrollOffset: 0,
    }));
  }, []);

  const cycleFilter = useCallback(() => {
    setState((prev) => {
      const currentIndex = FILTER_ORDER.indexOf(prev.filter);
      const nextIndex = (currentIndex + 1) % FILTER_ORDER.length;
      return {
        ...prev,
        filter: FILTER_ORDER[nextIndex],
        selectedIndex: 0,
        scrollOffset: 0,
      };
    });
  }, []);

  const selectItem = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: index,
    }));
  }, []);

  const moveUp = useCallback(() => {
    setState((prev) => {
      if (prev.view === "list") {
        return {
          ...prev,
          selectedIndex: Math.max(0, prev.selectedIndex - 1),
        };
      } else if (prev.view === "detail") {
        return {
          ...prev,
          selectedStageIndex: Math.max(0, prev.selectedStageIndex - 1),
        };
      } else if (prev.view === "calldata" || prev.view === "stage") {
        return {
          ...prev,
          scrollOffset: Math.max(0, prev.scrollOffset - 1),
        };
      }
      return prev;
    });
  }, []);

  const moveDown = useCallback((maxIndex: number) => {
    setState((prev) => {
      if (prev.view === "list") {
        return {
          ...prev,
          selectedIndex: Math.min(maxIndex - 1, prev.selectedIndex + 1),
        };
      } else if (prev.view === "detail") {
        return {
          ...prev,
          selectedStageIndex: Math.min(6, prev.selectedStageIndex + 1),
        };
      } else if (prev.view === "calldata" || prev.view === "stage") {
        return {
          ...prev,
          scrollOffset: prev.scrollOffset + 1,
        };
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
      } else if (prev.view === "detail") {
        return {
          ...prev,
          view: "stage",
          scrollOffset: 0,
        };
      }
      return prev;
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      if (prev.view === "detail") {
        return {
          ...prev,
          view: "list",
          selectedProposal: null,
          selectedStageIndex: 0,
        };
      } else if (prev.view === "calldata" || prev.view === "stage" || prev.view === "simulation") {
        return {
          ...prev,
          view: "detail",
          scrollOffset: 0,
          calldataActionIndex: 0,
        };
      }
      return prev;
    });
  }, []);

  const goToCalldata = useCallback(() => {
    setState((prev) => {
      if (prev.view === "detail") {
        return {
          ...prev,
          view: "calldata",
          scrollOffset: 0,
          calldataActionIndex: 0,
        };
      }
      return prev;
    });
  }, []);

  const goToStage = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      view: "stage",
      selectedStageIndex: index,
      scrollOffset: 0,
    }));
  }, []);

  const goToSimulation = useCallback(() => {
    setState((prev) => {
      if (prev.view === "detail") {
        return {
          ...prev,
          view: "simulation",
          scrollOffset: 0,
        };
      }
      return prev;
    });
  }, []);

  const nextAction = useCallback((maxIndex: number) => {
    setState((prev) => ({
      ...prev,
      calldataActionIndex: Math.min(maxIndex - 1, prev.calldataActionIndex + 1),
    }));
  }, []);

  const prevAction = useCallback(() => {
    setState((prev) => ({
      ...prev,
      calldataActionIndex: Math.max(0, prev.calldataActionIndex - 1),
    }));
  }, []);

  const setScrollOffset = useCallback((offset: number) => {
    setState((prev) => ({
      ...prev,
      scrollOffset: offset,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    setFilter,
    cycleFilter,
    selectItem,
    moveUp,
    moveDown,
    enter,
    back,
    goToCalldata,
    goToStage,
    goToSimulation,
    nextAction,
    prevAction,
    setScrollOffset,
    reset,
  };
}
