/**
 * Help view showing all keyboard shortcuts (cache-only mode)
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useScrollableInput } from "../hooks/useScrollableInput.js";
import { ScrollIndicatorTop, ScrollIndicatorBottom, ScrollPosition } from "../components/ScrollIndicator.js";
import { getVisibleRows } from "../utils/index.js";
import { HELP_SECTIONS } from "../utils/shortcuts.js";

interface HelpViewProps {
  navigation: UseNavigationResult;
}

interface HelpLine {
  content: React.ReactNode;
  type: "header" | "shortcut" | "spacer";
}

function buildHelpLines(): HelpLine[] {
  return HELP_SECTIONS.flatMap((section) => [
    { content: `${section.icon} ${section.title}`, type: "header" as const },
    ...section.shortcuts.map((s) => ({
      content: (
        <Box key={`${section.title}-${s.key}`}>
          <Text color="cyan">{s.key.padEnd(12)}</Text>
          <Text>{s.action}</Text>
          {s.note && <Text color="gray"> ({s.note})</Text>}
        </Box>
      ),
      type: "shortcut" as const,
    })),
    { content: "", type: "spacer" as const },
  ]);
}

function renderLine(line: HelpLine, index: number): React.ReactNode {
  if (line.type === "header") {
    return (
      <Box key={index} marginTop={index === 0 ? 0 : 1}>
        <Text bold color="yellow">{line.content as string}</Text>
      </Box>
    );
  }
  if (line.type === "shortcut") {
    return <Box key={index} marginLeft={2}>{line.content}</Box>;
  }
  return null;
}

const RESERVED_LINES = 6;

export function HelpView({ navigation }: HelpViewProps): React.ReactElement {
  const { state } = navigation;
  const visibleRows = getVisibleRows(RESERVED_LINES);
  const allLines = buildHelpLines();
  const visibleLines = allLines.slice(state.scrollOffset, state.scrollOffset + visibleRows);

  useScrollableInput({
    navigation,
    itemCount: allLines.length,
    extraHandlers: (input) => {
      if (input === "?") {
        navigation.back();
        return true;
      }
      return false;
    },
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
            <ScrollPosition scrollOffset={state.scrollOffset} visibleRows={visibleRows} totalItems={allLines.length} />
          </Box>
        )}
        <ScrollIndicatorTop scrollOffset={state.scrollOffset} />

        {visibleLines.map(renderLine)}

        <ScrollIndicatorBottom scrollOffset={state.scrollOffset} visibleRows={visibleRows} totalItems={allLines.length} />
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
