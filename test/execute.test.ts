/**
 * Tracker Execute Module Tests
 *
 * Tests for transaction preparation for READY stages.
 * Uses mocked providers and stage data.
 */

import { describe, it, expect } from "vitest";
import { prepareTransaction, ExecuteContext } from "../src/tracker/execute";
import { TrackedStage } from "../src/types";
import { ethers } from "ethers";

// Mock providers
const mockL1Provider = {} as ethers.providers.Provider;
const mockL2Provider = {} as ethers.providers.Provider;
const mockNovaProvider = {} as ethers.providers.Provider;

const mockContext: ExecuteContext = {
  l1Provider: mockL1Provider,
  l2Provider: mockL2Provider,
  novaProvider: mockNovaProvider,
};

describe("Tracker Execute Module", () => {
  describe("prepareTransaction", () => {
    it("should fail for PROPOSAL_CREATED stage (not supported)", async () => {
      const stage: TrackedStage = {
        type: "PROPOSAL_CREATED",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      };

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for VOTING_ACTIVE stage (not supported)", async () => {
      const stage: TrackedStage = {
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      };

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for PROPOSAL_QUEUED with missing data", async () => {
      const stage: TrackedStage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {}, // Missing required fields
      };

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    it("should fail for PROPOSAL_QUEUED with incomplete data", async () => {
      const stage: TrackedStage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {
          governorAddress: "0x" + "1".repeat(40),
          proposalId: "12345",
          // Missing targets, values, calldatas, description
        },
      };

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    describe("L2_TO_L1_MESSAGE preparation", () => {
      it("should fail for stage without READY status", async () => {
        const stage: TrackedStage = {
          type: "L2_TO_L1_MESSAGE",
          status: "PENDING",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with missing l2TxHash", async () => {
        const stage: TrackedStage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            messageCount: 1,
            // Missing l2TxHash
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for COMPLETED stage without prepareCompleted option", async () => {
        const stage: TrackedStage = {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("RETRYABLE_EXECUTED preparation", () => {
      it("should fail for stage with missing target chain", async () => {
        const stage: TrackedStage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            // Missing targetChains
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for stage with missing L1 tx hash", async () => {
        const stage: TrackedStage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            targetChains: ["arb1"],
            // Missing L1 tx hash
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with empty targetChains array", async () => {
        const stage: TrackedStage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            targetChains: [],
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for PENDING status", async () => {
        const stage: TrackedStage = {
          type: "RETRYABLE_EXECUTED",
          status: "PENDING",
          chain: "ethereum",
          chainId: 1,
          transactions: [
            {
              hash: "0x" + "b".repeat(64),
              blockNumber: 123,
              chain: "ethereum",
              chainId: 1,
            },
          ],
          data: {
            targetChains: ["arb1"],
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L2_TIMELOCK preparation", () => {
      it("should fail for stage with wrong type", async () => {
        const stage: TrackedStage = {
          type: "L2_TIMELOCK",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            // Missing required timelock data
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L1_TIMELOCK preparation", () => {
      it("should fail for stage without proper data", async () => {
        const stage: TrackedStage = {
          type: "L1_TIMELOCK",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            // Missing required timelock data
          },
        };

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    it("should fail for unknown stage type", async () => {
      const stage = {
        type: "UNKNOWN_STAGE" as never,
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });
  });
});
