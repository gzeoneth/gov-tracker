/**
 * Tracker Execute Module Tests
 *
 * Tests for transaction preparation for READY stages.
 * Uses mocked providers and stage data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prepareTransaction, ExecuteContext } from "../src/tracker/execute";
import { TrackedStage, PrepareResult } from "../src/types";
import { BulkPrepareResult } from "../src/utils/stage-helpers";
import { ethers } from "ethers";
import * as l2ToL1MessageModule from "../src/stages/l2-to-l1-message";
import * as retryablesModule from "../src/stages/retryables";

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
      const stage = {
        type: "PROPOSAL_CREATED",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for VOTING_ACTIVE stage (not supported)", async () => {
      const stage = {
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for PROPOSAL_QUEUED with missing data", async () => {
      const stage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {}, // Missing required fields
      } as unknown as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    it("should fail for PROPOSAL_QUEUED with incomplete data", async () => {
      const stage = {
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
      } as unknown as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    describe("L2_TO_L1_MESSAGE preparation", () => {
      it("should fail for stage without READY status", async () => {
        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "PENDING",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with missing l2TxHash", async () => {
        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            messageCount: 1,
            // Missing l2TxHash
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for COMPLETED stage without prepareCompleted option", async () => {
        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("RETRYABLE_EXECUTED preparation", () => {
      it("should fail for stage with missing target chain", async () => {
        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            // Missing targetChains
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for stage with missing L1 tx hash", async () => {
        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            targetChains: ["arb1"],
            // Missing L1 tx hash
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with empty targetChains array", async () => {
        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            targetChains: [],
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for PENDING status", async () => {
        const stage = {
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
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L2_TIMELOCK preparation", () => {
      it("should fail for stage with wrong type", async () => {
        const stage = {
          type: "L2_TIMELOCK",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            // Missing required timelock data
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L1_TIMELOCK preparation", () => {
      it("should fail for stage without proper data", async () => {
        const stage = {
          type: "L1_TIMELOCK",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            // Missing required timelock data
          },
        } as unknown as TrackedStage;

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
      } as unknown as TrackedStage;

      const result = await prepareTransaction(stage, mockContext);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });
  });

  describe("prepareTransaction with mocked stage functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("L2_TO_L1_MESSAGE edge cases", () => {
      it("should return first failed result when all messages fail (line 122)", async () => {
        const failedResult: PrepareResult = {
          success: false,
          error: "Message preparation failed",
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 2,
          results: [failedResult, failedResult],
          targetChain: "ethereum",
        };

        vi.spyOn(l2ToL1MessageModule, "prepareL2ToL1MessageStage").mockResolvedValue(
          mockBulkResult
        );

        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [{ hash: "0x" + "a".repeat(64), blockNumber: 100, chain: "arb1" }],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
            messageCount: 2,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe("Message preparation failed");
        }
      });

      it("should add warning for multiple messages (lines 108-117)", async () => {
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "1".repeat(40),
            data: "0x1234",
            value: "0",
            chain: "ethereum",
            chainId: 1,
            description: "Execute L2→L1 message",
          },
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 3,
          results: [successResult],
          targetChain: "ethereum",
        };

        vi.spyOn(l2ToL1MessageModule, "prepareL2ToL1MessageStage").mockResolvedValue(
          mockBulkResult
        );

        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [{ hash: "0x" + "a".repeat(64), blockNumber: 100, chain: "arb1" }],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
            messageCount: 3,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).toContain("[1/3 messages");
          expect(result.prepared.description).toContain("use prepareL2ToL1MessageStage() for all");
        }
      });

      it("should return success result directly when single message (line 119)", async () => {
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "1".repeat(40),
            data: "0x1234",
            value: "0",
            chain: "ethereum",
            chainId: 1,
            description: "Execute L2→L1 message",
          },
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 1,
          results: [successResult],
          targetChain: "ethereum",
        };

        vi.spyOn(l2ToL1MessageModule, "prepareL2ToL1MessageStage").mockResolvedValue(
          mockBulkResult
        );

        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [{ hash: "0x" + "a".repeat(64), blockNumber: 100, chain: "arb1" }],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
            messageCount: 1,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).not.toContain("[1/");
        }
      });

      it("should fail when no messages to prepare (line 102)", async () => {
        const mockBulkResult: BulkPrepareResult = {
          total: 0,
          results: [],
          targetChain: "ethereum",
        };

        vi.spyOn(l2ToL1MessageModule, "prepareL2ToL1MessageStage").mockResolvedValue(
          mockBulkResult
        );

        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [{ hash: "0x" + "a".repeat(64), blockNumber: 100, chain: "arb1" }],
          data: {
            l2TxHash: "0x" + "a".repeat(64),
            messageCount: 0,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No messages to prepare");
        }
      });
    });

    describe("RETRYABLE_EXECUTED edge cases", () => {
      it("should fail when no tickets to prepare (line 140)", async () => {
        const mockBulkResult: BulkPrepareResult = {
          total: 0,
          results: [],
          targetChain: "arb1",
        };

        vi.spyOn(retryablesModule, "prepareRetryableStage").mockResolvedValue(mockBulkResult);

        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [{ hash: "0x" + "b".repeat(64), blockNumber: 100, chain: "ethereum" }],
          data: {
            targetChains: ["arb1"],
            ticketCount: 0,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No tickets to prepare");
        }
      });

      it("should add warning for multiple tickets (lines 146-155)", async () => {
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "2".repeat(40),
            data: "0x5678",
            value: "0",
            chain: "arb1",
            chainId: 42161,
            description: "Redeem retryable ticket",
          },
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 4,
          results: [successResult],
          targetChain: "arb1",
        };

        vi.spyOn(retryablesModule, "prepareRetryableStage").mockResolvedValue(mockBulkResult);

        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [{ hash: "0x" + "b".repeat(64), blockNumber: 100, chain: "ethereum" }],
          data: {
            targetChains: ["arb1"],
            ticketCount: 4,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).toContain("[1/4 tickets");
          expect(result.prepared.description).toContain("use prepareRetryableStage() for all");
        }
      });

      it("should return success result directly when single ticket (line 157)", async () => {
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "2".repeat(40),
            data: "0x5678",
            value: "0",
            chain: "arb1",
            chainId: 42161,
            description: "Redeem retryable ticket",
          },
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 1,
          results: [successResult],
          targetChain: "arb1",
        };

        vi.spyOn(retryablesModule, "prepareRetryableStage").mockResolvedValue(mockBulkResult);

        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [{ hash: "0x" + "b".repeat(64), blockNumber: 100, chain: "ethereum" }],
          data: {
            targetChains: ["arb1"],
            ticketCount: 1,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).not.toContain("[1/");
        }
      });

      it("should return first failed result when all tickets fail (line 160)", async () => {
        const failedResult: PrepareResult = {
          success: false,
          error: "Ticket preparation failed",
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 2,
          results: [failedResult, failedResult],
          targetChain: "arb1",
        };

        vi.spyOn(retryablesModule, "prepareRetryableStage").mockResolvedValue(mockBulkResult);

        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [{ hash: "0x" + "b".repeat(64), blockNumber: 100, chain: "ethereum" }],
          data: {
            targetChains: ["arb1"],
            ticketCount: 2,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe("Ticket preparation failed");
        }
      });

      it("should use nova provider for nova target chain (line 132)", async () => {
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "2".repeat(40),
            data: "0x5678",
            value: "0",
            chain: "nova",
            chainId: 42170,
            description: "Redeem retryable ticket on Nova",
          },
        };
        const mockBulkResult: BulkPrepareResult = {
          total: 1,
          results: [successResult],
          targetChain: "nova",
        };

        const prepareSpy = vi
          .spyOn(retryablesModule, "prepareRetryableStage")
          .mockResolvedValue(mockBulkResult);

        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [{ hash: "0x" + "b".repeat(64), blockNumber: 100, chain: "ethereum" }],
          data: {
            targetChains: ["nova"],
            ticketCount: 1,
          },
        } as unknown as TrackedStage;

        const result = await prepareTransaction(stage, mockContext);
        expect(result.success).toBe(true);

        // Verify nova provider was passed
        expect(prepareSpy).toHaveBeenCalledWith(
          stage,
          mockL1Provider,
          mockNovaProvider,
          expect.any(Object)
        );
      });
    });
  });
});
