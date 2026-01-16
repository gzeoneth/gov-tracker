/**
 * Shared view layout component
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ViewType, FilterType } from "../types.js";
import { Header } from "./Header.js";
import { KeyHelp } from "./KeyHelp.js";
import { Spinner } from "./Spinner.js";

interface KeyHelpContext {
  calldataActionCount?: number;
  currentActionIndex?: number;
}

interface ViewLayoutProps {
  view: ViewType;
  filter?: FilterType;
  title?: string;
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  breadcrumb?: string[];
  keyHelpContext?: KeyHelpContext;
  children: React.ReactNode;
}

export function ViewLayout({
  view,
  filter = "all",
  title,
  loading = false,
  loadingText = "Loading...",
  error = null,
  breadcrumb,
  keyHelpContext,
  children,
}: ViewLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column" height="100%">
      <Header
        view={view}
        filter={filter}
        stats={null}
        title={title}
        breadcrumb={breadcrumb}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading && <Spinner text={loadingText} />}
        {error && (
          <Box flexDirection="column">
            <Text color="red">Error: {error}</Text>
            <Text color="gray">Press b to go back</Text>
          </Box>
        )}
        {!loading && !error && children}
      </Box>

      <KeyHelp view={view} context={keyHelpContext} />
    </Box>
  );
}
