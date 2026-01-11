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

interface ShortcutSection {
  title: string;
  icon?: string;
  shortcuts: Array<{ key: string; description: string; note?: string }>;
}

const HELP_SECTIONS: ShortcutSection[] = [
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
    title: "Tips",
    icon: "💡",
    shortcuts: [
      { key: "?", description: "Show/hide this help (works in any view)" },
      { key: "Search", description: "Matches title and proposal ID" },
      { key: "RPC", description: "Use --l2-rpc for tracking features" },
    ],
  },
];

const RESERVED_LINES = 6;

export function HelpView({ navigation }: HelpViewProps): React.ReactElement {
  const { state } = navigation;
  const visibleRows = getVisibleRows(RESERVED_LINES);

  const allLines: Array<{ text: React.ReactNode; isHeader?: boolean; isSpacer?: boolean }> = [];

  for (const section of HELP_SECTIONS) {
    allLines.push({ text: `${section.icon ?? "•"} ${section.title}`, isHeader: true });
    for (const shortcut of section.shortcuts) {
      allLines.push({
        text: (
          <Box key={`${section.title}-${shortcut.key}`}>
            <Text color="cyan">{shortcut.key.padEnd(12)}</Text>
            <Text>{shortcut.description}</Text>
            {shortcut.note && <Text color="gray"> ({shortcut.note})</Text>}
          </Box>
        ),
      });
    }
    allLines.push({ text: "", isSpacer: true });
  }

  const visibleLines = allLines.slice(state.scrollOffset, state.scrollOffset + visibleRows);
  const hasMore = state.scrollOffset + visibleRows < allLines.length;
  const hasLess = state.scrollOffset > 0;

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
        {hasLess && (
          <Box marginBottom={1}>
            <ScrollIndicatorTop scrollOffset={state.scrollOffset} />
          </Box>
        )}

        {visibleLines.map((line, i) => {
          if (line.isHeader) {
            return (
              <Box key={i} marginTop={i === 0 ? 0 : 1}>
                <Text bold color="yellow">{line.text as string}</Text>
              </Box>
            );
          }
          if (line.isSpacer) {
            return null;
          }
          return <Box key={i} marginLeft={2}>{line.text}</Box>;
        })}

        {hasMore && (
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
