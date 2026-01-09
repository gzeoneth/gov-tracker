/**
 * Proposal Created Stage Tracking
 *
 * Stage 1: Track ProposalCreated event from Governor contract
 */

import { ethers } from "ethers";
import { ProposalData, TypedTrackedStage } from "../types";
import { GOVERNANCE_START_BLOCKS } from "../constants";
import {
  findProposalCreatedEvent,
  findProposalByTxHash,
  detectProposalType,
} from "../discovery/governor-discovery";
import { getBlockTimestamp } from "./utils";
import { StageBuilder } from "./builder";

/**
 * Track proposal creation stage
 *
 * Entry point: Governor address + proposalId or creationTxHash
 */
export async function trackProposalCreated(
  governorAddress: string,
  proposalId: string,
  provider: ethers.providers.Provider,
  options: {
    creationTxHash?: string;
    fromBlock?: number;
  } = {}
): Promise<{
  stage: TypedTrackedStage<"PROPOSAL_CREATED">;
  proposalData: ProposalData | null;
}> {
  const builder = new StageBuilder("PROPOSAL_CREATED", "arb1");

  // Detect governor type
  const proposalType = detectProposalType(governorAddress);
  builder.data({ proposalType });

  // Try to find proposal data
  let proposalData: ProposalData | null = null;

  // Fast path: use creation tx hash if provided
  if (options.creationTxHash) {
    proposalData = await findProposalByTxHash(options.creationTxHash, provider);
  }

  // Fallback: search for ProposalCreated event
  if (!proposalData) {
    proposalData = await findProposalCreatedEvent(governorAddress, proposalId, provider, {
      startBlock: options.fromBlock ?? GOVERNANCE_START_BLOCKS.L2,
    });
  }

  if (proposalData) {
    // Stage completed - proposal was created
    const valuesArray = proposalData.values;
    const timestamp = await getBlockTimestamp(proposalData.creationBlock, provider);

    builder
      .status("COMPLETED")
      .tx(proposalData.creationTxHash, proposalData.creationBlock, "arb1", 42161, { timestamp })
      .timing({ startedAt: timestamp })
      .data({
        proposalId: proposalData.proposalId,
        proposer: proposalData.proposer,
        description: proposalData.description,
        startBlock: proposalData.startBlock.toString(),
        endBlock: proposalData.endBlock.toString(),
        targetCount: proposalData.targets.length,
        targets: proposalData.targets,
        values: valuesArray.map((v) => v.toString()),
        signatures: proposalData.signatures,
        calldatas: proposalData.calldatas,
      });
  } else {
    // Proposal not found - either not created yet or invalid
    builder.status("NOT_STARTED");
  }

  return { stage: builder.build(), proposalData };
}
