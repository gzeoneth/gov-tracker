/**
 * Help view showing all keyboard shortcuts
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { getVisibleRows } from "../utils/index.js";

interface HelpViewProps {
  navigation: UseNavigationResult;
}

interface ShortcutSection {
  title: string;
  shortcuts: Array<{ key: string; description: string }>;
}

const HELP_SECTIONS: ShortcutSection[] = [
  {
    title: "Navigation",
    shortcuts: [
      { key: "↑/↓", description: "Move selection up/down" },
      { key: "PgUp/PgDn", description: "Move selection by 10 items" },
      { key: "g/G", description: "Jump to top/bottom" },
      { key: "Enter", description: "Select item / enter view" },
      { key: "b/Esc", description: "Go back to previous view" },
      { key: "1-7", description: "Jump to stage (in detail view)" },
    ],
  },
  {
    title: "List View",
    shortcuts: [
      { key: "/", description: "Start search" },
      { key: "Tab", description: "Cycle through filters (all/active/complete/timelocks)" },
      { key: "R", description: "Reload cache from disk" },
      { key: "d", description: "Discover new proposals (requires RPC)" },
      { key: "e", description: "View election status (requires RPC)" },
      { key: "q", description: "Quit application" },
    ],
  },
  {
    title: "Detail View",
    shortcuts: [
      { key: "d", description: "View full description" },
      { key: "c", description: "View decoded calldata" },
      { key: "s", description: "View simulation data" },
      { key: "r", description: "Re-track proposal (requires RPC)" },
    ],
  },
  {
    title: "Calldata View",
    shortcuts: [
      { key: "←/→", description: "Navigate between actions" },
      { key: "Enter", description: "Toggle fold/unfold long values" },
      { key: "e", description: "Expand all foldable sections" },
      { key: "c", description: "Collapse all sections" },
    ],
  },
  {
    title: "Other",
    shortcuts: [
      { key: "?", description: "Show this help" },
    ],
  },
];

const RESERVED_LINES = 6;

export function HelpView({ navigation }: HelpViewProps): React.ReactElement {
  const { state } = navigation;
  const visibleRows = getVisibleRows(RESERVED_LINES);

  const allLines: Array<{ text: React.ReactNode; isHeader?: boolean }> = [];

  for (const section of HELP_SECTIONS) {
    allLines.push({ text: section.title, isHeader: true });
    for (const shortcut of section.shortcuts) {
      allLines.push({
        text: (
          <Box key={`${section.title}-${shortcut.key}`}>
            <Text color="cyan">{shortcut.key.padEnd(12)}</Text>
            <Text color="gray">{shortcut.description}</Text>
          </Box>
        ),
      });
    }
    allLines.push({ text: "" });
  }

  const visibleLines = allLines.slice(state.scrollOffset, state.scrollOffset + visibleRows);

  useInput((input: string, key: KeyInput) => {
    if (input === "?" || input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow) {
      navigation.moveUp();
    } else if (key.downArrow) {
      navigation.moveDown(allLines.length);
    } else if (key.pageUp) {
      navigation.pageUp(allLines.length);
    } else if (key.pageDown) {
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
        <Text bold color="cyan">Keyboard Shortcuts</Text>
        <Text color="gray"> - Press ? or b to close</Text>
      </Box>

      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
        {state.scrollOffset > 0 && <Text color="gray">↑ more above</Text>}

        {visibleLines.map((line, i) => {
          if (line.isHeader) {
            return (
              <Text key={i} bold color="yellow">
                {"\n"}{line.text as string}
              </Text>
            );
          }
          if (line.text === "") {
            return <Text key={i}> </Text>;
          }
          return <Box key={i} marginLeft={2}>{line.text}</Box>;
        })}

        {state.scrollOffset + visibleRows < allLines.length && (
          <Text color="gray">↓ more below</Text>
        )}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="cyan">↑↓</Text>
        <Text color="gray">: Scroll </Text>
        <Text color="cyan">PgUp/Dn</Text>
        <Text color="gray">: Page </Text>
        <Text color="cyan">?/b/Esc</Text>
        <Text color="gray">: Close</Text>
      </Box>
    </Box>
  );
}
