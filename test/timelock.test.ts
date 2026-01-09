/**
 * Timelock Module Tests
 *
 * Tests for timelock tracking functions, focusing on edge cases
 * and defensive code paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";
import { trackL2Timelock } from "../src/stages/timelock";
import * as timelockDiscovery from "../src/discovery/timelock-discovery";
import { ADDRESSES } from "../src/constants";
import { CallScheduledData, TimelockOperationState } from "../src/types/timelock";
import { getStageData } from "../src/types/stages";

describe("Timelock Module", () => {
  describe("trackL2Timelock", () => {
    const mockProvider = {} as ethers.providers.Provider;
    const mockCallScheduledData: CallScheduledData = {
      operationId: "0x" + "1".repeat(64),
      index: BigNumber.from(0),
      target: "0x" + "2".repeat(40),
      value: BigNumber.from(0),
      data: "0x1234",
      predecessor: ethers.constants.HashZero,
      delay: BigNumber.from(259200),
      blockNumber: 100,
      txHash: "0x" + "3".repeat(64),
      logIndex: 0,
      timelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return NOT_STARTED when operationId is empty (line 207)", async () => {
      // #given - empty operationId
      const emptyOperationId = "";

      // #when - track with empty operationId
      const result = await trackL2Timelock(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        emptyOperationId,
        mockProvider,
        1,
        mockCallScheduledData
      );

      // #then - should return NOT_STARTED stage
      expect(result.stage.status).toBe("NOT_STARTED");
      expect(result.timelockState).toBeNull();
      expect(result.operationState).toBeNull();
      expect(result.executionTxHash).toBeNull();
    });

    it("should return NOT_STARTED when operation is not scheduled (line 219)", async () => {
      // #given - operationId exists but operation not scheduled
      const operationId = "0x" + "a".repeat(64);

      vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue({
        state: "UNKNOWN" as TimelockOperationState,
        isOperation: false,
        isPending: false,
        isReady: false,
        isDone: false,
        timestamp: BigNumber.from(0),
      });

      // #when - track with unscheduled operation
      const result = await trackL2Timelock(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProvider,
        1,
        mockCallScheduledData
      );

      // #then - should return NOT_STARTED with reason
      expect(result.stage.status).toBe("NOT_STARTED");
      const data = getStageData(result.stage, "L2_TIMELOCK");
      expect(data?.operationId).toBe(operationId);
      expect(data?.reason).toContain("not scheduled yet");
      expect(result.timelockState).toBeNull();
      expect(result.operationState).toBeNull();
    });

    it("should use cachedExecutionTxHash when provided and receipt exists (line 360-373)", async () => {
      // #given - valid operationId with cached execution tx hash
      const operationId = "0x" + "b".repeat(64);
      const cachedTxHash = "0x" + "c".repeat(64);
      const mockReceipt = {
        blockNumber: 12345,
        transactionHash: cachedTxHash,
        logs: [],
      };

      // Mock operation state as DONE (already executed)
      vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue({
        state: "DONE" as TimelockOperationState,
        isOperation: true,
        isPending: false,
        isReady: false,
        isDone: true,
        timestamp: BigNumber.from(1700000000),
      });

      // Mock getTimelockState to return scheduled data with all required fields
      vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
        operationId: operationId,
        state: "DONE" as TimelockOperationState,
        isReady: false,
        isDone: true,
        scheduledData: mockCallScheduledData,
        executedData: undefined,
      });

      // Mock provider methods
      const mockGetTxReceipt = vi.fn().mockResolvedValue(mockReceipt);
      const mockGetBlock = vi.fn().mockResolvedValue({ timestamp: 1700000000 });
      const mockProviderWithMethods = {
        ...mockProvider,
        getTransactionReceipt: mockGetTxReceipt,
        getBlock: mockGetBlock,
      } as unknown as ethers.providers.Provider;

      // #when - track with cachedExecutionTxHash option
      const result = await trackL2Timelock(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        operationId,
        mockProviderWithMethods,
        1,
        mockCallScheduledData,
        { cachedExecutionTxHash: cachedTxHash }
      );

      // #then - should use cached tx and return COMPLETED
      expect(result.stage.status).toBe("COMPLETED");
      expect(result.executionTxHash).toBe(cachedTxHash);
      expect(result.executionBlock).toBe(12345);
      expect(mockGetTxReceipt).toHaveBeenCalledWith(cachedTxHash);
    });
  });
});
