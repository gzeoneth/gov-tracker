/**
 * Main proposal list view
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem, CacheData } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import type { UseTrackerResult } from "../hooks/useTracker.js";
import { Header } from "../components/Header.js";
import { KeyHelp } from "../components/KeyHelp.js";
import { ProposalRow } from "../components/ProposalRow.js";
import { getTerminalSize, getVisibleRows } from "../utils/index.js";

interface ProposalListProps {
  items: ProposalListItem[];
  data: CacheData | null;
  navigation: UseNavigationResult;
  tracker: UseTrackerResult;
  onQuit: () => void;
}

const RESERVED_LINES = 8;

export function ProposalList({
  items,
  data,
  navigation,
  tracker,
  onQuit,
}: ProposalListProps): React.ReactElement {
  const { state } = navigation;
  const selectedIndex = state.selectedIndex;
  const { width: terminalWidth } = getTerminalSize();
  const visibleRows = getVisibleRows(RESERVED_LINES);

  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleRows / 2), items.length - visibleRows)
  );
  const visibleItems = items.slice(startIndex, startIndex + visibleRows);

  useInput((input: string, key: KeyInput) => {
    if (input === "q") {
      onQuit();
      return;
    }

    if (key.upArrow) {
      navigation.moveUp();
    } else if (key.downArrow) {
      navigation.moveDown(items.length);
    } else if (key.pageUp) {
      navigation.pageUp(items.length);
    } else if (key.pageDown) {
      navigation.pageDown(items.length);
    } else if (key.return) {
      navigation.enter(items);
    } else if (key.tab) {
      navigation.cycleFilter();
    } else if (input === "d" && tracker.canTrack && !tracker.isTracking) {
      tracker.discover().then((result) => {
        if (result.proposals > 0 || result.timelocks > 0) {
          // Reload would happen via cache hook
        }
      });
    } else if (input === "e" && tracker.canTrack) {
      navigation.goToElection();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="list"
        filter={state.filter}
        stats={data?.stats ?? null}
        hasProviders={tracker.canTrack}
        isTracking={tracker.isTracking}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {tracker.isTracking && tracker.progress && (
          <Box marginBottom={1}>
            <Text color="yellow">{tracker.progress}</Text>
          </Box>
        )}

        {tracker.error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {tracker.error}</Text>
          </Box>
        )}

        {items.length === 0 ? (
          <Box marginY={1}>
            <Text color="gray">No proposals found for filter [{state.filter}]</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {startIndex > 0 && (
              <Text color="gray">  ↑ {startIndex} more</Text>
            )}
            {visibleItems.map((item, i) => (
              <ProposalRow
                key={item.key}
                item={item}
                isSelected={startIndex + i === selectedIndex}
                maxWidth={terminalWidth - 4}
              />
            ))}
            {startIndex + visibleRows < items.length && (
              <Text color="gray">  ↓ {items.length - startIndex - visibleRows} more</Text>
            )}
          </Box>
        )}
      </Box>

      <KeyHelp view="list" hasProviders={tracker.canTrack} />
    </Box>
  );
}
