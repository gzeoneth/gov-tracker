/**
 * Voting Stage Tests
 *
 * Tests for voting stage tracking functionality.
 * Includes both unit tests (mocked) and integration tests (RPC).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { trackVotingStage } from "../src/stages/voting";
import type { ProposalData } from "../src/types";
import { ADDRESSES } from "../src/constants";

// Mock the discovery modules
vi.mock("../src/discovery/governor-discovery", () => ({
  getProposalState: vi.fn(),
  getVotingData: vi.fn(),
  detectProposalType: vi.fn(),
}));

vi.mock("../src/discovery/security-council", () => ({
  checkVettingPeriod: vi.fn(),
}));

vi.mock("../src/utils/timing", () => ({
  getCurrentBlockInfo: vi.fn(),
  calculateRemainingSeconds: vi.fn(),
  getL1BlockNumberFromL2: vi.fn(),
}));

import {
  getProposalState,
  getVotingData,
  detectProposalType,
} from "../src/discovery/governor-discovery";
import { checkVettingPeriod } from "../src/discovery/security-council";
import {
  getCurrentBlockInfo,
  calculateRemainingSeconds,
  getL1BlockNumberFromL2,
} from "../src/utils/timing";

const mockProvider = {} as ethers.providers.Provider;

// Helper to create a full ProposalData with required fields
function createProposalData(
  startBlock: number,
  endBlock: number,
  description = "Test proposal"
): ProposalData {
  return {
    proposalId: "12345",
    proposer: "0x" + "1".repeat(40),
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: ethers.BigNumber.from(startBlock),
    endBlock: ethers.BigNumber.from(endBlock),
    description,
    creationBlock: startBlock - 100,
    creationTxHash: "0x" + "a".repeat(64),
  };
}

// Helper to create VotingData with required startBlock and endBlock
function createVotingData(
  startBlock: number,
  endBlock: number,
  overrides: Partial<{
    forVotes: string;
    againstVotes: string;
    abstainVotes: string;
    quorum: string;
    hasReachedQuorum: boolean;
    isVotingPeriodOver: boolean;
    extendedDeadline: number;
  }> = {}
) {
  return {
    startBlock: ethers.BigNumber.from(startBlock),
    endBlock: ethers.BigNumber.from(endBlock),
    forVotes: ethers.BigNumber.from(overrides.forVotes ?? "1000000000000000000000000"),
    againstVotes: ethers.BigNumber.from(overrides.againstVotes ?? "500000000000000000000000"),
    abstainVotes: ethers.BigNumber.from(overrides.abstainVotes ?? "100000000000000000000000"),
    quorum: ethers.BigNumber.from(overrides.quorum ?? "900000000000000000000000"),
    hasReachedQuorum: overrides.hasReachedQuorum ?? true,
    deadline: ethers.BigNumber.from(endBlock),
    extendedDeadline: ethers.BigNumber.from(overrides.extendedDeadline ?? endBlock),
    isVotingPeriodOver: overrides.isVotingPeriodOver ?? false,
  };
}

describe("Voting Stage Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("trackVotingStage", () => {
    it("should return NOT_STARTED when voting has not begun", async () => {
      // #given - current block is before voting start block
      const currentBlock = 1000;
      const startBlock = 2000; // Future block

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(calculateRemainingSeconds).mockReturnValue(600); // 10 minutes

      const proposalData = createProposalData(startBlock, 3000);

      // #when - tracking voting stage for a proposal that hasn't started yet
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be NOT_STARTED with no voting data
      expect(result.stage.status).toBe("NOT_STARTED");
      expect(result.stage.type).toBe("VOTING_ACTIVE");
      expect(result.votingData).toBeNull();
    });

    it("should return PENDING when voting is active", async () => {
      // #given - current block is within voting period with active voting
      const currentBlock = 1500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: false })
      );

      vi.mocked(getProposalState).mockResolvedValue("Active");
      vi.mocked(calculateRemainingSeconds).mockReturnValue(300);

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage during active voting period
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be PENDING with voting data populated
      expect(result.stage.status).toBe("PENDING");
      expect(result.stage.type).toBe("VOTING_ACTIVE");
      expect(result.votingData).not.toBeNull();
      // stage.data is now properly typed as VotingActiveData (no cast needed)
      expect(result.stage.data.forVotes).toContain("ARB");
      expect(result.stage.data.quorumReached).toBe(true);
    });

    it("should return COMPLETED when proposal has succeeded", async () => {
      // #given - voting period ended and proposal succeeded
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("NON_CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: true })
      );

      vi.mocked(getProposalState).mockResolvedValue("Succeeded");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage after successful vote
      const result = await trackVotingStage(
        ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be COMPLETED
      expect(result.stage.status).toBe("COMPLETED");
    });

    it("should return FAILED when proposal is defeated", async () => {
      // #given - voting period ended with insufficient votes (quorum not reached)
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, {
          forVotes: "100000000000000000000000",
          hasReachedQuorum: false,
          isVotingPeriodOver: true,
        })
      );

      vi.mocked(getProposalState).mockResolvedValue("Defeated");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for a defeated proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be FAILED with reason "Defeated"
      expect(result.stage.status).toBe("FAILED");
      expect(result.stage.data.reason).toBe("Defeated");
    });

    it("should handle election proposal with vetting period", async () => {
      // #given - election proposal with active vetting period after voting ended
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;
      const vettingDeadline = 3000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("ELECTION_NOMINEE");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: true })
      );

      vi.mocked(checkVettingPeriod).mockResolvedValue({
        hasVettingPeriod: true,
        vettingDeadline: ethers.BigNumber.from(vettingDeadline),
        isVettingActive: true,
        vetterAddress: "0x" + "1".repeat(40),
      });

      vi.mocked(getProposalState).mockResolvedValue("Succeeded");
      vi.mocked(getL1BlockNumberFromL2).mockResolvedValue(ethers.BigNumber.from(2800));
      vi.mocked(calculateRemainingSeconds).mockReturnValue(1200);

      const proposalData = createProposalData(startBlock, deadline, "Election proposal");

      // #when - tracking voting stage during vetting period
      const result = await trackVotingStage(
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be PENDING with vetting period data
      expect(result.stage.status).toBe("PENDING");
      // stage.data is now properly typed as VotingActiveData (no cast needed)
      expect(result.stage.data.hasVettingPeriod).toBe(true);
      expect(result.stage.data.isVettingActive).toBe(true);
      expect(result.stage.data.waitingForVetting).toBe(true);
    });

    it("should detect extended voting deadline", async () => {
      // #given - voting period was extended beyond original deadline
      const currentBlock = 1800;
      const startBlock = 1000;
      const originalDeadline = 2000;
      const extendedDeadline = 2500;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      // The wasExtended check compares deadline with extendedDeadline
      // If they differ, it means voting was extended
      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, originalDeadline, {
          isVotingPeriodOver: false,
          extendedDeadline: extendedDeadline,
        })
      );

      vi.mocked(getProposalState).mockResolvedValue("Active");
      vi.mocked(calculateRemainingSeconds).mockReturnValue(420);

      const proposalData = createProposalData(startBlock, originalDeadline);

      // #when - tracking voting stage with extended deadline
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - wasExtended flag should be true
      // stage.data is now properly typed as VotingActiveData (no cast needed)
      expect(result.stage.data.wasExtended).toBe(true);
    });

    it("should handle Queued proposal state", async () => {
      // #given - proposal passed voting and is now queued in timelock
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: true })
      );

      vi.mocked(getProposalState).mockResolvedValue("Queued");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for a queued proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - voting stage should be COMPLETED (moved to next stage)
      expect(result.stage.status).toBe("COMPLETED");
    });

    it("should handle Executed proposal state", async () => {
      // #given - proposal has been fully executed
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: true })
      );

      vi.mocked(getProposalState).mockResolvedValue("Executed");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for an executed proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - voting stage should be COMPLETED
      expect(result.stage.status).toBe("COMPLETED");
    });

    it("should handle Canceled proposal state", async () => {
      // #given - proposal was canceled before or during voting
      const currentBlock = 2500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, {
          forVotes: "0",
          againstVotes: "0",
          abstainVotes: "0",
          hasReachedQuorum: false,
          isVotingPeriodOver: true,
        })
      );

      vi.mocked(getProposalState).mockResolvedValue("Canceled");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for a canceled proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be CANCELED (not FAILED)
      expect(result.stage.status).toBe("CANCELED");
      expect(result.stage.data.reason).toBe("Proposal was canceled by proposer");
    });

    it("should handle Expired proposal state", async () => {
      // #given - proposal succeeded but was not queued in time
      const currentBlock = 5000;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, { isVotingPeriodOver: true })
      );

      vi.mocked(getProposalState).mockResolvedValue("Expired");

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for an expired proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be FAILED with reason "Expired"
      expect(result.stage.status).toBe("FAILED");
      expect(result.stage.data.reason).toBe("Expired");
    });

    it("should handle Pending proposal state when voting has not started", async () => {
      // #given - governor reports Pending state, current block before start block
      const currentBlock = 500;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, {
          forVotes: "0",
          againstVotes: "0",
          abstainVotes: "0",
          hasReachedQuorum: false,
          isVotingPeriodOver: false,
        })
      );

      vi.mocked(getProposalState).mockResolvedValue("Pending");
      vi.mocked(calculateRemainingSeconds).mockReturnValue(600);

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage for a pending proposal
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - stage should be NOT_STARTED
      expect(result.stage.status).toBe("NOT_STARTED");
    });

    it("should handle Pending proposal state after startBlock passed", async () => {
      // #given - edge case where governor reports Pending despite past start block (timing race)
      const currentBlock = 1100;
      const startBlock = 1000;
      const deadline = 2000;

      vi.mocked(getCurrentBlockInfo).mockResolvedValue({
        blockNumber: currentBlock,
        timestamp: Math.floor(Date.now() / 1000),
      });

      vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");

      vi.mocked(getVotingData).mockResolvedValue(
        createVotingData(startBlock, deadline, {
          forVotes: "0",
          againstVotes: "0",
          abstainVotes: "0",
          hasReachedQuorum: false,
          isVotingPeriodOver: false,
        })
      );

      // Governor reports Pending (edge case - block timing race)
      vi.mocked(getProposalState).mockResolvedValue("Pending");
      vi.mocked(calculateRemainingSeconds).mockReturnValue(600);

      const proposalData = createProposalData(startBlock, deadline);

      // #when - tracking voting stage during block timing race condition
      const result = await trackVotingStage(
        ADDRESSES.CONSTITUTIONAL_GOVERNOR,
        "12345",
        proposalData,
        mockProvider
      );

      // #then - should return NOT_STARTED based on governor state
      expect(result.stage.status).toBe("NOT_STARTED");
    });
  });
});
