/**
 * Keyboard shortcuts help footer
 */

import { React, Box, Text } from "../ink-wrapper";
import type { ViewType } from "../types";

interface KeyHelpProps {
  view: ViewType;
  hasProviders: boolean;
  hasExecutable?: boolean;
}

interface KeyBinding {
  key: string;
  action: string;
}

const LIST_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Navigate" },
  { key: "Enter", action: "View" },
  { key: "Tab", action: "Filter" },
  { key: "d", action: "Discover" },
  { key: "q", action: "Quit" },
];

const DETAIL_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Stage" },
  { key: "Enter", action: "Details" },
  { key: "d", action: "Description" },
  { key: "c", action: "Calldata" },
  { key: "s", action: "Simulate" },
  { key: "r", action: "Re-track" },
  { key: "b", action: "Back" },
];

const DETAIL_KEYS_NO_RPC: KeyBinding[] = [
  { key: "↑↓", action: "Stage" },
  { key: "Enter", action: "Details" },
  { key: "d", action: "Description" },
  { key: "c", action: "Calldata" },
  { key: "s", action: "Simulate" },
  { key: "b", action: "Back" },
];

const CALLDATA_KEYS: KeyBinding[] = [
  { key: "←→", action: "Actions" },
  { key: "↑↓", action: "Scroll" },
  { key: "b", action: "Back" },
];

const STAGE_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Scroll" },
  { key: "b", action: "Back" },
];

const SIMULATION_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Navigate" },
  { key: "b", action: "Back" },
];

const DESCRIPTION_KEYS: KeyBinding[] = [
  { key: "↑↓", action: "Scroll" },
  { key: "b", action: "Back" },
];

export function KeyHelp({ view, hasProviders }: KeyHelpProps): React.ReactElement {
  let keys: KeyBinding[];

  switch (view) {
    case "list":
      keys = hasProviders ? LIST_KEYS : LIST_KEYS.filter((k) => k.key !== "d");
      break;
    case "detail":
      keys = hasProviders ? DETAIL_KEYS : DETAIL_KEYS_NO_RPC;
      break;
    case "calldata":
      keys = CALLDATA_KEYS;
      break;
    case "stage":
      keys = STAGE_KEYS;
      break;
    case "simulation":
      keys = SIMULATION_KEYS;
      break;
    case "description":
      keys = DESCRIPTION_KEYS;
      break;
    default:
      keys = [];
  }

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      {keys.map((binding, i) => (
        <Box key={binding.key} marginRight={2}>
          <Text color="cyan">{binding.key}</Text>
          <Text color="gray">: {binding.action}</Text>
          {i < keys.length - 1 && <Text color="gray"> </Text>}
        </Box>
      ))}
    </Box>
  );
}
