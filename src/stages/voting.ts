/**
 * Voting Stage Tracking
 *
 * Stage 2: Track voting period including extensions and vetting
 *
 * IMPORTANT: Vetting deadline uses L1 block numbers, not L2 block numbers.
 * When calculating ETA for vetting period, we must use L1 block time.
 */

import { ethers } from "ethers";
import { ProposalData, TypedTrackedStage, VotingData } from "../types";
import {
  getProposalState,
  getVotingData,
  detectProposalType,
} from "../discovery/governor-discovery";
import { checkVettingPeriod } from "../discovery/security-council";
import { StageBuilder } from "./builder";
import {
  getCurrentBlockInfo,
  calculateRemainingSeconds,
  getL1BlockNumberFromL2,
} from "../utils/timing";
import { BLOCK_TIMES } from "../constants";

/**
 * Track voting stage for a proposal
 */
export async function trackVotingStage(
  governorAddress: string,
  proposalId: string,
  proposalData: ProposalData,
  provider: ethers.providers.Provider
): Promise<{
  stage: TypedTrackedStage<"VOTING_ACTIVE">;
  votingData: VotingData | null;
}> {
  const builder = new StageBuilder("VOTING_ACTIVE", "arb1");

  // Get current block info (L2) and current L1 block in parallel.
  // Arbitrum governors anchor proposal.startBlock/endBlock to L1 block numbers
  // (via ArbSys), so gating "voting not started" must compare against L1.
  const [{ timestamp: currentTimestamp }, currentL1BlockBN] = await Promise.all([
    getCurrentBlockInfo(provider),
    getL1BlockNumberFromL2(provider),
  ]);
  const currentL1Block = currentL1BlockBN.toNumber();

  // Check if voting has started
  if (proposalData.startBlock.gt(currentL1Block)) {
    // Voting not started yet — short-circuit before calling the governor's
    // quorum(startBlock), which reverts with "Checkpoints: block not yet mined"
    // while startBlock is a future L1 block.
    const remainingSeconds = calculateRemainingSeconds(
      proposalData.startBlock.toNumber(),
      currentL1Block,
      BLOCK_TIMES.L1
    );

    builder
      .status("NOT_STARTED")
      .timing({ startedAt: currentTimestamp, eta: currentTimestamp + remainingSeconds })
      .data({
        startBlock: proposalData.startBlock.toString(),
        currentBlock: currentL1Block.toString(),
      });

    return { stage: builder.build(), votingData: null };
  }

  // Get voting data from governor
  const votingData = await getVotingData(governorAddress, proposalId, provider);

  // Check for vetting period - only Security Council governors have vetting
  const proposalType = detectProposalType(governorAddress);
  const isElectionProposal =
    proposalType === "ELECTION_NOMINEE" || proposalType === "ELECTION_MEMBER";

  const vettingInfo = isElectionProposal
    ? await checkVettingPeriod(governorAddress, proposalId, provider)
    : {
        hasVettingPeriod: false,
        vettingDeadline: null,
        isVettingActive: false,
        vetterAddress: null,
      };

  // Check if voting was extended
  const wasExtended =
    votingData.extendedDeadline !== undefined &&
    !votingData.extendedDeadline.eq(votingData.deadline);
  const extensionPossible = !votingData.isVotingPeriodOver && !votingData.hasReachedQuorum;

  // Format vote amounts for display (ARB tokens) - removes trailing zeros
  const formatVotes = (votes: ethers.BigNumber): string =>
    ethers.utils.formatEther(votes).replace(/\.?0+$/, "") + " ARB";

  // Add voting statistics
  builder.data({
    forVotes: formatVotes(votingData.forVotes),
    forVotesRaw: votingData.forVotes.toString(),
    againstVotes: formatVotes(votingData.againstVotes),
    againstVotesRaw: votingData.againstVotes.toString(),
    abstainVotes: formatVotes(votingData.abstainVotes),
    abstainVotesRaw: votingData.abstainVotes.toString(),
    quorum: formatVotes(votingData.quorum),
    quorumRaw: votingData.quorum.toString(),
    quorumReached: votingData.hasReachedQuorum,
    deadline: votingData.deadline.toString(),
    extendedDeadline: votingData.extendedDeadline?.toString(),
    wasExtended,
    extensionPossible,
    hasVettingPeriod: vettingInfo.hasVettingPeriod,
    vettingDeadline: vettingInfo.vettingDeadline?.toString(),
    isVettingActive: vettingInfo.isVettingActive,
  });

  // Determine voting status
  const proposalState = await getProposalState(governorAddress, proposalId, provider);
  builder.data({ proposalState });

  if (proposalState === "Active") {
    // votingData.deadline is an L1 block number (governor clock is L1).
    const remainingSeconds = calculateRemainingSeconds(
      votingData.deadline.toNumber(),
      currentL1Block,
      BLOCK_TIMES.L1
    );
    builder.status("PENDING").timing({
      startedAt: currentTimestamp,
      eta: currentTimestamp + remainingSeconds,
      delaySeconds: remainingSeconds,
    });
  } else if (
    proposalState === "Succeeded" ||
    proposalState === "Queued" ||
    proposalState === "Executed"
  ) {
    // Check vetting period first
    if (vettingInfo.isVettingActive && vettingInfo.vettingDeadline) {
      const currentL1Block = await getL1BlockNumberFromL2(provider);
      const remainingSeconds = calculateRemainingSeconds(
        vettingInfo.vettingDeadline.toNumber(),
        currentL1Block.toNumber(),
        BLOCK_TIMES.L1
      );
      builder
        .status("PENDING")
        .data({ waitingForVetting: true })
        .timing({
          eta: currentTimestamp + remainingSeconds,
          delaySeconds: remainingSeconds,
        });
    } else {
      builder.status("COMPLETED");
    }
  } else if (proposalState === "Canceled") {
    builder.status("CANCELED").data({ reason: "Proposal was canceled by proposer" });
  } else if (proposalState === "Defeated" || proposalState === "Expired") {
    builder.status("FAILED").data({ reason: proposalState });
  } else if (proposalState === "Pending") {
    builder.status("NOT_STARTED");
  }

  return { stage: builder.build(), votingData };
}
