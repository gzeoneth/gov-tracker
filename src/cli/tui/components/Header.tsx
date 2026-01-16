/**
 * Header component showing title and stats
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackerStats } from "../../../types/index.js";
import type { ViewType, FilterType, SortType } from "../types.js";
import { SORT_LABELS_SHORT } from "../utils/index.js";
import { getViewTitle } from "../views/registry.js";

interface HeaderProps {
  view: ViewType;
  filter: FilterType;
  sort?: SortType;
  stats: TrackerStats | null;
  title?: string;
  position?: { current: number; total: number };
  breadcrumb?: string[];
}

export function Header({
  view,
  filter,
  sort,
  stats,
  title,
  position,
  breadcrumb,
}: HeaderProps): React.ReactElement {
  const viewTitle = title ?? getViewTitle(view);

  const getRightSide = (): React.ReactElement | null => {
    if (view === "list" && stats) {
      const totalActive =
        stats.proposals.active + stats.timelocks.active + (stats.elections.total - stats.elections.complete);
      return (
        <Text color="gray">
          {stats.total} items | {totalActive} active
        </Text>
      );
    }

    return null;
  };

  const renderBreadcrumb = (): React.ReactElement | null => {
    if (!breadcrumb || breadcrumb.length === 0) return null;
    return (
      <Box>
        {breadcrumb.map((item, i) => (
          <Text key={i}>
            {i > 0 && <Text color="gray"> › </Text>}
            <Text color={i === breadcrumb.length - 1 ? "cyan" : "gray"}>{item}</Text>
          </Text>
        ))}
      </Box>
    );
  };

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box flexGrow={1}>
        {breadcrumb && breadcrumb.length > 0 ? (
          renderBreadcrumb()
        ) : (
          <Text bold color="cyan">
            {viewTitle}
          </Text>
        )}
        {view === "list" && (
          <Text color="gray">
            {" "}
            [{filter.toUpperCase()}] [{sort ? SORT_LABELS_SHORT[sort] : "↓New"}]
          </Text>
        )}
        {position && position.total > 0 && (
          <Text color="yellow"> {position.current}/{position.total}</Text>
        )}
      </Box>
      {getRightSide()}
    </Box>
  );
}
