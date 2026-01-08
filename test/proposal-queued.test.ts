/**
 * Proposal Queued Stage Tests
 *
 * Tests for proposal queueing preparation functions.
 * Uses mocked providers - no RPC calls required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigNumber, ethers } from "ethers";
import { prepareGovernorQueue, GovernorProposalParams } from "../src/stages/proposal-queued";
import { PROPOSAL_STATE, ADDRESSES } from "../src/constants";

// Mock the security-council module
vi.mock("../src/discovery/security-council", () => ({
  checkVettingPeriod: vi.fn(),
}));

// Import after mocking
import { checkVettingPeriod } from "../src/discovery/security-council";

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
});
