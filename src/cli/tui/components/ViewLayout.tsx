/**
 * Shared view layout component
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ViewType, FilterType } from "../types.js";
import { Header } from "./Header.js";
import { KeyHelp } from "./KeyHelp.js";
import { Spinner } from "./Spinner.js";
import { SkeletonList, Skeleton } from "./Skeleton.js";

type SkeletonType = "list" | "detail" | "text" | "none";

interface KeyHelpContext {
  calldataActionCount?: number;
  currentActionIndex?: number;
}

interface ViewLayoutProps {
  view: ViewType;
  filter?: FilterType;
  title?: string;
  hasProviders?: boolean;
  isTracking?: boolean;
  loading?: boolean;
  loadingText?: string;
  skeletonType?: SkeletonType;
  error?: string | null;
  breadcrumb?: string[];
  keyHelpContext?: KeyHelpContext;
  children: React.ReactNode;
}

function LoadingSkeleton({ type, text }: { type: SkeletonType; text: string }): React.ReactElement {
  if (type === "none") {
    return <Spinner text={text} />;
  }

  if (type === "list") {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Spinner text={text} />
        </Box>
        <SkeletonList rows={8} columns={[3, 45, 12, 10]} />
      </Box>
    );
  }

  if (type === "detail") {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Spinner text={text} />
        </Box>
        <Box flexDirection="column" gap={1}>
          <Skeleton width={60} />
          <Skeleton width={40} />
          <Box marginTop={1} flexDirection="column">
            <Skeleton width={70} />
            <Skeleton width={55} />
            <Skeleton width={65} />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Spinner text={text} />
      </Box>
      <Box flexDirection="column">
        <Skeleton width={80} />
        <Skeleton width={75} />
        <Skeleton width={70} />
        <Skeleton width={78} />
        <Skeleton width={60} />
      </Box>
    </Box>
  );
}

export function ViewLayout({
  view,
  filter = "all",
  title,
  hasProviders = false,
  isTracking = false,
  loading = false,
  loadingText = "Loading...",
  skeletonType = "none",
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
        hasProviders={hasProviders}
        isTracking={isTracking}
        title={title}
        breadcrumb={breadcrumb}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading && <LoadingSkeleton type={skeletonType} text={loadingText} />}
        {error && (
          <Box flexDirection="column">
            <Text color="red">Error: {error}</Text>
            <Text color="gray">Press b to go back</Text>
          </Box>
        )}
        {!loading && !error && children}
      </Box>

      <KeyHelp view={view} hasProviders={hasProviders} context={keyHelpContext} />
    </Box>
  );
}
