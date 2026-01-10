/**
 * Main TUI Application Component
 *
 * Routes between views and manages global state.
 */

import { React, Box, Text, useApp } from "./ink-wrapper.js";
import { useEffect } from "react";
import type { ProviderBundle } from "../lib/cli.js";
import { useCache, useProposals, useNavigation, useTracker } from "./hooks/index.js";
import { ProposalList } from "./views/ProposalList.js";
import { ProposalDetail } from "./views/ProposalDetail.js";
import { CalldataView } from "./views/CalldataView.js";
import { StageView } from "./views/StageView.js";
import { SimulationView } from "./views/SimulationView.js";
import { DescriptionView } from "./views/DescriptionView.js";
import { ElectionView } from "./views/ElectionView.js";

export interface AppProps {
  cachePath: string;
  providers?: ProviderBundle;
  verbose?: boolean;
}

export function App({ cachePath, providers: providerBundle, verbose }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const cache = useCache(cachePath);
  const navigation = useNavigation();
  const { items } = useProposals(cache.data, navigation.state.filter);
  const tracker = useTracker({ providers: providerBundle, cachePath });

  useEffect(() => {
    if (verbose && cache.error) {
      console.error("Cache error:", cache.error);
    }
  }, [verbose, cache.error]);

  useEffect(() => {
    if (tracker.lastResult && navigation.state.view === "detail") {
      cache.reload();
    }
  }, [tracker.lastResult]);

  const handleQuit = () => {
    exit();
  };

  if (cache.loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Loading cache...</Text>
        <Text color="gray">{cachePath}</Text>
      </Box>
    );
  }

  if (cache.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error loading cache:</Text>
        <Text color="gray">{cache.error}</Text>
        <Text color="gray" marginTop={1}>
          Press q to quit
        </Text>
      </Box>
    );
  }

  const { view, selectedProposal } = navigation.state;

  if (view === "list") {
    return (
      <ProposalList
        items={items}
        data={cache.data}
        navigation={navigation}
        tracker={tracker}
        onQuit={handleQuit}
      />
    );
  }

  if (view === "election") {
    return <ElectionView navigation={navigation} providers={providerBundle} />;
  }

  if (!selectedProposal) {
    navigation.back();
    return <Text>Returning to list...</Text>;
  }

  switch (view) {
    case "detail":
      return (
        <ProposalDetail
          proposal={selectedProposal}
          navigation={navigation}
          tracker={tracker}
        />
      );

    case "calldata":
      return <CalldataView proposal={selectedProposal} navigation={navigation} />;

    case "stage":
      return <StageView proposal={selectedProposal} navigation={navigation} />;

    case "simulation":
      return <SimulationView proposal={selectedProposal} navigation={navigation} />;

    case "description":
      return <DescriptionView proposal={selectedProposal} navigation={navigation} />;

    default:
      return <Text>Unknown view: {view}</Text>;
  }
}
