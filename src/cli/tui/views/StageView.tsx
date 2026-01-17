/**
 * Stage detail view showing full stage information
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useScrollableInput } from "../hooks/useScrollableInput.js";
import { ViewLayout } from "../components/ViewLayout.js";
import { StatusBadge } from "../components/StatusBadge.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import {
  getVisibleRows,
  formatStageData,
  getStages,
  buildBreadcrumb,
} from "../utils/index.js";
import { formatStageTitle } from "../../../utils/stage-metadata.js";
import { getTxUrl } from "../../../constants.js";

interface StageViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

const RESERVED_LINES = 14;

export function StageView({
  proposal,
  navigation,
}: StageViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = getStages(proposal);
  const safeIndex = stages.length > 0 ? Math.min(state.selectedStageIndex, stages.length - 1) : 0;
  const stage = stages[safeIndex];

  const stageTitle = stage ? formatStageTitle(stage.type) : "";
  const dataItems = stage ? formatStageData(stage) : [];
  const visibleRows = getVisibleRows(RESERVED_LINES);

  useScrollableInput({
    navigation,
    itemCount: dataItems.length,
    extraHandlers: (input) => {
      if (input === "?") {
        navigation.goToHelp();
        return true;
      }
      return false;
    },
  });

  const breadcrumb = buildBreadcrumb(proposal, stageTitle || "Stage");

  if (!stage) {
    return (
      <ViewLayout view="stage" title={stageTitle} breadcrumb={breadcrumb}>
        <Text color="gray">Stage not found</Text>
      </ViewLayout>
    );
  }

  const visibleItems = dataItems.slice(state.scrollOffset, state.scrollOffset + visibleRows);

  return (
    <ViewLayout view="stage" title={stageTitle} breadcrumb={breadcrumb}>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold>{stageTitle}</Text>
          <Text> - </Text>
          <StatusBadge status={stage.status} />
        </Box>
        <Box><Text color="gray">Chain: </Text><Text>{stage.chain} ({stage.chainId})</Text></Box>
        {stage.executable && <Text color="green" bold>Executable!</Text>}
      </Box>

      {stage.transactions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Transactions:</Text>
          {stage.transactions.map((tx, i) => {
            const url = getTxUrl(tx.chainId, tx.hash);
            return (
              <Box key={i} flexDirection="column" marginLeft={1}>
                <Box><Text color="gray">[{i + 1}] </Text><Text color="blue">{tx.hash}</Text></Box>
                <Box marginLeft={2}>
                  <Text color="gray">Block {tx.blockNumber} on {tx.chain}{tx.timestamp && ` at ${new Date(tx.timestamp * 1000).toLocaleString()}`}</Text>
                </Box>
                {url && <Box marginLeft={2}><Text color="gray">URL: </Text><Text color="blue">{url}</Text></Box>}
              </Box>
            );
          })}
        </Box>
      )}

      {stage.timing && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Timing:</Text>
          <Box marginLeft={1} flexDirection="column">
            {stage.timing.startedAt && <Text color="gray">Started: {new Date(stage.timing.startedAt * 1000).toLocaleString()}</Text>}
            {stage.timing.eta && <Text color="gray">ETA: {new Date(stage.timing.eta * 1000).toLocaleString()}</Text>}
            {stage.timing.delaySeconds && <Text color="gray">Delay: {Math.floor(stage.timing.delaySeconds / 3600)}h</Text>}
          </Box>
        </Box>
      )}

      {dataItems.length > 0 && (
        <Box flexDirection="column">
          <Box>
            <Text bold>Data</Text>
            {dataItems.length > visibleRows && (
              <Box marginLeft={1}>
                <ScrollPosition
                  scrollOffset={state.scrollOffset}
                  visibleRows={visibleRows}
                  totalItems={dataItems.length}
                />
              </Box>
            )}
          </Box>
          <Box marginLeft={1}>
            <ScrollIndicatorTop scrollOffset={state.scrollOffset} />
          </Box>
          {visibleItems.map((item, i) => (
            <Box key={i} marginLeft={1}><Text color="cyan">{item.label}: </Text><Text>{item.value}</Text></Box>
          ))}
          <Box marginLeft={1}>
            <ScrollIndicatorBottom
              scrollOffset={state.scrollOffset}
              visibleRows={visibleRows}
              totalItems={dataItems.length}
            />
          </Box>
        </Box>
      )}

      {stage.error && <Box marginTop={1}><Text color="red">Error: {stage.error}</Text></Box>}
    </ViewLayout>
  );
}
