/**
 * Shared navigation utilities for TUI views
 */

import type { KeyInput } from "../ink-wrapper.js";
import type { SortType } from "../types.js";

export type NavigationAction = "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom" | null;

export const SORT_LABELS: Record<SortType, string> = {
  newest: "Newest",
  oldest: "Oldest",
  progress: "Progress",
  status: "Status",
};

export const SORT_LABELS_SHORT: Record<SortType, string> = {
  newest: "↓New",
  oldest: "↑Old",
  progress: "↓Prog",
  status: "Status",
};

const PAGE_SIZE = 10;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getNavigationAction(input: string, key: KeyInput): NavigationAction {
  if (key.upArrow || input === "k") return "up";
  if (key.downArrow || input === "j") return "down";
  if (key.pageUp || (key.ctrl && input === "u")) return "pageUp";
  if (key.pageDown || (key.ctrl && input === "d")) return "pageDown";
  if (input === "g") return "top";
  if (input === "G") return "bottom";
  return null;
}

export function applyNavigation(current: number, action: NavigationAction, max: number): number {
  switch (action) {
    case "up":
      return clamp(current - 1, 0, max);
    case "down":
      return clamp(current + 1, 0, max);
    case "pageUp":
      return clamp(current - PAGE_SIZE, 0, max);
    case "pageDown":
      return clamp(current + PAGE_SIZE, 0, max);
    case "top":
      return 0;
    case "bottom":
      return max;
    default:
      return current;
  }
}

export function cycleArray<T>(array: readonly T[], current: T): T {
  const currentIndex = array.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % array.length;
  return array[nextIndex];
}

export function parseProgress(stageProgress: string): { current: number; total: number } | null {
  const match = stageProgress.match(/(\d+)\/(\d+)/);
  if (!match) return null;
  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (total <= 0 || current < 0) return null;
  return { current, total };
}
