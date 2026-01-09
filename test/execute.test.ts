/**
 * Tracker Execute Module Tests
 *
 * Tests for transaction preparation for READY stages.
 * Uses mocked providers and stage data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prepareTransaction, ExecuteContext } from "../src/tracker/execute";
import { TrackedStage, PrepareResult } from "../src/types";
import { BulkPrepareResult } from "../src/stages/utils";
import { ethers } from "ethers";
import * as l2ToL1MessageModule from "../src/stages/l2-to-l1-message";
import * as retryablesModule from "../src/stages/retryables";
import * as proposalQueuedModule from "../src/stages/proposal-queued";

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
      // #given - a PROPOSAL_CREATED stage
      const stage = {
        type: "PROPOSAL_CREATED",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail with not supported error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for VOTING_ACTIVE stage (not supported)", async () => {
      // #given - a VOTING_ACTIVE stage
      const stage = {
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail with not supported error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for PROPOSAL_QUEUED with missing data", async () => {
      // #given - a PROPOSAL_QUEUED stage with empty data
      const stage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail with missing params error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    it("should fail for PROPOSAL_QUEUED with incomplete data", async () => {
      // #given - a PROPOSAL_QUEUED stage with partial data
      const stage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {
          governorAddress: "0x" + "1".repeat(40),
          proposalId: "12345",
        },
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail with missing params error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Missing proposal queue params");
      }
    });

    describe("L2_TO_L1_MESSAGE preparation", () => {
      it("should fail for stage without READY status", async () => {
        // #given - a L2_TO_L1_MESSAGE stage with PENDING status
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with missing l2TxHash", async () => {
        // #given - a L2_TO_L1_MESSAGE stage without l2TxHash
        const stage = {
          type: "L2_TO_L1_MESSAGE",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            messageCount: 1,
          },
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for COMPLETED stage without prepareCompleted option", async () => {
        // #given - a COMPLETED L2_TO_L1_MESSAGE stage
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

        // #when - preparing transaction without prepareCompleted option
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("RETRYABLE_EXECUTED preparation", () => {
      it("should fail for stage with missing target chain", async () => {
        // #given - a RETRYABLE_EXECUTED stage without targetChains
        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {},
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail with no target chain error
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for stage with missing L1 tx hash", async () => {
        // #given - a RETRYABLE_EXECUTED stage without L1 tx in transactions
        const stage = {
          type: "RETRYABLE_EXECUTED",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {
            targetChains: ["arb1"],
          },
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it("should fail for stage with empty targetChains array", async () => {
        // #given - a RETRYABLE_EXECUTED stage with empty targetChains
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail with no target chain error
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No target chain found");
        }
      });

      it("should fail for PENDING status", async () => {
        // #given - a RETRYABLE_EXECUTED stage with PENDING status
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L2_TIMELOCK preparation", () => {
      it("should fail for stage with wrong type", async () => {
        // #given - a L2_TIMELOCK stage without required data
        const stage = {
          type: "L2_TIMELOCK",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe("L1_TIMELOCK preparation", () => {
      it("should fail for stage without proper data", async () => {
        // #given - a L1_TIMELOCK stage without required data
        const stage = {
          type: "L1_TIMELOCK",
          status: "READY",
          chain: "ethereum",
          chainId: 1,
          transactions: [],
          data: {},
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    it("should fail for unknown stage type", async () => {
      // #given - a stage with unknown type
      const stage = {
        type: "UNKNOWN_STAGE" as never,
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {},
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail with not supported error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not supported");
      }
    });

    it("should fail for PROPOSAL_QUEUED with mismatched stage data type", async () => {
      // #given - a PROPOSAL_QUEUED stage with mismatched data
      const stage = {
        type: "PROPOSAL_QUEUED",
        status: "READY",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: {
          __forceTypeMismatch: true,
        },
      } as unknown as TrackedStage;

      // #when - preparing transaction
      const result = await prepareTransaction(stage, mockContext);

      // #then - should fail (getStageData returns object, missing required fields)
      expect(result.success).toBe(false);
    });

    it("should fail for RETRYABLE_EXECUTED with nova target but no nova provider", async () => {
      // #given - context without nova provider and stage targeting nova
      const contextNoNova: ExecuteContext = {
        l1Provider: mockL1Provider,
        l2Provider: mockL2Provider,
        novaProvider: undefined as unknown as ethers.providers.Provider,
      };

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

      // #when - preparing transaction
      const result = await prepareTransaction(stage, contextNoNova);

      // #then - should fail with provider not available error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("provider not available");
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

    describe("PROPOSAL_QUEUED with valid data", () => {
      it("should call prepareGovernorQueue with correct params", async () => {
        // #given - mocked prepareGovernorQueue and valid stage data
        const successResult: PrepareResult = {
          success: true,
          prepared: {
            to: "0x" + "1".repeat(40),
            data: "0xabcd",
            value: "0",
            chain: "arb1",
            chainId: 42161,
            description: "Queue proposal",
          },
        };

        vi.spyOn(proposalQueuedModule, "prepareGovernorQueue").mockResolvedValue(successResult);

        const stage = {
          type: "PROPOSAL_QUEUED",
          status: "READY",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            governorAddress: "0x" + "1".repeat(40),
            proposalId: "12345",
            targets: ["0x" + "2".repeat(40)],
            values: ["0"],
            calldatas: ["0x1234"],
            description: "Test proposal",
          },
        } as unknown as TrackedStage;

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should succeed and call prepareGovernorQueue
        expect(result.success).toBe(true);
        expect(proposalQueuedModule.prepareGovernorQueue).toHaveBeenCalled();
      });
    });

    describe("L2_TO_L1_MESSAGE edge cases", () => {
      it("should return first failed result when all messages fail", async () => {
        // #given - mocked prepareL2ToL1MessageStage that returns all failures
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should return first failed result
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe("Message preparation failed");
        }
      });

      it("should add warning for multiple messages", async () => {
        // #given - mocked prepareL2ToL1MessageStage with multiple messages
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should add warning about multiple messages
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).toContain("[1/3 messages");
          expect(result.prepared.description).toContain("use prepareL2ToL1MessageStage() for all");
        }
      });

      it("should return success result directly when single message", async () => {
        // #given - mocked prepareL2ToL1MessageStage with single message
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should return success without warning
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).not.toContain("[1/");
        }
      });

      it("should fail when no messages to prepare", async () => {
        // #given - mocked prepareL2ToL1MessageStage with no messages
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail with no messages error
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No messages to prepare");
        }
      });
    });

    describe("RETRYABLE_EXECUTED edge cases", () => {
      it("should fail when no tickets to prepare", async () => {
        // #given - a RETRYABLE_EXECUTED stage with zero tickets
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should fail with no tickets error
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("No tickets to prepare");
        }
      });

      it("should add warning for multiple tickets (lines 146-155)", async () => {
        // #given - a RETRYABLE_EXECUTED stage with 4 tickets
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should succeed with warning about multiple tickets
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).toContain("[1/4 tickets");
          expect(result.prepared.description).toContain("use prepareRetryableStage() for all");
        }
      });

      it("should return success result directly when single ticket", async () => {
        // #given - a RETRYABLE_EXECUTED stage with a single ticket
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should succeed without ticket count warning
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.prepared.description).not.toContain("[1/");
        }
      });

      it("should return first failed result when all tickets fail", async () => {
        // #given - a RETRYABLE_EXECUTED stage where all tickets fail preparation
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should return first failed result
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe("Ticket preparation failed");
        }
      });

      it("should use nova provider for nova target chain", async () => {
        // #given - a RETRYABLE_EXECUTED stage targeting Nova chain
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

        // #when - preparing transaction
        const result = await prepareTransaction(stage, mockContext);

        // #then - should succeed and use nova provider
        expect(result.success).toBe(true);
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
