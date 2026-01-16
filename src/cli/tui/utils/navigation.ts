/**
 * Shared navigation utilities for TUI views
 */

import type { KeyInput } from "../ink-wrapper.js";

export type NavigationAction = "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom" | null;

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
  const nextIndex = (array.indexOf(current) + 1) % array.length;
  return array[nextIndex];
}
