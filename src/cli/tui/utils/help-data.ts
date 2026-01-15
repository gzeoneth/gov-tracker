/**
 * Help view section data - keyboard shortcuts reference
 */

export interface HelpShortcut {
  key: string;
  description: string;
  note?: string;
}

export interface HelpSection {
  title: string;
  icon?: string;
  shortcuts: HelpShortcut[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Navigation (Vim-style)",
    icon: "⌨",
    shortcuts: [
      { key: "j/↓", description: "Move down" },
      { key: "k/↑", description: "Move up" },
      { key: "Ctrl+d/PgDn", description: "Page down (10 items)" },
      { key: "Ctrl+u/PgUp", description: "Page up (10 items)" },
      { key: "g", description: "Jump to top" },
      { key: "G", description: "Jump to bottom" },
      { key: "Enter", description: "Select / Enter view" },
      { key: "b/Esc", description: "Go back" },
    ],
  },
  {
    title: "List View",
    icon: "📋",
    shortcuts: [
      { key: "/", description: "Start search", note: "Enter to finish, Esc to clear" },
      { key: "Tab", description: "Cycle filter", note: "all → active → complete → timelocks" },
      { key: "o", description: "Cycle sort", note: "newest → oldest → progress → status" },
      { key: "R", description: "Reload cache from disk" },
      { key: "d", description: "Discover proposals", note: "requires RPC" },
      { key: "e", description: "Election status", note: "requires RPC" },
      { key: "S", description: "Settings" },
      { key: "q", description: "Quit" },
    ],
  },
  {
    title: "Detail View",
    icon: "📄",
    shortcuts: [
      { key: "1-7", description: "Jump to stage number" },
      { key: "y", description: "Copy proposal/operation ID" },
      { key: "Y", description: "Copy transaction hash" },
      { key: "d", description: "View description" },
      { key: "c", description: "View calldata" },
      { key: "s", description: "View simulation data" },
      { key: "r", description: "Re-track proposal", note: "requires RPC" },
    ],
  },
  {
    title: "Calldata View",
    icon: "🔍",
    shortcuts: [
      { key: "←/→", description: "Navigate between actions" },
      { key: "Enter", description: "Toggle fold/unfold" },
      { key: "e", description: "Expand all" },
      { key: "c", description: "Collapse all" },
    ],
  },
  {
    title: "Election View",
    icon: "🗳",
    shortcuts: [
      { key: "j/k", description: "Navigate elections" },
      { key: "Enter/l", description: "View detailed info", note: "contenders, nominees, members" },
      { key: "b/Esc", description: "Go back / Close details" },
    ],
  },
  {
    title: "Settings View",
    icon: "⚙",
    shortcuts: [
      { key: "j/k", description: "Navigate settings" },
      { key: "Enter/Space", description: "Edit or toggle setting" },
      { key: "r", description: "Reset all to defaults" },
      { key: "b/Esc", description: "Save and close" },
    ],
  },
  {
    title: "Tips",
    icon: "💡",
    shortcuts: [
      { key: "?", description: "Show/hide this help (works in any view)" },
      { key: "Search", description: "Matches title and proposal ID" },
      { key: "RPC", description: "Use --l2-rpc for tracking features" },
    ],
  },
];
