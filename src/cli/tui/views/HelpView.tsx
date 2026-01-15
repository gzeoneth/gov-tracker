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
import { getVisibleRows, HELP_SECTIONS } from "../utils/index.js";

interface HelpViewProps {
  navigation: UseNavigationResult;
}

const RESERVED_LINES = 6;

interface HelpLine {
  text: React.ReactNode;
  type: "header" | "shortcut" | "spacer";
}

function buildHelpLines(): HelpLine[] {
  return HELP_SECTIONS.flatMap((section) => [
    { text: `${section.icon ?? "•"} ${section.title}`, type: "header" as const },
    ...section.shortcuts.map((shortcut) => ({
      text: (
        <Box key={`${section.title}-${shortcut.key}`}>
          <Text color="cyan">{shortcut.key.padEnd(12)}</Text>
          <Text>{shortcut.description}</Text>
          {shortcut.note && <Text color="gray"> ({shortcut.note})</Text>}
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

export function HelpView({ navigation }: HelpViewProps): React.ReactElement {
  const { state } = navigation;
  const visibleRows = getVisibleRows(RESERVED_LINES);
  const allLines = buildHelpLines();
  const visibleLines = allLines.slice(state.scrollOffset, state.scrollOffset + visibleRows);

  useInput((input: string, key: KeyInput) => {
    switch (true) {
      case input === "?" || input === "b" || key.escape:
        navigation.back();
        break;
      case key.upArrow || input === "k":
        navigation.moveUp();
        break;
      case key.downArrow || input === "j":
        navigation.moveDown(allLines.length);
        break;
      case key.pageUp || (key.ctrl && input === "u"):
        navigation.pageUp(allLines.length);
        break;
      case key.pageDown || (key.ctrl && input === "d"):
        navigation.pageDown(allLines.length);
        break;
      case input === "g":
        navigation.goToTop();
        break;
      case input === "G":
        navigation.goToBottom(allLines.length);
        break;
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
