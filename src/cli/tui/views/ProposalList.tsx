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
import { EmptyState } from "../components/EmptyState.js";
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

  useInput((input: string, key: KeyInput) => {
    if (state.isSearching) {
      if (key.escape) {
        navigation.clearSearch();
      } else if (key.return) {
        navigation.finishSearch();
      } else if (key.backspace || key.delete) {
        navigation.deleteSearchChar();
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        navigation.appendSearchChar(input);
      }
      return;
    }

    if (input === "q") {
      onQuit();
      return;
    }

    if (input === "/") {
      navigation.startSearch();
    } else if (key.escape && state.searchQuery) {
      navigation.setSearchQuery("");
    } else if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(items.length);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(items.length);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(items.length);
    } else if (key.return) {
      navigation.enter(items);
    } else if (key.tab) {
      navigation.cycleFilter();
    } else if (input === "d" && !tracker.isTracking) {
      void tracker.discover();
    } else if (input === "e" && tracker.canTrack) {
      navigation.goToElection();
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(items.length);
    } else if (input === "R") {
      onReload();
    } else if (input === "o") {
      navigation.cycleSort();
    } else if (input === "?") {
      navigation.goToHelp();
    } else if (input === "S") {
      navigation.goToSettings();
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
          <EmptyState
            title="No proposals found"
            message={
              state.searchQuery
                ? `No results for "${state.searchQuery}"`
                : (data?.stats?.total ?? 0) === 0
                  ? "Cache is empty"
                  : `No proposals match filter [${state.filter}]`
            }
            hint={
              state.searchQuery
                ? "Press / to modify search"
                : (data?.stats?.total ?? 0) === 0
                  ? tracker.canTrack
                    ? "Press d to discover proposals"
                    : "Use --l2-rpc to enable discovery"
                  : "Press Tab to change filter"
            }
          />
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
