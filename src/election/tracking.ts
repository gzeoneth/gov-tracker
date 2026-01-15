import { ethers, BigNumber } from "ethers";
import { ADDRESSES, TIMING, CHUNK_SIZES, proposalStateToString } from "../constants";
import { queryWithRetry } from "../utils/rpc-utils";
import {
  CohortType,
  ElectionProposalStatus,
  ProposalState,
  ProposalCreatedEventArgs,
  TrackedStage,
} from "../types";
import { StageBuilder } from "../stages/builder";
import { getL1BlockNumberFromL2, getFirstL2BlockForL1Block } from "../utils/timing";
import { loggers } from "../utils/logger";
import {
  proposalCreatedInterface,
  proposalExecutedInterface,
  nomineeElectionGovernorInterface,
} from "../abis";
import { getNomineeGovernor, getMemberGovernor } from "./contracts";
import {
  computeElectionProposalId,
  getElectionProposalId,
  getElectionProposalIds,
} from "./proposal-ids";
import { multicall, buildCallInput } from "../utils/multicall";
import { findCallScheduledByTxHash } from "../discovery/timelock-discovery";
import { trackL2Timelock, trackL1Timelock } from "../stages/timelock";
import { trackL2ToL1Message } from "../stages/l2-to-l1-message";
import { trackRetryables } from "../stages/retryables";
import { determineElectionPhase, checkElectionStatus } from "./status";
import { findLog } from "../utils/log-search";

const log = loggers.election;

interface EventSearchResult {
  txHash: string;
  blockNumber: number;
}

async function findElectionCreationTxHash(
  proposalId: string,
  governorAddress: string,
  provider: ethers.providers.Provider,
  electionIndex: number,
  l2ChunkSize: number = CHUNK_SIZES.L2
): Promise<EventSearchResult | null> {
  const governor = getNomineeGovernor(governorAddress, provider);
  const topic = proposalCreatedInterface.getEventTopic("ProposalCreated");

  const snapshotL1 = await queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId));

  const ELECTION_VOTING_DELAY_L1_BLOCKS = 7 * 24 * 60 * 5; // 50400 blocks
  const creationL1Block =
    electionIndex === 0
      ? snapshotL1.toNumber()
      : snapshotL1.toNumber() - ELECTION_VOTING_DELAY_L1_BLOCKS;

  const creationL2 = await getFirstL2BlockForL1Block(provider, creationL1Block);
  if (!creationL2) {
    return null;
  }

  const searchRange = Math.min(l2ChunkSize, 100000);
  const fromBlock = Math.max(0, creationL2 - searchRange);
  const toBlock = creationL2 + searchRange;

  const matchingLog = await findLog(
    provider,
    { address: governorAddress, topics: [topic], fromBlock, toBlock },
    (eventLog) => {
      try {
        const parsed = proposalCreatedInterface.parseLog(eventLog);
        const args = parsed.args as unknown as ProposalCreatedEventArgs;
        return args.proposalId.toString() === proposalId;
      } catch {
        return false;
      }
    },
    { chunkSize: l2ChunkSize }
  );

  if (!matchingLog) {
    return null;
  }

  return {
    txHash: matchingLog.transactionHash,
    blockNumber: matchingLog.blockNumber,
  };
}

async function findElectionExecuteTxHash(
  proposalId: string,
  governorAddress: string,
  provider: ethers.providers.Provider,
  l2ChunkSize: number = CHUNK_SIZES.L2
): Promise<EventSearchResult | null> {
  const governor = getNomineeGovernor(governorAddress, provider);
  const topic = proposalExecutedInterface.getEventTopic("ProposalExecuted");

  const snapshotL1 = await queryWithRetry<BigNumber>(() => governor.proposalSnapshot(proposalId));

  const snapshotL2 = await getFirstL2BlockForL1Block(provider, snapshotL1.toNumber());
  if (!snapshotL2) {
    return null;
  }

  const currentBlock = await queryWithRetry(() => provider.getBlockNumber());

  const matchingLog = await findLog(
    provider,
    { address: governorAddress, topics: [topic], fromBlock: snapshotL2, toBlock: currentBlock },
    (eventLog) => {
      try {
        const parsed = proposalExecutedInterface.parseLog(eventLog);
        return parsed.args.proposalId.toString() === proposalId;
      } catch {
        return false;
      }
    },
    { chunkSize: l2ChunkSize }
  );

  if (!matchingLog) {
    return null;
  }

  return {
    txHash: matchingLog.transactionHash,
    blockNumber: matchingLog.blockNumber,
  };
}

interface PostMemberExecuteResult {
  l2TimelockStage?: TrackedStage;
  l2ToL1Stage?: TrackedStage;
  l1TimelockStage?: TrackedStage;
  retryableStage?: TrackedStage;
  operationId?: string;
  l2ExecutionTxHash?: string;
  l1ExecutionTxHash?: string;
}

async function trackPostMemberExecuteStages(
  memberExecuteTxHash: string,
  memberExecuteBlock: number,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  novaProvider?: ethers.providers.Provider,
  l2ChunkSize: number = CHUNK_SIZES.L2
): Promise<PostMemberExecuteResult> {
  const result: PostMemberExecuteResult = {};

  const callScheduledEvents = await findCallScheduledByTxHash(memberExecuteTxHash, l2Provider);
  if (!callScheduledEvents || callScheduledEvents.length === 0) {
    log("No CallScheduled event found in member execute tx %s", memberExecuteTxHash);
    return result;
  }

  const firstEvent = callScheduledEvents[0];
  result.operationId = firstEvent.operationId;
  log("Found L2 timelock operation %s from member execute", firstEvent.operationId);

  const l2TimelockResult = await trackL2Timelock(
    firstEvent.timelockAddress,
    firstEvent.operationId,
    l2Provider,
    memberExecuteBlock,
    firstEvent,
    { chunkSize: l2ChunkSize }
  );
  result.l2TimelockStage = l2TimelockResult.stage;

  if (l2TimelockResult.stage.status !== "COMPLETED" || !l2TimelockResult.executionTxHash) {
    return result;
  }
  result.l2ExecutionTxHash = l2TimelockResult.executionTxHash;

  const l2ToL1Result = await trackL2ToL1Message(
    l2TimelockResult.executionTxHash,
    l2Provider,
    l1Provider,
    { chunkSize: l2ChunkSize }
  );
  result.l2ToL1Stage = l2ToL1Result.stage;

  if (l2ToL1Result.stage.status !== "COMPLETED" || !l2ToL1Result.outboxExecutionTx) {
    return result;
  }

  const l1TimelockResult = await trackL1Timelock(l1Provider, {
    outboxExecutionTx: l2ToL1Result.outboxExecutionTx,
    chunkSize: l2ChunkSize,
    allStages: [l2ToL1Result.stage],
  });
  result.l1TimelockStage = l1TimelockResult.stage;

  if (l1TimelockResult.stage.status !== "COMPLETED" || !l1TimelockResult.executionTxHash) {
    return result;
  }
  result.l1ExecutionTxHash = l1TimelockResult.executionTxHash;

  const retryableResult = await trackRetryables(l1TimelockResult.executionTxHash, l1Provider, {
    l2Provider,
    novaProvider,
  });
  result.retryableStage = retryableResult.stage;

  return result;
}

export async function trackElectionProposal(
  electionIndex: number,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: {
    nomineeGovernorAddress?: string;
    memberGovernorAddress?: string;
    novaProvider?: ethers.providers.Provider;
    l2BlockNumber?: number;
    timestamp?: number;
    skipCache?: boolean;
  } = {}
): Promise<ElectionProposalStatus> {
  const nomineeGovernorAddress =
    options.nomineeGovernorAddress ?? ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const memberGovernorAddress = options.memberGovernorAddress ?? ADDRESSES.ELECTION_MEMBER_GOVERNOR;

  log("trackElectionProposal for index %d", electionIndex);

  const nomineeGovernor = getNomineeGovernor(nomineeGovernorAddress, l2Provider);
  const memberGovernor = getMemberGovernor(memberGovernorAddress, l2Provider);

  const cohort = (await queryWithRetry<number>(() =>
    nomineeGovernor.electionIndexToCohort(electionIndex)
  )) as CohortType;

  const nomineeProposalId = await getElectionProposalId(
    electionIndex,
    l2Provider,
    nomineeGovernorAddress
  );

  if (!nomineeProposalId) {
    return {
      electionIndex,
      phase: "NOT_STARTED",
      cohort,
      nomineeProposalId: null,
      memberProposalId: null,
      nomineeProposalState: null,
      memberProposalState: null,
      compliantNomineeCount: 0,
      targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
      vettingDeadline: null,
      isInVettingPeriod: false,
      canProceedToMemberPhase: false,
      canExecuteMember: false,
    };
  }

  const [nomineeResults, currentL1Block] = await Promise.all([
    multicall(l2Provider, [
      buildCallInput<number>(nomineeGovernorAddress, nomineeElectionGovernorInterface, "state", [
        nomineeProposalId,
      ]),
      buildCallInput<BigNumber>(
        nomineeGovernorAddress,
        nomineeElectionGovernorInterface,
        "proposalVettingDeadline",
        [nomineeProposalId]
      ),
      buildCallInput<BigNumber>(
        nomineeGovernorAddress,
        nomineeElectionGovernorInterface,
        "compliantNomineeCount",
        [nomineeProposalId]
      ),
    ]),
    getL1BlockNumberFromL2(l2Provider),
  ]);

  const nomineeState = nomineeResults[0] as number;
  const nomineeProposalState = proposalStateToString(nomineeState);
  const vettingDeadlineBN = (nomineeResults[1] as BigNumber) ?? BigNumber.from(0);
  const vettingDeadline = vettingDeadlineBN.toNumber();
  const compliantNomineeCount = ((nomineeResults[2] as BigNumber) ?? BigNumber.from(0)).toNumber();

  const isInVettingPeriod =
    nomineeProposalState === "Succeeded" && currentL1Block.lte(vettingDeadlineBN);

  let memberProposalId: string | null = null;
  let memberProposalState: ProposalState | null = null;

  const computedMemberProposalId = await computeElectionProposalId(electionIndex, memberGovernor);

  try {
    const memberState: number = await queryWithRetry(() =>
      memberGovernor.state(computedMemberProposalId)
    );
    memberProposalId = computedMemberProposalId;
    memberProposalState = proposalStateToString(memberState);
  } catch {
    // Member election not yet created
  }

  const phase = determineElectionPhase(
    nomineeProposalState,
    memberProposalId,
    memberProposalState,
    isInVettingPeriod
  );

  const canProceedToMemberPhase =
    nomineeProposalState === "Succeeded" &&
    !isInVettingPeriod &&
    compliantNomineeCount >= TIMING.SECURITY_COUNCIL_TARGET_NOMINEES &&
    !memberProposalId;

  const canExecuteMember = memberProposalState === "Succeeded";

  const stages: TrackedStage[] = [];
  let creationTxHash: string | undefined;
  let nomineeExecuteTxHash: string | undefined;
  let memberExecuteTxHash: string | undefined;
  let failureReason: string | undefined;

  const createStage = new StageBuilder("CREATE_ELECTION", "arb1").status("COMPLETED").data({
    electionIndex,
    cohort,
    startTimestamp: 0,
    nomineeProposalId,
  });

  try {
    const creationEvent = await findElectionCreationTxHash(
      nomineeProposalId,
      nomineeGovernorAddress,
      l2Provider,
      electionIndex
    );
    if (creationEvent) {
      creationTxHash = creationEvent.txHash;
      createStage.tx(creationEvent.txHash, creationEvent.blockNumber, "arb1", 42161);
    }
  } catch {
    // TX hash discovery failed, continue without it
  }
  stages.push(createStage.build());

  const nomineeElectionStage = new StageBuilder("NOMINEE_ELECTION", "arb1").data({
    nomineeProposalId,
    proposalState: nomineeProposalState,
    contenderCount: 0,
    compliantNomineeCount,
    targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
  });

  if (nomineeProposalState === "Active" || nomineeProposalState === "Pending") {
    nomineeElectionStage.status("PENDING");
  } else if (nomineeProposalState === "Defeated" || nomineeProposalState === "Canceled") {
    nomineeElectionStage.status("FAILED");
    failureReason = `Nominee election ${nomineeProposalState.toLowerCase()}`;
  } else {
    nomineeElectionStage.status("COMPLETED");
  }
  stages.push(nomineeElectionStage.build());

  if (nomineeProposalState === "Succeeded" || nomineeProposalState === "Executed") {
    const vettingStage = new StageBuilder("NOMINEE_VETTING", "arb1").data({
      nomineeProposalId,
      vettingDeadline,
      currentL1Block: currentL1Block.toNumber(),
      compliantNomineeCount,
      memberProposalId: memberProposalId ?? undefined,
    });

    if (nomineeProposalState === "Executed" || memberProposalId) {
      vettingStage.status("COMPLETED");
      try {
        const executeEvent = await findElectionExecuteTxHash(
          nomineeProposalId,
          nomineeGovernorAddress,
          l2Provider
        );
        if (executeEvent) {
          nomineeExecuteTxHash = executeEvent.txHash;
          vettingStage.tx(executeEvent.txHash, executeEvent.blockNumber, "arb1", 42161);
        }
      } catch {
        // TX hash discovery failed, continue without it
      }
    } else if (canProceedToMemberPhase) {
      vettingStage.status("READY");
    } else if (isInVettingPeriod) {
      vettingStage.status("PENDING");
    } else if (compliantNomineeCount < TIMING.SECURITY_COUNCIL_TARGET_NOMINEES) {
      vettingStage.status("FAILED");
      failureReason = `Only ${compliantNomineeCount}/${TIMING.SECURITY_COUNCIL_TARGET_NOMINEES} compliant nominees`;
    }
    stages.push(vettingStage.build());
  }

  let timelockOperationId: string | undefined;
  let memberExecuteBlock: number | undefined;

  if (memberProposalId && memberProposalState) {
    const memberStage = new StageBuilder("MEMBER_ELECTION", "arb1").data({
      memberProposalId,
      proposalState: memberProposalState,
      winnersCount: 0,
    });

    if (memberProposalState === "Active" || memberProposalState === "Pending") {
      memberStage.status("PENDING");
    } else if (memberProposalState === "Succeeded") {
      memberStage.status("READY");
    } else if (memberProposalState === "Executed") {
      memberStage.status("COMPLETED");
      try {
        const executeEvent = await findElectionExecuteTxHash(
          memberProposalId,
          memberGovernorAddress,
          l2Provider
        );
        if (executeEvent) {
          memberExecuteTxHash = executeEvent.txHash;
          memberExecuteBlock = executeEvent.blockNumber;
          memberStage.tx(executeEvent.txHash, executeEvent.blockNumber, "arb1", 42161);
        }
      } catch {
        // TX hash discovery failed, continue without it
      }
    } else if (memberProposalState === "Defeated" || memberProposalState === "Canceled") {
      memberStage.status("FAILED");
      failureReason = `Member election ${memberProposalState.toLowerCase()}`;
    }
    stages.push(memberStage.build());
  }

  if (memberProposalState === "Executed" && memberExecuteTxHash && memberExecuteBlock) {
    try {
      const postExecuteResult = await trackPostMemberExecuteStages(
        memberExecuteTxHash,
        memberExecuteBlock,
        l2Provider,
        l1Provider,
        options.novaProvider
      );

      timelockOperationId = postExecuteResult.operationId;

      if (postExecuteResult.l2TimelockStage) {
        stages.push(postExecuteResult.l2TimelockStage);
      }
      if (postExecuteResult.l2ToL1Stage) {
        stages.push(postExecuteResult.l2ToL1Stage);
      }
      if (postExecuteResult.l1TimelockStage) {
        stages.push(postExecuteResult.l1TimelockStage);
      }
      if (postExecuteResult.retryableStage) {
        stages.push(postExecuteResult.retryableStage);
      }
    } catch (err) {
      log("Failed to track post-member-execute stages: %s", (err as Error).message);
    }
  }

  return {
    electionIndex,
    phase,
    cohort,
    nomineeProposalId,
    memberProposalId,
    nomineeProposalState,
    memberProposalState,
    compliantNomineeCount,
    targetNomineeCount: TIMING.SECURITY_COUNCIL_TARGET_NOMINEES,
    vettingDeadline,
    isInVettingPeriod,
    canProceedToMemberPhase,
    canExecuteMember,
    stages,
    isFailed: failureReason ? true : undefined,
    failureReason,
    timelockOperationId,
    creationTxHash,
    nomineeExecuteTxHash,
    memberExecuteTxHash,
  };
}

export async function trackAllElections(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: {
    includeNext?: boolean;
    novaProvider?: ethers.providers.Provider;
    l2BlockNumber?: number;
    timestamp?: number;
    skipCache?: boolean;
  } = {}
): Promise<ElectionProposalStatus[]> {
  log("trackAllElections: fetching all active elections");

  const status = await checkElectionStatus(l2Provider, l1Provider);
  const electionCount = status.electionCount;
  const results: ElectionProposalStatus[] = [];

  for (let i = 0; i < electionCount; i++) {
    try {
      const electionStatus = await trackElectionProposal(i, l2Provider, l1Provider, {
        novaProvider: options.novaProvider,
        l2BlockNumber: options.l2BlockNumber,
        timestamp: options.timestamp,
        skipCache: options.skipCache,
      });
      results.push(electionStatus);
    } catch (err) {
      log("Failed to track election %d: %s", i, err);
    }
  }

  if (options.includeNext ?? true) {
    try {
      const nextElectionStatus = await trackElectionProposal(
        electionCount,
        l2Provider,
        l1Provider,
        {
          novaProvider: options.novaProvider,
          l2BlockNumber: options.l2BlockNumber,
          timestamp: options.timestamp,
          skipCache: options.skipCache,
        }
      );
      results.push({
        ...nextElectionStatus,
        canCreateElection: status.canCreateElection,
        secondsUntilElection: status.secondsUntilElection,
        timeUntilElection: status.timeUntilElection,
      } as ElectionProposalStatus);
    } catch (err) {
      log("Failed to track next election %d: %s", electionCount, err);
    }
  }

  log("Tracked %d elections", results.length);
  return results;
}

export async function trackIncompleteElections(
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: {
    novaProvider?: ethers.providers.Provider;
    l2BlockNumber?: number;
    timestamp?: number;
    skipCache?: boolean;
  } = {}
): Promise<ElectionProposalStatus[]> {
  const all = await trackAllElections(l2Provider, l1Provider, {
    novaProvider: options.novaProvider,
    l2BlockNumber: options.l2BlockNumber,
    timestamp: options.timestamp,
    skipCache: options.skipCache,
  });
  return all.filter((e) => e.phase !== "COMPLETED");
}

export async function getElectionIndexForProposalId(
  proposalId: string,
  l2Provider: ethers.providers.Provider,
  l1Provider: ethers.providers.Provider,
  options: { novaProvider?: ethers.providers.Provider; blockNumber?: number } = {}
): Promise<number | null> {
  const { blockNumber } = options;
  log("getElectionIndexForProposalId: searching for proposal %s", proposalId);

  const status = await checkElectionStatus(l2Provider, l1Provider);
  const electionCount = status.electionCount;

  for (let i = electionCount - 1; i >= 0; i--) {
    log("checking election %d", i);
    try {
      const { nomineeProposalId, memberProposalId } = await getElectionProposalIds(i, l2Provider, {
        blockNumber,
      });
      log("got election %d proposal IDs", i);

      const nomMatch = nomineeProposalId === proposalId;
      const memMatch = memberProposalId === proposalId;

      log("election %d: nomId=%s nomMatch=%s", i, nomineeProposalId, nomMatch);

      if (nomMatch) {
        log("Found proposal %s as nominee proposal for election %d", proposalId, i);
        return i;
      }
      if (memMatch) {
        log("Found proposal %s as member proposal for election %d", proposalId, i);
        return i;
      }
    } catch (err) {
      log("  -> error: %s", (err as Error).message);
      continue;
    }
  }

  log("Proposal %s not found in any election", proposalId);
  return null;
}
