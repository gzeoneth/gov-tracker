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
    title: "Navigation (Vim-style)",
    icon: "⌨",
    shortcuts: [
      { key: "j/↓", action: "Move down" },
      { key: "k/↑", action: "Move up" },
      { key: "Ctrl+d/PgDn", action: "Page down (10 items)" },
      { key: "Ctrl+u/PgUp", action: "Page up (10 items)" },
      { key: "g", action: "Jump to top" },
      { key: "G", action: "Jump to bottom" },
      { key: "Enter", action: "Select / Enter view" },
      { key: "b/Esc", action: "Go back" },
    ],
  },
  {
    title: "List View",
    icon: "📋",
    shortcuts: [
      { key: "/", action: "Start search", note: "Enter to finish, Esc to clear" },
      { key: "Tab", action: "Cycle filter", note: "all → active → complete → timelocks" },
      { key: "o", action: "Cycle sort", note: "newest → oldest → progress → status" },
      { key: "R", action: "Reload cache from disk" },
      { key: "e", action: "View elections" },
      { key: "q", action: "Quit" },
    ],
  },
  {
    title: "Detail View",
    icon: "📄",
    shortcuts: [
      { key: "1-7", action: "Jump to stage number" },
      { key: "y", action: "Copy proposal/operation ID" },
      { key: "Y", action: "Copy transaction hash" },
      { key: "d", action: "View description" },
      { key: "c", action: "View calldata" },
      { key: "s", action: "View simulation data" },
    ],
  },
  {
    title: "Calldata View",
    icon: "🔍",
    shortcuts: [
      { key: "←/→", action: "Navigate between actions" },
      { key: "Enter", action: "Toggle fold/unfold" },
      { key: "e", action: "Expand all" },
      { key: "c", action: "Collapse all" },
    ],
  },
  {
    title: "Election View",
    icon: "🗳",
    shortcuts: [
      { key: "j/k", action: "Navigate elections" },
      { key: "Enter/l", action: "View election details" },
    ],
  },
  {
    title: "Tips",
    icon: "💡",
    shortcuts: [
      { key: "?", action: "Show/hide this help (works in any view)" },
      { key: "Search", action: "Matches title and proposal ID" },
      { key: "CLI", action: "Use 'gov-tracker run' for live tracking" },
    ],
  },
];
