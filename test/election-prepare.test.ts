/**
 * Unit tests for election/prepare.ts
 *
 * Tests for prepareElectionCreation, prepareMemberElectionTrigger, and prepareMemberElectionExecution.
 * All external dependencies are mocked.
 */

import { vi, describe, it, expect, type Mock } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock queryWithRetry
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => unknown) => fn()),
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

// Mock proposal-ids (but not contracts - we test that separately)
vi.mock("../src/election/proposal-ids", () => ({
  getElectionProposalId: vi.fn(),
  computeElectionProposalId: vi.fn(),
}));

import {
  prepareElectionCreation,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
  type ElectionProposalParams,
} from "../src/election";
import { buildExecuteTransaction } from "../src/election/params";
import { getElectionProposalId } from "../src/election/proposal-ids";
import { ADDRESSES } from "../src/constants";

describe("election/prepare", () => {
  describe("prepareElectionCreation", () => {
    it("should create transaction with correct function selector", () => {
      // #when
      const result = prepareElectionCreation({ electionCount: 0 });

      // #then - function selector for createElection() is 0x24c2286c
      expect(result.transaction.data).toBe("0x24c2286c");
      expect(result.transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(result.transaction.chain).toBe("arb1");
      expect(result.transaction.chainId).toBe(42161);
      expect(result.electionIndex).toBe(0);
    });

    it("should use provided election count for description", () => {
      // #when
      const result = prepareElectionCreation({ electionCount: 5 });

      // #then
      expect(result.transaction.description).toContain("#5");
      expect(result.electionIndex).toBe(5);
    });

    it("should use custom governor address", () => {
      // #given
      const customAddress = "0x" + "1".repeat(40);

      // #when
      const result = prepareElectionCreation({ electionCount: 0 }, customAddress);

      // #then
      expect(result.transaction.to).toBe(customAddress);
    });
  });

  describe("buildExecuteTransaction", () => {
    it("should encode execute function with correct parameters", () => {
      // #given
      const params: ElectionProposalParams = {
        targets: ["0x" + "1".repeat(40)],
        values: [BigNumber.from(0)],
        calldatas: ["0xabcd"],
        description: "Test Proposal",
        descriptionHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Test Proposal")),
      };
      const governorAddress = "0x" + "2".repeat(40);

      // #when
      const tx = buildExecuteTransaction(params, governorAddress, "Test description");

      // #then
      expect(tx.to).toBe(governorAddress);
      expect(tx.chain).toBe("arb1");
      expect(tx.chainId).toBe(42161);
      expect(tx.value).toBe("0");
      expect(tx.description).toBe("Test description");
      // execute() function selector
      expect(tx.data.startsWith("0x")).toBe(true);
    });
  });

  describe("prepareMemberElectionTrigger", () => {
    it("should return null when canProceedToMemberPhase is false", async () => {
      // #given - null provider to ensure no RPC calls are made on early return
      const nullProvider = null as unknown as ethers.providers.Provider;

      // #when
      const result = await prepareMemberElectionTrigger(
        { electionIndex: 0, canProceedToMemberPhase: false },
        nullProvider
      );

      // #then
      expect(result).toBeNull();
    });

    it("should return null when proposal params not found (no proposal ID)", async () => {
      // #given
      const mockProvider = {
        getLogs: vi.fn().mockResolvedValue([]),
        getBlockNumber: vi.fn().mockResolvedValue(1000000),
      };
      (getElectionProposalId as Mock).mockResolvedValue(null);

      // #when
      const result = await prepareMemberElectionTrigger(
        { electionIndex: 0, canProceedToMemberPhase: true },
        mockProvider as unknown as ethers.providers.Provider
      );

      // #then
      expect(result).toBeNull();
    });
  });

  describe("prepareMemberElectionExecution", () => {
    it("should return null when canExecuteMember is false", async () => {
      // #given - null provider to ensure no RPC calls are made on early return
      const nullProvider = null as unknown as ethers.providers.Provider;

      // #when
      const result = await prepareMemberElectionExecution(
        { electionIndex: 0, canExecuteMember: false },
        nullProvider
      );

      // #then
      expect(result).toBeNull();
    });
  });
});
