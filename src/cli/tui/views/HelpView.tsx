/**
 * Help view showing all keyboard shortcuts
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { UseNavigationResult } from "../hooks/index.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { getVisibleRows } from "../utils/index.js";

interface HelpViewProps {
  navigation: UseNavigationResult;
}

interface HelpLine {
  text: React.ReactNode;
  type: "header" | "shortcut" | "spacer";
}

const HELP_DATA: Array<{ title: string; icon: string; shortcuts: Array<{ key: string; desc: string; note?: string }> }> = [
  {
    title: "Navigation (Vim-style)",
    icon: "⌨",
    shortcuts: [
      { key: "j/↓", desc: "Move down" },
      { key: "k/↑", desc: "Move up" },
      { key: "Ctrl+d/PgDn", desc: "Page down (10 items)" },
      { key: "Ctrl+u/PgUp", desc: "Page up (10 items)" },
      { key: "g", desc: "Jump to top" },
      { key: "G", desc: "Jump to bottom" },
      { key: "Enter", desc: "Select / Enter view" },
      { key: "b/Esc", desc: "Go back" },
    ],
  },
  {
    title: "List View",
    icon: "📋",
    shortcuts: [
      { key: "/", desc: "Start search", note: "Enter to finish, Esc to clear" },
      { key: "Tab", desc: "Cycle filter", note: "all → active → complete → timelocks" },
      { key: "o", desc: "Cycle sort", note: "newest → oldest → progress → status" },
      { key: "R", desc: "Reload cache from disk" },
      { key: "d", desc: "Discover proposals", note: "requires RPC" },
      { key: "e", desc: "Election status", note: "requires RPC" },
      { key: "S", desc: "Settings" },
      { key: "q", desc: "Quit" },
    ],
  },
  {
    title: "Detail View",
    icon: "📄",
    shortcuts: [
      { key: "1-7", desc: "Jump to stage number" },
      { key: "y", desc: "Copy proposal/operation ID" },
      { key: "Y", desc: "Copy transaction hash" },
      { key: "d", desc: "View description" },
      { key: "c", desc: "View calldata" },
      { key: "s", desc: "View simulation data" },
      { key: "r", desc: "Re-track proposal", note: "requires RPC" },
    ],
  },
  {
    title: "Calldata View",
    icon: "🔍",
    shortcuts: [
      { key: "←/→", desc: "Navigate between actions" },
      { key: "Enter", desc: "Toggle fold/unfold" },
      { key: "e", desc: "Expand all" },
      { key: "c", desc: "Collapse all" },
    ],
  },
  {
    title: "Election View",
    icon: "🗳",
    shortcuts: [
      { key: "j/k", desc: "Navigate elections" },
      { key: "Enter/l", desc: "View detailed info", note: "contenders, nominees, members" },
      { key: "r", desc: "Refresh election data" },
    ],
  },
  {
    title: "Settings View",
    icon: "⚙",
    shortcuts: [
      { key: "j/k", desc: "Navigate settings" },
      { key: "Enter/Space", desc: "Edit or toggle setting" },
      { key: "r", desc: "Reset all to defaults" },
    ],
  },
  {
    title: "Tips",
    icon: "💡",
    shortcuts: [
      { key: "?", desc: "Show/hide this help (works in any view)" },
      { key: "Search", desc: "Matches title and proposal ID" },
      { key: "RPC", desc: "Use --l2-rpc for tracking features" },
    ],
  },
];

function buildHelpLines(): HelpLine[] {
  return HELP_DATA.flatMap((section) => [
    { text: `${section.icon} ${section.title}`, type: "header" as const },
    ...section.shortcuts.map((s) => ({
      text: (
        <Box key={`${section.title}-${s.key}`}>
          <Text color="cyan">{s.key.padEnd(12)}</Text>
          <Text>{s.desc}</Text>
          {s.note && <Text color="gray"> ({s.note})</Text>}
        </Box>
      ),
      type: "shortcut" as const,
    })),
    { text: "", type: "spacer" as const },
  ]);
}

function renderHelpLine(line: HelpLine, index: number): React.ReactNode {
  switch (line.type) {
    case "header":
      return (
        <Box key={index} marginTop={index === 0 ? 0 : 1}>
          <Text bold color="yellow">{line.text as string}</Text>
        </Box>
      );
    case "shortcut":
      return <Box key={index} marginLeft={2}>{line.text}</Box>;
    case "spacer":
      return null;
  }
}

const RESERVED_LINES = 6;

export function HelpView({ navigation }: HelpViewProps): React.ReactElement {
  const { state } = navigation;
  const visibleRows = getVisibleRows(RESERVED_LINES);
  const allLines = buildHelpLines();
  const visibleLines = allLines.slice(state.scrollOffset, state.scrollOffset + visibleRows);

  useInput((input: string, key: KeyInput) => {
    if (input === "?" || input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(allLines.length);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(allLines.length);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(allLines.length);
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(allLines.length);
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Gov-Tracker Help</Text>
        <Text color="gray"> - Keyboard Shortcuts Reference</Text>
      </Box>

      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
        {allLines.length > visibleRows && (
          <Box marginBottom={1}>
            <ScrollPosition
              scrollOffset={state.scrollOffset}
              visibleRows={visibleRows}
              totalItems={allLines.length}
            />
          </Box>
        )}
        {state.scrollOffset > 0 && (
          <Box marginBottom={1}>
            <ScrollIndicatorTop scrollOffset={state.scrollOffset} />
          </Box>
        )}

        {visibleLines.map(renderHelpLine)}

        {state.scrollOffset + visibleRows < allLines.length && (
          <Box marginTop={1}>
            <ScrollIndicatorBottom
              scrollOffset={state.scrollOffset}
              visibleRows={visibleRows}
              totalItems={allLines.length}
            />
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="cyan">j/k</Text>
        <Text color="gray">: Scroll </Text>
        <Text color="cyan">Ctrl+d/u</Text>
        <Text color="gray">: Page </Text>
        <Text color="cyan">g/G</Text>
        <Text color="gray">: Top/Bottom </Text>
        <Text color="cyan">?/b</Text>
        <Text color="gray">: Close</Text>
      </Box>
    </Box>
  );
}
