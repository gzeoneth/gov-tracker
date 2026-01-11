/**
 * Shared text utilities for TUI views
 */

/**
 * Wrap text to fit within a given width, breaking at character boundaries
 */
export function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}

/**
 * Truncate text with ellipsis if it exceeds maxLen
 */
export function truncate(str: string, maxLen: number): string {
  if (maxLen <= 1) return str.length > 0 ? "…" : "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
