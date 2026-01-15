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
import { getVisibleRows } from "../utils/index.js";
import { SearchBar } from "../components/SearchBar.js";
import { ErrorBanner } from "../components/ErrorDisplay.js";

interface ProposalListProps {
  items: ProposalListItem[];
  data: CacheData | null;
  navigation: UseNavigationResult;
  tracker: UseTrackerResult;
  onQuit: () => void;
  onReload: () => void;
}

const RESERVED_LINES = 8;

function getEmptyStateMessage(searchQuery: string, filter: string, totalCount: number): string {
  if (searchQuery) {
    return `No results for "${searchQuery}"`;
  }
  if (totalCount === 0) {
    return "Cache is empty";
  }
  return `No proposals match filter [${filter}]`;
}

function getEmptyStateHint(searchQuery: string, totalCount: number, canTrack: boolean): string {
  if (searchQuery) {
    return "Press / to modify search";
  }
  if (totalCount === 0) {
    return canTrack ? "Press d to discover proposals" : "Use --l2-rpc to enable discovery";
  }
  return "Press Tab to change filter";
}

export function ProposalList({
  items,
  data,
  navigation,
  tracker,
  onQuit,
  onReload,
}: ProposalListProps): React.ReactElement {
  const { state } = navigation;
  const selectedIndex = state.selectedIndex;
  const visibleRows = getVisibleRows(RESERVED_LINES);

  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, items.length - visibleRows))
  );
  const visibleItems = items.slice(startIndex, startIndex + visibleRows);

  const handleSearchInput = (input: string, key: KeyInput): void => {
    if (key.escape) {
      navigation.clearSearch();
    } else if (key.return) {
      navigation.finishSearch();
    } else if (key.backspace || key.delete) {
      navigation.deleteSearchChar();
    } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
      navigation.appendSearchChar(input);
    }
  };

  const handleNormalInput = (input: string, key: KeyInput): void => {
    const itemCount = items.length;

    switch (true) {
      case input === "q":
        onQuit();
        break;
      case input === "/":
        navigation.startSearch();
        break;
      case key.escape && !!state.searchQuery:
        navigation.setSearchQuery("");
        break;
      case key.upArrow || input === "k":
        navigation.moveUp();
        break;
      case key.downArrow || input === "j":
        navigation.moveDown(itemCount);
        break;
      case key.pageUp || (key.ctrl && input === "u"):
        navigation.pageUp(itemCount);
        break;
      case key.pageDown || (key.ctrl && input === "d"):
        navigation.pageDown(itemCount);
        break;
      case key.return:
        navigation.enter(items);
        break;
      case key.tab:
        navigation.cycleFilter();
        break;
      case input === "d" && !tracker.isTracking:
        void tracker.discover();
        break;
      case input === "e" && tracker.canTrack:
        navigation.goToElection();
        break;
      case input === "g":
        navigation.goToTop();
        break;
      case input === "G":
        navigation.goToBottom(itemCount);
        break;
      case input === "R":
        onReload();
        break;
      case input === "o":
        navigation.cycleSort();
        break;
      case input === "?":
        navigation.goToHelp();
        break;
      case input === "S":
        navigation.goToSettings();
        break;
    }
  };

  useInput((input: string, key: KeyInput) => {
    if (state.isSearching) {
      handleSearchInput(input, key);
    } else {
      handleNormalInput(input, key);
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="list"
        filter={state.filter}
        sort={state.sort}
        stats={data?.stats ?? null}
        hasProviders={tracker.canTrack}
        isTracking={tracker.isTracking}
        position={
          items.length > 0 ? { current: selectedIndex + 1, total: items.length } : undefined
        }
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        <SearchBar
          query={state.searchQuery}
          isActive={state.isSearching}
          resultCount={items.length}
        />

        {tracker.isTracking && tracker.progress && (
          <Box marginBottom={1}>
            <Text color="yellow">{tracker.progress}</Text>
          </Box>
        )}

        {tracker.error && (
          <Box marginBottom={1}>
            <ErrorBanner error={tracker.error} />
          </Box>
        )}

        {items.length === 0 ? (
          <Box flexDirection="column" alignItems="center" marginY={2}>
            <Text color="gray">
              {"    "}____{"\n"}
              {"   "}/ __ \{"\n"}
              {"  "}| |  | |{"\n"}
              {"  "}| |  | |{"\n"}
              {"  "}| |__| |{"\n"}
              {"   "}\____/{"\n"}
            </Text>
            <Text bold color="yellow">No proposals found</Text>
            <Text color="gray">{getEmptyStateMessage(state.searchQuery, state.filter, data?.stats?.total ?? 0)}</Text>
            <Box marginTop={1}>
              <Text color="cyan">{getEmptyStateHint(state.searchQuery, data?.stats?.total ?? 0, tracker.canTrack)}</Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            {startIndex > 0 && <Text color="gray"> ↑ {startIndex} more</Text>}
            {visibleItems.map((item, i) => (
              <ProposalRow
                key={item.key}
                item={item}
                isSelected={startIndex + i === selectedIndex}
              />
            ))}
            {startIndex + visibleRows < items.length && (
              <Text color="gray"> ↓ {items.length - startIndex - visibleRows} more</Text>
            )}
          </Box>
        )}
      </Box>

      <KeyHelp
        view="list"
        hasProviders={tracker.canTrack}
        context={{
          filter: state.filter,
          sort: state.sort,
          isSearching: state.isSearching,
          hasSearch: !!state.searchQuery,
        }}
      />
    </Box>
  );
}
