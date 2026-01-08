/**
 * Proposal Queued Stage Tests
 *
 * Tests for proposal queueing preparation functions.
 * Uses mocked providers - no RPC calls required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigNumber, ethers } from "ethers";
import {
  prepareGovernorQueue,
  GovernorProposalParams,
  trackProposalQueued,
} from "../src/stages/proposal-queued";
import { PROPOSAL_STATE, ADDRESSES } from "../src/constants";

// Mock the security-council module
vi.mock("../src/discovery/security-council", () => ({
  checkVettingPeriod: vi.fn(),
}));

// Mock the governor-discovery module
vi.mock("../src/discovery/governor-discovery", () => ({
  getProposalState: vi.fn(),
  findProposalQueuedEvent: vi.fn(),
  getTimelockAddress: vi.fn(),
}));

// Mock the timelock-discovery module
vi.mock("../src/discovery/timelock-discovery", () => ({
  findCallScheduledByTxHash: vi.fn(),
  getL2TimelockForGovernor: vi.fn(),
}));

// Import after mocking
import { checkVettingPeriod } from "../src/discovery/security-council";
import {
  getProposalState,
  findProposalQueuedEvent,
  getTimelockAddress,
} from "../src/discovery/governor-discovery";
import {
  findCallScheduledByTxHash,
  getL2TimelockForGovernor,
} from "../src/discovery/timelock-discovery";

/**
 * Create a mock provider that returns a specific proposal state
 */
function createMockProvider(stateValue: number): ethers.providers.Provider {
  const encodedState = ethers.utils.defaultAbiCoder.encode(["uint8"], [stateValue]);

  return {
    call: vi.fn().mockResolvedValue(encodedState),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 42161, name: "arb1" }),
    _isProvider: true,
  } as unknown as ethers.providers.Provider;
}

describe("Proposal Queued Stage", () => {
  beforeEach(() => {
    // Default: vetting period not active
    vi.mocked(checkVettingPeriod).mockResolvedValue({
      hasVettingPeriod: false,
      isVettingActive: false,
      vettingDeadline: null,
      vetterAddress: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("prepareGovernorQueue", () => {
    const governorAddress = ADDRESSES.CONSTITUTIONAL_GOVERNOR;
    const proposalId = "12345678901234567890";
    const proposalParams: GovernorProposalParams = {
      targets: ["0x1111111111111111111111111111111111111111"],
      values: [BigNumber.from(0)],
      calldatas: ["0xabcdef"],
      descriptionHash: ethers.utils.id("Test proposal"),
    };

    it("should fail if proposal already queued", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.QUEUED);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already queued");
      }
    });

    it("should fail if proposal not in Succeeded state", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.ACTIVE);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not in Succeeded state");
      }
    });

    it("should fail if proposal is defeated", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.DEFEATED);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not in Succeeded state");
        expect(result.error).toContain("Defeated");
      }
    });

    it("should fail if vetting period is active", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.SUCCEEDED);

      // Mock vetting period active
      vi.mocked(checkVettingPeriod).mockResolvedValue({
        hasVettingPeriod: true,
        isVettingActive: true,
        vettingDeadline: BigNumber.from(1000000),
        vetterAddress: "0x" + "1".repeat(40),
      });

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("vetting period");
      }
    });

    it("should prepare queue transaction for succeeded proposal", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.SUCCEEDED);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.prepared).toBeDefined();
        expect(result.prepared.to).toBe(governorAddress);
        expect(result.prepared.chain).toBe("arb1");
        expect(result.prepared.chainId).toBe(42161);
        expect(result.prepared.value).toBe("0");
        expect(result.prepared.description).toContain("queue()");
        // Calldata should start with the queue function selector
        expect(result.prepared.data.startsWith("0x160cbed7")).toBe(true);
      }
    });

    it("should include correct operationId in result", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.SUCCEEDED);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.prepared.operationId).toBe(proposalId);
      }
    });

    it("should handle multiple targets in params", async () => {
      const multiParams: GovernorProposalParams = {
        targets: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
        ],
        values: [BigNumber.from(0), BigNumber.from(1000), BigNumber.from(0)],
        calldatas: ["0xabcd", "0xdef0", "0x1234"], // Even-length hex strings
        descriptionHash: ethers.utils.id("Multi-target proposal"),
      };

      const mockProvider = createMockProvider(PROPOSAL_STATE.SUCCEEDED);

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        multiParams,
        mockProvider
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.prepared.data).toBeDefined();
      }
    });

    it("should work with vetting period disabled", async () => {
      const mockProvider = createMockProvider(PROPOSAL_STATE.SUCCEEDED);

      // Explicitly mock vetting period not active
      vi.mocked(checkVettingPeriod).mockResolvedValue({
        hasVettingPeriod: true,
        isVettingActive: false,
        vettingDeadline: null,
        vetterAddress: null,
      });

      const result = await prepareGovernorQueue(
        governorAddress,
        proposalId,
        proposalParams,
        mockProvider
      );

      expect(result.success).toBe(true);
    });
  });

  describe("trackProposalQueued", () => {
    const governorAddress = ADDRESSES.CONSTITUTIONAL_GOVERNOR;
    const proposalId = "12345678901234567890";
    const fromBlock = 100000;
    const mockProvider = {} as ethers.providers.Provider;

    beforeEach(() => {
      vi.mocked(getL2TimelockForGovernor).mockReturnValue(null);
      vi.mocked(getTimelockAddress).mockResolvedValue("0x3333333333333333333333333333333333333333");
      vi.mocked(findCallScheduledByTxHash).mockResolvedValue(undefined);
    });

    it("should return NOT_STARTED when proposal is Pending", async () => {
      // #given proposal state is Pending
      vi.mocked(getProposalState).mockResolvedValue("Pending");

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return NOT_STARTED status
      expect(result.stage.status).toBe("NOT_STARTED");
      expect(result.stage.data.proposalState).toBe("Pending");
    });

    it("should return NOT_STARTED when proposal is Active", async () => {
      // #given proposal state is Active
      vi.mocked(getProposalState).mockResolvedValue("Active");

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return NOT_STARTED status
      expect(result.stage.status).toBe("NOT_STARTED");
      expect(result.stage.data.proposalState).toBe("Active");
    });

    it("should return SKIPPED when proposal is Defeated", async () => {
      // #given proposal state is Defeated
      vi.mocked(getProposalState).mockResolvedValue("Defeated");
      vi.mocked(findProposalQueuedEvent).mockResolvedValue(null);

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return SKIPPED status
      expect(result.stage.status).toBe("SKIPPED");
      expect(result.stage.data.proposalState).toBe("Defeated");
    });

    it("should return SKIPPED when proposal is Canceled", async () => {
      // #given proposal state is Canceled
      vi.mocked(getProposalState).mockResolvedValue("Canceled");
      vi.mocked(findProposalQueuedEvent).mockResolvedValue(null);

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return SKIPPED status
      expect(result.stage.status).toBe("SKIPPED");
    });

    it("should return READY when proposal is Succeeded but not yet queued", async () => {
      // #given proposal is Succeeded but queue event not found
      vi.mocked(getProposalState).mockResolvedValue("Succeeded");
      vi.mocked(findProposalQueuedEvent).mockResolvedValue(null);

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return READY status with canQueue=true
      expect(result.stage.status).toBe("READY");
      expect(result.stage.data.proposalState).toBe("Succeeded");
      expect(result.stage.data.canQueue).toBe(true);
      expect(result.stage.data.governorAddress).toBe(governorAddress);
      expect(result.stage.data.proposalId).toBe(proposalId);
    });

    it("should fallback to getTimelockAddress when getL2TimelockForGovernor returns null", async () => {
      // #given proposal is Queued and queue event exists
      vi.mocked(getProposalState).mockResolvedValue("Queued");
      vi.mocked(getL2TimelockForGovernor).mockReturnValue(null);
      vi.mocked(getTimelockAddress).mockResolvedValue("0x4444444444444444444444444444444444444444");
      vi.mocked(findProposalQueuedEvent).mockResolvedValue({
        blockNumber: 200000,
        txHash: "0xabc123",
        eta: BigNumber.from(1700000000),
      });
      vi.mocked(findCallScheduledByTxHash).mockResolvedValue([
        {
          operationId: "0xopid123",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0xabcdef",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(259200),
          blockNumber: 200000,
          txHash: "0xabc123",
          logIndex: 0,
          timelockAddress: "0x4444444444444444444444444444444444444444",
        },
      ]);

      // Mock getBlockTimestamp
      const originalGetBlock = mockProvider.getBlock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockProvider as any).getBlock = vi.fn().mockResolvedValue({ timestamp: 1699900000 });

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should use fallback timelockAddress from getTimelockAddress
      expect(getTimelockAddress).toHaveBeenCalledWith(governorAddress, mockProvider);
      expect(result.stage.status).toBe("COMPLETED");
      expect(result.timelockAddress).toBe("0x4444444444444444444444444444444444444444");

      // Restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockProvider as any).getBlock = originalGetBlock;
    });

    it("should return PENDING when queue event not found and state is Queued", async () => {
      // #given proposal is Queued but queue event not found (race condition)
      vi.mocked(getProposalState).mockResolvedValue("Queued");
      vi.mocked(findProposalQueuedEvent).mockResolvedValue(null);

      // #when tracking proposal queued stage
      const result = await trackProposalQueued(
        governorAddress,
        proposalId,
        mockProvider,
        fromBlock
      );

      // #then should return PENDING status
      expect(result.stage.status).toBe("PENDING");
    });
  });
});
