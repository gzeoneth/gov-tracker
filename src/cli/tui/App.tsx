/**
 * Main TUI Application Component
 *
 * Routes between views and manages global state.
 */

import { React, Box, Text, useApp } from "./ink-wrapper.js";
import { useEffect, useState, Component, type ReactNode, type ErrorInfo } from "react";
import type { ProviderBundle } from "../lib/cli.js";
import { useCache, useProposals, useNavigation, useTracker } from "./hooks/index.js";
import type { ProposalListItem } from "./types.js";
import { loadConfigWithStatus } from "./config.js";
import { ProposalList } from "./views/ProposalList.js";
import { ProposalDetail } from "./views/ProposalDetail.js";
import { CalldataView } from "./views/CalldataView.js";
import { StageView } from "./views/StageView.js";
import { SimulationView } from "./views/SimulationView.js";
import { DescriptionView } from "./views/DescriptionView.js";
import { ElectionView } from "./views/ElectionView.js";
import { HelpView } from "./views/HelpView.js";
import { SettingsView } from "./views/SettingsView.js";
import { isProposalView } from "./views/registry.js";
import { Spinner } from "./components/Spinner.js";
import { SkeletonList } from "./components/Skeleton.js";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("TUI Error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>Something went wrong</Text>
          <Text color="gray">{this.state.error?.message ?? "Unknown error"}</Text>
          <Text color="gray" marginTop={1}>Press q to quit</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}

export interface AppProps {
  cachePath: string;
  providers?: ProviderBundle;
  verbose?: boolean;
}

function useTerminalHeight(): number {
  const [height, setHeight] = useState(process.stdout.rows || 24);

  useEffect(() => {
    const handleResize = () => setHeight(process.stdout.rows || 24);
    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  return height;
}

export function App({ cachePath, providers: providerBundle, verbose }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const cache = useCache(cachePath);
  const navigation = useNavigation();
  const { items } = useProposals(cache.data, navigation.state.filter, navigation.state.searchQuery, navigation.state.sort);
  const tracker = useTracker({
    providers: providerBundle,
    cachePath,
    onDiscoveryComplete: cache.reload,
  });
  const terminalHeight = useTerminalHeight();
  const [configWarning, setConfigWarning] = useState<string | null>(null);

  useEffect(() => {
    const { warning } = loadConfigWithStatus();
    if (warning) {
      setConfigWarning(warning);
    }
  }, []);

  useEffect(() => {
    if (verbose && cache.error) {
      console.error("Cache error:", cache.error);
    }
  }, [verbose, cache.error]);

  useEffect(() => {
    if (tracker.lastResult && navigation.state.view === "detail") {
      void cache.reload();
    }
    // Only trigger on lastResult change; view check is a guard condition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker.lastResult]);

  const handleQuit = () => {
    exit();
  };

  if (cache.loading) {
    return (
      <Box flexDirection="column" height={terminalHeight} padding={1}>
        <Box marginBottom={1}>
          <Spinner text="Loading proposals..." />
        </Box>
        <SkeletonList rows={10} columns={[3, 45, 12, 10]} />
        <Box marginTop={1}>
          <Text color="gray">{cachePath}</Text>
        </Box>
      </Box>
    );
  }

  if (cache.error) {
    return (
      <Box flexDirection="column" height={terminalHeight} padding={1}>
        <Text color="red">Error loading cache:</Text>
        <Text color="gray">{cache.error}</Text>
        <Text color="gray" marginTop={1}>
          Press q to quit
        </Text>
      </Box>
    );
  }

  const { view, selectedProposal } = navigation.state;

  function renderView(): React.ReactElement {
    if (isProposalView(view)) {
      if (!selectedProposal) {
        navigation.back();
        return <Text>Returning to list...</Text>;
      }
      return renderProposalView(view, selectedProposal);
    }

    switch (view) {
      case "help":
        return <HelpView navigation={navigation} />;
      case "settings":
        return <SettingsView navigation={navigation} />;
      case "list":
        return (
          <ProposalList
            items={items}
            data={cache.data}
            navigation={navigation}
            tracker={tracker}
            onQuit={handleQuit}
            onReload={cache.reload}
          />
        );
      case "election":
        return (
          <ElectionView
            navigation={navigation}
            providers={providerBundle}
            cachePath={cachePath}
            discoverElections={tracker.discoverElections}
            isDiscovering={tracker.isTracking}
          />
        );
      default:
        return <Text>Unknown view: {view}</Text>;
    }
  }

  function renderProposalView(
    proposalView: typeof view,
    proposal: ProposalListItem
  ): React.ReactElement {
    switch (proposalView) {
      case "detail":
        return <ProposalDetail proposal={proposal} navigation={navigation} tracker={tracker} />;
      case "calldata":
        return <CalldataView proposal={proposal} navigation={navigation} />;
      case "stage":
        return <StageView proposal={proposal} navigation={navigation} />;
      case "simulation":
        return <SimulationView proposal={proposal} navigation={navigation} />;
      case "description":
        return <DescriptionView proposal={proposal} navigation={navigation} />;
      default:
        return <Text>Unknown proposal view: {proposalView}</Text>;
    }
  }

  return (
    <ErrorBoundary>
      <Box flexDirection="column" height={terminalHeight}>
        {configWarning && (
          <Box paddingX={1}>
            <Text color="yellow">[Warning] {configWarning}</Text>
          </Box>
        )}
        {renderView()}
      </Box>
    </ErrorBoundary>
  );
}
