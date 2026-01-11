/**
 * Header component showing title and stats
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackerStats } from "../../../types/index.js";
import type { ViewType, FilterType } from "../types.js";

interface HeaderProps {
  view: ViewType;
  filter: FilterType;
  stats: TrackerStats | null;
  hasProviders: boolean;
  isTracking: boolean;
  title?: string;
  position?: { current: number; total: number };
  breadcrumb?: string[];
}

export function Header({
  view,
  filter,
  stats,
  hasProviders,
  isTracking,
  title,
  position,
  breadcrumb,
}: HeaderProps): React.ReactElement {
  const getViewTitle = (): string => {
    switch (view) {
      case "list":
        return "Gov-Tracker TUI [PREVIEW]";
      case "detail":
        return title ?? "Proposal Detail";
      case "calldata":
        return "Decoded Calldata";
      case "stage":
        return "Stage Details";
      case "simulation":
        return title ?? "Simulation Data";
      case "description":
        return title ?? "Proposal Description";
      default:
        return "Gov-Tracker";
    }
  };

  const getRightSide = (): React.ReactElement | null => {
    if (view === "list" && stats) {
      return (
        <Text color="gray">
          {stats.total} proposals | {stats.proposals.active} active
          {hasProviders && <Text color="green"> [RPC]</Text>}
          {isTracking && <Text color="yellow"> [Tracking...]</Text>}
        </Text>
      );
    }

    if (view === "detail" && hasProviders) {
      return (
        <Text color="gray">
          {isTracking ? (
            <Text color="yellow">Tracking...</Text>
          ) : (
            <Text color="green">[r] to re-track</Text>
          )}
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
            {getViewTitle()}
          </Text>
        )}
        {view === "list" && (
          <Text color="gray">
            {" "}
            [{filter.toUpperCase()}]
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
