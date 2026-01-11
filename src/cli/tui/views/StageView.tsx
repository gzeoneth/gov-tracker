/**
 * Stage detail view showing full stage information
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import type { TrackedStage, Chain } from "../../../types/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import { StatusBadge } from "../components/StatusBadge.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { getVisibleRows } from "../utils/index.js";
import { formatStageTitle } from "../../../utils/stage-metadata.js";
import { getTxUrl, CHAIN_IDS } from "../../../constants.js";

const CHAIN_TO_CHAIN_ID: Record<Chain, number> = {
  ethereum: CHAIN_IDS.ETHEREUM,
  arb1: CHAIN_IDS.ARB_ONE,
  nova: CHAIN_IDS.NOVA,
  unknown: CHAIN_IDS.ETHEREUM,
};

interface StageViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex object]";
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3) return safeStringify(value);
    return `[${value.length} items]`;
  }
  if (typeof value === "object") return safeStringify(value);
  return String(value);
}

function formatStageData(stage: TrackedStage): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const data = stage.data as Record<string, unknown> | undefined;

  if (!data) return items;

  const PRIORITY_FIELDS = [
    "proposalId",
    "operationId",
    "proposer",
    "description",
    "proposalState",
    "forVotes",
    "againstVotes",
    "abstainVotes",
    "quorum",
    "quorumReached",
    "timelockAddress",
    "eta",
    "state",
    "messageCount",
    "ticketCount",
    "redeemedCount",
  ];

  const SKIP_FIELDS = [
    "targets",
    "values",
    "calldatas",
    "signatures",
    "callScheduledData",
    "_rawBytesArray",
  ];

  for (const field of PRIORITY_FIELDS) {
    if (field in data && data[field] !== undefined) {
      let value = formatValue(data[field]);
      if (field === "description" && value.length > 100) {
        value = value.slice(0, 100) + "...";
      }
      items.push({ label: field, value });
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (PRIORITY_FIELDS.includes(key)) continue;
    if (SKIP_FIELDS.includes(key)) continue;
    if (value === undefined || value === null) continue;

    let formattedValue = formatValue(value);
    if (formattedValue.length > 80) {
      formattedValue = formattedValue.slice(0, 80) + "...";
    }
    items.push({ label: key, value: formattedValue });
  }

  return items;
}

const RESERVED_LINES = 14;

export function StageView({
  proposal,
  navigation,
}: StageViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const stage = stages[state.selectedStageIndex];

  const stageTitle = stage ? formatStageTitle(stage.type) : "";
  const dataItems = stage ? formatStageData(stage) : [];
  const visibleRows = getVisibleRows(RESERVED_LINES);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(dataItems.length);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(dataItems.length);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(dataItems.length);
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(dataItems.length);
    } else if (input === "?") {
      navigation.goToHelp();
    }
  });

  const shortTitle = proposal.title.length > 30
    ? proposal.title.substring(0, 30) + "..."
    : proposal.title;

  const breadcrumb = ["Proposals", shortTitle, stageTitle || "Stage"];

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
            const url = getTxUrl(CHAIN_TO_CHAIN_ID[tx.chain], tx.hash);
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
