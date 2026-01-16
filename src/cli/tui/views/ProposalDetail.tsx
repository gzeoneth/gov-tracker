/**
 * Proposal detail view showing all stages (cache-only)
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import { type UseNavigationResult, STAGE_COUNT } from "../hooks/index.js";
import { Header } from "../components/Header.js";
import { KeyHelp } from "../components/KeyHelp.js";
import { StageRow } from "../components/StageRow.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { VotingStats } from "../components/VotingStats.js";
import { StageProgress } from "../components/StageProgress.js";
import { getTxUrl, CHAIN_IDS } from "../../../constants.js";
import { isStageType } from "../../../types/stages.js";
import { useCopyState, CopyFeedback } from "../components/CopyableText.js";
import { formatDate, getTxHash, getProposalIdDisplay } from "../utils/proposal-detail-helpers.js";
import { truncate } from "../utils/index.js";

interface ProposalDetailProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

export function ProposalDetail({
  proposal,
  navigation,
}: ProposalDetailProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const input = proposal.checkpoint.input;
  const { feedback, feedbackType, copy } = useCopyState();

  const txHash = getTxHash(input);
  const proposalId = getProposalIdDisplay(input);

  useInput((inputKey: string, key: KeyInput) => {
    if (inputKey === "b" || key.escape) return navigation.back();
    if (key.upArrow || inputKey === "k") return navigation.moveUp();
    if (key.downArrow || inputKey === "j") return navigation.moveDown(STAGE_COUNT);
    if (key.return && stages[state.selectedStageIndex]) return navigation.goToStage(state.selectedStageIndex);
    if (inputKey === "c") return navigation.goToCalldata();
    if (inputKey === "s") return navigation.goToSimulation();
    if (inputKey === "d") return navigation.goToDescription();
    if (inputKey === "g") return navigation.goToTop();
    if (inputKey === "G") return navigation.goToBottom(STAGE_COUNT);
    if (inputKey === "?") return navigation.goToHelp();
    if (inputKey === "y") return copy(proposalId, "Proposal ID");
    if (inputKey === "Y" && txHash) return copy(txHash, "TX Hash");

    if (inputKey >= "1" && inputKey <= "7") {
      const stageIndex = parseInt(inputKey, 10) - 1;
      if (stages[stageIndex]) navigation.goToStage(stageIndex);
    }
  });
  const txUrl = txHash ? getTxUrl(CHAIN_IDS.ARB_ONE, txHash) : null;

  const votingStage = stages.find((s) => isStageType(s, "VOTING_ACTIVE"));
  const votingData = votingStage?.data;

  const shortTitle = truncate(proposal.title, 40);

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="detail"
        filter={state.filter}
        stats={null}
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
            <Text>{proposalId}</Text>
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

        {feedback && (
          <Box marginBottom={1}>
            <CopyFeedback message={feedback} type={feedbackType} />
          </Box>
        )}

        {/* Voting statistics */}
        {votingData && <VotingStats data={votingData} />}

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

        {/* Hint for live tracking */}
        <Box marginTop={1}>
          <Text color="gray">(Run 'gov-tracker run' for live tracking)</Text>
        </Box>
      </Box>

      <KeyHelp view="detail" />
    </Box>
  );
}
