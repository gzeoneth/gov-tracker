/**
 * TUI-specific time formatting utilities
 *
 * Provides formatted time strings with color hints for Ink rendering.
 * Re-exports time constants from central location.
 */

import { TIMING } from "../../../constants.js";

// Re-export time constants for TUI convenience
export const MS_PER_MINUTE = TIMING.MS_PER_MINUTE;
export const MS_PER_HOUR = TIMING.MS_PER_HOUR;
export const MS_PER_DAY = TIMING.MS_PER_DAY;

export function formatDurationMs(diffMs: number): { text: string; color: string } {
  const hours = Math.floor(diffMs / MS_PER_HOUR);
  const mins = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE);

  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return { text: `${days}d ${hours % 24}h`, color: "gray" };
  }
  if (hours >= 1) {
    return { text: `${hours}h ${mins}m`, color: "yellow" };
  }
  return { text: `${mins}m`, color: "green" };
}

export function formatElapsedMs(elapsedMs: number, date: Date): { text: string; color: string } {
  if (elapsedMs < MS_PER_HOUR) {
    return { text: `${Math.floor(elapsedMs / MS_PER_MINUTE)}m ago`, color: "gray" };
  }
  if (elapsedMs < MS_PER_DAY) {
    return { text: `${Math.floor(elapsedMs / MS_PER_HOUR)}h ago`, color: "gray" };
  }
  return { text: date.toLocaleDateString(), color: "gray" };
}

export function formatDurationSec(remainingSec: number): string {
  const days = Math.floor(remainingSec / TIMING.SEC_PER_DAY);
  const hours = Math.floor((remainingSec % TIMING.SEC_PER_DAY) / TIMING.SEC_PER_HOUR);
  const mins = Math.floor((remainingSec % TIMING.SEC_PER_HOUR) / TIMING.SEC_PER_MINUTE);
  return `${days}d ${hours}h ${mins}m`;
}
