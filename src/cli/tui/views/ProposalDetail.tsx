/**
 * Proposal detail view showing all stages
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import type { UseTrackerResult } from "../hooks/useTracker.js";
import { Header } from "../components/Header.js";
import { KeyHelp } from "../components/KeyHelp.js";
import { StageRow } from "../components/StageRow.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { getTxUrl, CHAIN_IDS } from "../../../constants.js";
import type { VotingActiveData } from "../../../types/stages.js";

interface ProposalDetailProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
  tracker: UseTrackerResult;
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) return "Unknown";
  return new Date(timestamp).toLocaleString();
}


interface VotingStatsProps {
  data: VotingActiveData;
}

function VotingStats({ data }: VotingStatsProps): React.ReactElement {
  const forPct = parseFloat(data.forVotes) || 0;
  const againstPct = parseFloat(data.againstVotes) || 0;
  const abstainPct = parseFloat(data.abstainVotes) || 0;
  const total = forPct + againstPct + abstainPct;

  const forBar = total > 0 ? Math.round((forPct / total) * 20) : 0;
  const againstBar = total > 0 ? Math.round((againstPct / total) * 20) : 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>Voting:</Text>
      <Box marginLeft={1} flexDirection="column">
        <Box>
          <Text color="green">For: {data.forVotes}</Text>
          <Text color="gray"> {"█".repeat(forBar)}{"░".repeat(20 - forBar)}</Text>
        </Box>
        <Box>
          <Text color="red">Against: {data.againstVotes}</Text>
          <Text color="gray"> {"█".repeat(againstBar)}{"░".repeat(20 - againstBar)}</Text>
        </Box>
        <Box>
          <Text color="gray">Abstain: {data.abstainVotes}</Text>
        </Box>
        <Box>
          <Text color="cyan">Quorum: {data.quorum}</Text>
          <Text color={data.quorumReached ? "green" : "yellow"}>
            {data.quorumReached ? " ✓ Reached" : " ○ Not reached"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export function ProposalDetail({
  proposal,
  navigation,
  tracker,
}: ProposalDetailProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const input = proposal.checkpoint.input;

  useInput((inputKey: string, key: KeyInput) => {
    if (inputKey === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow) {
      navigation.moveUp();
    } else if (key.downArrow) {
      navigation.moveDown(7);
    } else if (key.return && stages[state.selectedStageIndex]) {
      navigation.goToStage(state.selectedStageIndex);
    } else if (inputKey === "c") {
      navigation.goToCalldata();
    } else if (inputKey === "s") {
      navigation.goToSimulation();
    } else if (inputKey === "d") {
      navigation.goToDescription();
    } else if (inputKey === "r" && tracker.canTrack && !tracker.isTracking) {
      tracker.track(proposal);
    }
  });

  const getTxHash = (): string => {
    if (input.type === "governor") return input.creationTxHash;
    if (input.type === "timelock") return input.scheduledTxHash;
    return "";
  };

  const getProposalIdDisplay = (): string => {
    if (input.type === "governor") {
      return input.proposalId;
    }
    if (input.type === "timelock") {
      return input.operationId;
    }
    return "";
  };

  const txHash = getTxHash();
  const txUrl = txHash ? getTxUrl(CHAIN_IDS.ARB_ONE, txHash) : null;

  const votingStage = stages.find((s) => s.type === "VOTING_ACTIVE");
  const votingData = votingStage?.data as VotingActiveData | undefined;

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="detail"
        filter={state.filter}
        stats={null}
        hasProviders={tracker.canTrack}
        isTracking={tracker.isTracking}
        title={proposal.title}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {/* Metadata */}
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="gray">Type: </Text>
            <Text>{proposal.proposalType ?? proposal.type.toUpperCase()}</Text>
            <Text color="gray"> | Status: </Text>
            <StatusBadge status={proposal.status} />
          </Box>
          <Box>
            <Text color="gray">
              {input.type === "governor" ? "Proposal ID" : "Operation ID"}:{" "}
            </Text>
            <Text>{getProposalIdDisplay()}</Text>
          </Box>
          <Box>
            <Text color="gray">TX: </Text>
            <Text color="blue">{txHash}</Text>
          </Box>
          <Box>
            <Text color="gray">Created: </Text>
            <Text>{formatDate(proposal.createdAt)}</Text>
          </Box>
          {txUrl && (
            <Box>
              <Text color="gray">Explorer: </Text>
              <Text color="blue">{txUrl}</Text>
            </Box>
          )}
        </Box>

        {/* Tracking status */}
        {tracker.isTracking && tracker.progress && (
          <Box marginBottom={1}>
            <Text color="yellow">{tracker.progress}</Text>
          </Box>
        )}

        {tracker.error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {tracker.error}</Text>
          </Box>
        )}

        {/* Voting statistics */}
        {votingData && <VotingStats data={votingData} />}

        {/* Prepared transactions */}
        {tracker.preparedTxs.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="green" bold>
              Prepared Transactions ({tracker.preparedTxs.length}):
            </Text>
            {tracker.preparedTxs.map((tx, i) => (
              <Box key={i} marginLeft={1}>
                <Text color="gray">
                  [{i + 1}] {tx.description} on {tx.chain}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Stages */}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Stages:</Text>
          {stages.length === 0 ? (
            <Text color="gray">  No stages tracked yet</Text>
          ) : (
            stages.map((stage, i) => (
              <StageRow
                key={stage.type}
                stage={stage}
                index={i}
                isSelected={i === state.selectedStageIndex}
              />
            ))
          )}
          {/* Show placeholder for untracked stages */}
          {stages.length > 0 &&
            stages.length < 7 &&
            Array.from({ length: 7 - stages.length }).map((_, i) => (
              <Box key={`placeholder-${i}`}>
                <Text color="gray">
                  {"  "}
                  {stages.length + i + 1}. (not yet tracked)
                </Text>
              </Box>
            ))}
        </Box>
      </Box>

      <KeyHelp view="detail" hasProviders={tracker.canTrack} />
    </Box>
  );
}
