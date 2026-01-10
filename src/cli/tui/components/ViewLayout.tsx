/**
 * Shared view layout component
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ViewType, FilterType } from "../types.js";
import { Header } from "./Header.js";
import { KeyHelp } from "./KeyHelp.js";

interface ViewLayoutProps {
  view: ViewType;
  filter?: FilterType;
  title?: string;
  hasProviders?: boolean;
  isTracking?: boolean;
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  children: React.ReactNode;
}

export function ViewLayout({
  view,
  filter = "all",
  title,
  hasProviders = false,
  isTracking = false,
  loading = false,
  loadingText = "Loading...",
  error = null,
  children,
}: ViewLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column" height="100%">
      <Header
        view={view}
        filter={filter}
        stats={null}
        hasProviders={hasProviders}
        isTracking={isTracking}
        title={title}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading && <Text color="yellow">{loadingText}</Text>}
        {error && <Text color="red">Error: {error}</Text>}
        {!loading && !error && children}
      </Box>

      <KeyHelp view={view} hasProviders={hasProviders} />
    </Box>
  );
}
