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
  { key: "↑↓/PgUp/Dn", action: "Navigate" },
  { key: "Enter", action: "View" },
  { key: "Tab", action: "Filter" },
  { key: "d", action: "Discover" },
  { key: "q", action: "Quit" },
];

const DETAIL_KEYS_BASE: KeyBinding[] = [
  { key: "↑↓", action: "Stage" },
  { key: "Enter", action: "Details" },
  { key: "d", action: "Description" },
  { key: "c", action: "Calldata" },
  { key: "s", action: "Simulate" },
];

const DETAIL_RETRACK: KeyBinding = { key: "r", action: "Re-track" };
const DETAIL_BACK: KeyBinding = { key: "b", action: "Back" };

const CALLDATA_KEYS: KeyBinding[] = [
  { key: "←→", action: "Actions" },
  { key: "↑↓/PgUp/Dn", action: "Scroll" },
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

function getKeysForView(view: ViewType, hasProviders: boolean): KeyBinding[] {
  switch (view) {
    case "list":
      return hasProviders ? LIST_KEYS : LIST_KEYS.filter((k) => k.key !== "d");
    case "detail":
      return hasProviders
        ? [...DETAIL_KEYS_BASE, DETAIL_RETRACK, DETAIL_BACK]
        : [...DETAIL_KEYS_BASE, DETAIL_BACK];
    case "calldata":
      return CALLDATA_KEYS;
    case "stage":
      return STAGE_KEYS;
    case "simulation":
      return SIMULATION_KEYS;
    case "description":
      return DESCRIPTION_KEYS;
    default:
      return [];
  }
}

export function KeyHelp({ view, hasProviders }: KeyHelpProps): React.ReactElement {
  const keys = getKeysForView(view, hasProviders);

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
