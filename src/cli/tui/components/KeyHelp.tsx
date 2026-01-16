/**
 * Keyboard shortcuts help footer (cache-only mode)
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ViewType, FilterType, SortType } from "../types.js";
import { getShortcutsForView } from "../utils/shortcuts.js";
import { SORT_LABELS } from "../utils/index.js";

interface ContextInfo {
  filter?: FilterType;
  sort?: SortType;
  isSearching?: boolean;
  hasSearch?: boolean;
  calldataActionCount?: number;
  currentActionIndex?: number;
}

interface KeyHelpProps {
  view: ViewType;
  context?: ContextInfo;
}

function ContextIndicators({ view, context }: { view: ViewType; context?: ContextInfo }): React.ReactElement | null {
  if (view !== "list" || !context) return null;

  const indicators: React.ReactElement[] = [];

  if (context.isSearching) {
    indicators.push(<Text key="search" color="yellow">[SEARCHING] </Text>);
  } else if (context.hasSearch) {
    indicators.push(
      <Box key="search-active" marginRight={1}>
        <Text color="green">⚲ </Text>
        <Text color="gray">Esc:Clear</Text>
      </Box>
    );
  }

  if (context.filter && context.filter !== "all") {
    indicators.push(
      <Box key="filter" marginRight={1}>
        <Text color="magenta">{context.filter.toUpperCase()}</Text>
      </Box>
    );
  }

  if (context.sort && context.sort !== "newest") {
    indicators.push(
      <Box key="sort" marginRight={1}>
        <Text color="blue">↕{SORT_LABELS[context.sort]}</Text>
      </Box>
    );
  }

  if (indicators.length === 0) return null;

  return (
    <Box marginRight={2}>
      {indicators}
      <Text color="gray">│</Text>
    </Box>
  );
}

function CalldataIndicator({ context }: { context?: ContextInfo }): React.ReactElement | null {
  if (!context?.calldataActionCount || context.calldataActionCount <= 1) return null;

  return (
    <Box marginRight={2}>
      <Text color="yellow">Action {(context.currentActionIndex ?? 0) + 1}/{context.calldataActionCount}</Text>
      <Text color="gray"> │</Text>
    </Box>
  );
}

export function KeyHelp({ view, context }: KeyHelpProps): React.ReactElement {
  const shortcuts = getShortcutsForView(view);

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <ContextIndicators view={view} context={context} />
      {view === "calldata" && <CalldataIndicator context={context} />}
      {shortcuts.map((s) => (
        <Box key={s.key} marginRight={2}>
          <Text color="cyan">{s.key}</Text>
          <Text color="gray">: {s.action}</Text>
        </Box>
      ))}
    </Box>
  );
}
