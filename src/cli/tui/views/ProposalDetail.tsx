/**
 * Proposal detail view showing all stages
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import { type UseNavigationResult, STAGE_COUNT } from "../hooks/index.js";
import type { UseTrackerResult } from "../hooks/useTracker.js";
import { Header } from "../components/Header.js";
import { KeyHelp } from "../components/KeyHelp.js";
import { StageRow } from "../components/StageRow.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { VotingStats } from "../components/VotingStats.js";
import { StageProgress } from "../components/StageProgress.js";
import { getTxUrl, CHAIN_IDS } from "../../../constants.js";
import type { VotingActiveData } from "../../../types/stages.js";
import { useCopyState, CopyFeedback } from "../components/CopyableText.js";
import { ErrorBanner } from "../components/ErrorDisplay.js";

interface ProposalDetailProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
  tracker: UseTrackerResult;
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

export function ProposalDetail({
  proposal,
  navigation,
  tracker,
}: ProposalDetailProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const input = proposal.checkpoint.input;
  const { feedback, feedbackType, copy } = useCopyState();

  useInput((inputKey: string, key: KeyInput) => {
    if (inputKey === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || inputKey === "k") {
      navigation.moveUp();
    } else if (key.downArrow || inputKey === "j") {
      navigation.moveDown(STAGE_COUNT);
    } else if (key.return && stages[state.selectedStageIndex]) {
      navigation.goToStage(state.selectedStageIndex);
    } else if (inputKey === "c") {
      navigation.goToCalldata();
    } else if (inputKey === "s") {
      navigation.goToSimulation();
    } else if (inputKey === "d") {
      navigation.goToDescription();
    } else if (inputKey === "r" && tracker.canTrack && !tracker.isTracking) {
      void tracker.track(proposal);
    } else if (inputKey === "g") {
      navigation.goToTop();
    } else if (inputKey === "G") {
      navigation.goToBottom(STAGE_COUNT);
    } else if (inputKey >= "1" && inputKey <= "7") {
      const stageIndex = parseInt(inputKey, 10) - 1;
      if (stages[stageIndex]) {
        navigation.goToStage(stageIndex);
      }
    } else if (inputKey === "?") {
      navigation.goToHelp();
    } else if (inputKey === "y") {
      // Copy based on context - proposal ID by default
      const proposalId = getProposalIdDisplay();
      copy(proposalId, "Proposal ID");
    } else if (inputKey === "Y") {
      // Copy transaction hash
      const hash = getTxHash();
      if (hash) {
        copy(hash, "TX Hash");
      }
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

  const shortTitle = proposal.title.length > 40
    ? proposal.title.substring(0, 40) + "..."
    : proposal.title;

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="detail"
        filter={state.filter}
        stats={null}
        hasProviders={tracker.canTrack}
        isTracking={tracker.isTracking}
        title={proposal.title}
        position={{ current: state.selectedStageIndex + 1, total: STAGE_COUNT }}
        breadcrumb={["Proposals", shortTitle]}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {/* Stage progress with number hints */}
        <StageProgress stages={stages} currentIndex={state.selectedStageIndex} />

        {/* Metadata */}
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="gray">Type: </Text>
            <Text>{proposal.proposalType ?? proposal.type.toUpperCase()}</Text>
            <Text color="gray"> | Status: </Text>
            <StatusBadge status={proposal.status} />
          </Box>
          <Box>
            <Text color="gray">{input.type === "governor" ? "Proposal ID" : "Operation ID"}: </Text>
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
            <ErrorBanner error={tracker.error} />
            {tracker.canTrack && <Text color="gray">Press r to retry</Text>}
          </Box>
        )}

        {feedback && (
          <Box marginBottom={1}>
            <CopyFeedback message={feedback} type={feedbackType} />
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
            <Text color="gray"> No stages tracked yet</Text>
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
