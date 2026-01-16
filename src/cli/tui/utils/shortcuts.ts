/**
 * Shared keyboard shortcut definitions for TUI
 */

import type { ViewType } from "../types.js";

export interface Shortcut {
  key: string;
  action: string;
  note?: string;
}

export interface ShortcutSection {
  title: string;
  icon: string;
  shortcuts: Shortcut[];
}

const SCROLL_KEYS: Shortcut[] = [
  { key: "↑↓/PgUp/Dn", action: "Scroll" },
  { key: "b", action: "Back" },
];

const VIEW_SHORTCUTS: Record<string, Shortcut[]> = {
  list: [
    { key: "j/k", action: "Navigate" },
    { key: "g/G", action: "Top/Bottom" },
    { key: "/", action: "Search" },
    { key: "Enter", action: "View" },
    { key: "Tab", action: "Filter" },
    { key: "o", action: "Sort" },
    { key: "R", action: "Reload" },
    { key: "e", action: "Elections" },
    { key: "?", action: "Help" },
    { key: "q", action: "Quit" },
  ],
  detail: [
    { key: "j/k", action: "Stage" },
    { key: "1-7", action: "Jump" },
    { key: "Enter", action: "Details" },
    { key: "y/Y", action: "Copy ID/TX" },
    { key: "d", action: "Description" },
    { key: "c", action: "Calldata" },
    { key: "s", action: "Simulate" },
    { key: "?", action: "Help" },
    { key: "b", action: "Back" },
  ],
  calldata: [
    { key: "←→", action: "Actions" },
    { key: "↑↓/PgUp/Dn", action: "Scroll" },
    { key: "g/G", action: "Top/Bottom" },
    { key: "e/c", action: "Expand/Collapse" },
    { key: "b", action: "Back" },
  ],
  election: [
    { key: "↑↓", action: "Navigate" },
    { key: "b", action: "Back" },
  ],
  stage: SCROLL_KEYS,
  description: SCROLL_KEYS,
  simulation: [
    { key: "↑↓", action: "Navigate" },
    { key: "b", action: "Back" },
  ],
};

export function getShortcutsForView(view: ViewType): Shortcut[] {
  return VIEW_SHORTCUTS[view] ?? [];
}

export const HELP_SECTIONS: ShortcutSection[] = [
  {
    title: "Navigation",
    icon: "⌨",
    shortcuts: [
      { key: "j/↓, k/↑", action: "Move down/up" },
      { key: "Ctrl+d/u", action: "Page down/up" },
      { key: "g/G", action: "Top/Bottom" },
      { key: "Enter", action: "Select" },
      { key: "b/Esc", action: "Back" },
    ],
  },
  {
    title: "List View",
    icon: "📋",
    shortcuts: [
      { key: "/", action: "Search", note: "Esc clears" },
      { key: "Tab", action: "Filter" },
      { key: "o", action: "Sort" },
      { key: "R", action: "Reload" },
      { key: "e", action: "Elections" },
      { key: "q", action: "Quit" },
    ],
  },
  {
    title: "Detail View",
    icon: "📄",
    shortcuts: [
      { key: "1-7", action: "Jump to stage" },
      { key: "y/Y", action: "Copy ID/TX" },
      { key: "d/c/s", action: "Desc/Call/Sim" },
    ],
  },
  {
    title: "Calldata View",
    icon: "🔍",
    shortcuts: [
      { key: "←/→", action: "Prev/Next action" },
      { key: "Enter", action: "Toggle fold" },
      { key: "e/c", action: "Expand/Collapse all" },
    ],
  },
];
