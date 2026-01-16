/**
 * Keyboard shortcuts help footer (cache-only mode)
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ViewType, FilterType, SortType } from "../types.js";

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

interface KeyBinding {
  key: string;
  action: string;
}

const LIST_KEYS: KeyBinding[] = [
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
];

const DETAIL_KEYS: KeyBinding[] = [
  { key: "j/k", action: "Stage" },
  { key: "1-7", action: "Jump" },
  { key: "Enter", action: "Details" },
  { key: "y/Y", action: "Copy ID/TX" },
  { key: "d", action: "Description" },
  { key: "c", action: "Calldata" },
  { key: "s", action: "Simulate" },
  { key: "?", action: "Help" },
  { key: "b", action: "Back" },
];

const CALLDATA_KEYS: KeyBinding[] = [
  { key: "←→", action: "Actions" },
  { key: "↑↓/PgUp/Dn", action: "Scroll" },
  { key: "g/G", action: "Top/Bottom" },
  { key: "e/c", action: "Expand/Collapse" },
  { key: "b", action: "Back" },
];

const STAGE_KEYS: KeyBinding[] = [
  { key: "↑↓/PgUp/Dn", action: "Scroll" },
  { key: "b", action: "Back" },
];

const SIMULATION_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Navigate" },
  { key: "b", action: "Back" },
];

const DESCRIPTION_KEYS: KeyBinding[] = [
  { key: "↑↓/PgUp/Dn", action: "Scroll" },
  { key: "b", action: "Back" },
];

const ELECTION_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Navigate" },
  { key: "b", action: "Back" },
];

function getKeysForView(view: ViewType): KeyBinding[] {
  switch (view) {
    case "list":
      return LIST_KEYS;
    case "detail":
      return DETAIL_KEYS;
    case "calldata":
      return CALLDATA_KEYS;
    case "stage":
      return STAGE_KEYS;
    case "simulation":
      return SIMULATION_KEYS;
    case "description":
      return DESCRIPTION_KEYS;
    case "election":
      return ELECTION_KEYS;
    default:
      return [];
  }
}

const SORT_DISPLAY: Record<SortType, string> = {
  newest: "Newest",
  oldest: "Oldest",
  progress: "Progress",
  status: "Status",
};

function ContextIndicators({ view, context }: { view: ViewType; context?: ContextInfo }): React.ReactElement | null {
  if (view !== "list" || !context) return null;

  const indicators: React.ReactElement[] = [];

  if (context.isSearching) {
    indicators.push(
      <Text key="search" color="yellow">[SEARCHING] </Text>
    );
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
        <Text color="blue">↕{SORT_DISPLAY[context.sort]}</Text>
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
  const keys = getKeysForView(view);

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <ContextIndicators view={view} context={context} />
      {view === "calldata" && <CalldataIndicator context={context} />}
      {keys.map((binding) => (
        <Box key={binding.key} marginRight={2}>
          <Text color="cyan">{binding.key}</Text>
          <Text color="gray">: {binding.action}</Text>
        </Box>
      ))}
    </Box>
  );
}
