/**
 * Terminal size utilities for TUI views
 */

export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * Get current terminal dimensions
 */
export function getTerminalSize(): TerminalSize {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  };
}

/**
 * Calculate visible rows for scrollable content
 * @param reservedLines - Lines used by headers, footers, etc.
 * @param minRows - Minimum rows to show
 */
export function getVisibleRows(reservedLines: number, minRows = 5): number {
  const { height } = getTerminalSize();
  return Math.max(minRows, height - reservedLines);
}
