/**
 * Timelock Module Tests
 *
 * Tests for timelock tracking functions, focusing on edge cases
 * and defensive code paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";
import {
  trackL2Timelock,
  prepareTimelockBatch,
  prepareTimelockStage,
} from "../src/stages/timelock";
import * as timelockDiscovery from "../src/discovery/timelock-discovery";
import * as stageUtils from "../src/stages/utils";
import * as operationIdUtils from "../src/utils/operation-id";
import { ADDRESSES } from "../src/constants";
import { CallScheduledData, TimelockOperationState } from "../src/types/timelock";
import { TimelockStageData } from "../src/types/stages";
import { getStageData } from "../src/types/stages";
import { StageBuilder } from "../src/stages/builder";

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

    it("should return NOT_STARTED when operationId is empty", async () => {
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

    it("should return NOT_STARTED when operation is not scheduled", async () => {
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

    it("should use cachedExecutionTxHash when provided and receipt exists", async () => {
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

  describe("prepareTimelockBatch", () => {
    const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
    const operationId = "0x" + "a".repeat(64);
    const mockProvider = {} as ethers.providers.Provider;

    const mockStageData: TimelockStageData = {
      operationId,
      timelockAddress,
      salt: ethers.constants.HashZero,
      predecessor: ethers.constants.HashZero,
      callScheduledData: [],
    };

    const validBatchParams = {
      targets: ["0x" + "1".repeat(40), "0x" + "2".repeat(40)],
      values: [BigNumber.from(0), BigNumber.from(0)],
      payloads: ["0x1234", "0x5678"],
      predecessor: ethers.constants.HashZero,
      salt: ethers.constants.HashZero,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return error when operation is not ready (line 745)", async () => {
      // #given - checkOperationReady returns an error result
      vi.spyOn(stageUtils, "checkOperationReady").mockResolvedValue({
        success: false,
        error: "Operation is not ready for execution",
      });

      // #when - preparing batch without prepareCompleted flag
      const result = await prepareTimelockBatch(
        timelockAddress,
        validBatchParams,
        operationId,
        mockStageData,
        mockProvider,
        { prepareCompleted: false }
      );

      // #then - returns the error from checkOperationReady
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Operation is not ready for execution");
      }
    });

    it("should return error when salt validation fails (line 759)", async () => {
      // #given - operation is ready but salt validation fails
      vi.spyOn(stageUtils, "checkOperationReady").mockResolvedValue(null);
      vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);

      // #when - preparing batch with invalid salt
      const result = await prepareTimelockBatch(
        timelockAddress,
        validBatchParams,
        operationId,
        mockStageData,
        mockProvider,
        { skipSaltValidation: false }
      );

      // #then - returns salt validation error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Salt validation failed for batch operation");
        expect(result.error).toContain(operationId);
      }
    });

    it("should skip checkOperationReady when prepareCompleted is true", async () => {
      // #given - prepareCompleted option is true and salt validation succeeds
      const checkOperationReadySpy = vi.spyOn(stageUtils, "checkOperationReady");
      vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(true);

      const mockProviderWithNetwork = {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 42161 }),
        getGasPrice: vi.fn().mockResolvedValue(BigNumber.from(100000000)),
      } as unknown as ethers.providers.Provider;

      // #when - preparing batch with prepareCompleted=true
      const result = await prepareTimelockBatch(
        timelockAddress,
        validBatchParams,
        operationId,
        mockStageData,
        mockProviderWithNetwork,
        { prepareCompleted: true, skipRetryableValueCalculation: true }
      );

      // #then - checkOperationReady is not called and operation succeeds
      expect(checkOperationReadySpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("prepareTimelockStage", () => {
    const timelockAddress = ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK;
    const operationId = "0x" + "b".repeat(64);
    const mockProvider = {} as ethers.providers.Provider;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return error when stage is not READY (via validateStageForPrepare)", async () => {
      // #given - stage with PENDING status
      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("PENDING")
        .data({ operationId, timelockAddress })
        .build();

      // #when - preparing non-ready stage
      const result = await prepareTimelockStage(stage, mockProvider);

      // #then - returns validation error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Stage is not ready");
      }
    });

    it("should return error when stage is not a timelock stage (line 825)", async () => {
      // #given - READY stage that is not a timelock type
      const stage = new StageBuilder("PROPOSAL_CREATED", "arb1")
        .status("READY")
        .data({ proposalId: "123" })
        .build();

      // #when - preparing non-timelock stage with prepareCompleted to bypass status check
      const result = await prepareTimelockStage(stage, mockProvider, { prepareCompleted: true });

      // #then - returns "not a timelock stage" error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Stage is not a timelock stage");
      }
    });

    it("should return error when timelockAddress is missing (line 830)", async () => {
      // #given - createTimelockStageData returns payload without timelockAddress
      vi.spyOn(stageUtils, "createTimelockStageData").mockReturnValue({
        timelockAddress: "",
        operationId,
        callScheduledData: [],
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId })
        .build();

      // #when - preparing stage with missing timelockAddress
      const result = await prepareTimelockStage(stage, mockProvider);

      // #then - returns missing fields error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Missing timelock address or operation ID");
      }
    });

    it("should return error when operationId is missing (line 830)", async () => {
      // #given - createTimelockStageData returns payload without operationId
      vi.spyOn(stageUtils, "createTimelockStageData").mockReturnValue({
        timelockAddress,
        operationId: "",
        callScheduledData: [],
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ timelockAddress })
        .build();

      // #when - preparing stage with missing operationId
      const result = await prepareTimelockStage(stage, mockProvider);

      // #then - returns missing fields error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Missing timelock address or operation ID");
      }
    });

    it("should return error when callScheduledData is empty (line 835)", async () => {
      // #given - createTimelockStageData returns payload with empty callScheduledData
      vi.spyOn(stageUtils, "createTimelockStageData").mockReturnValue({
        timelockAddress,
        operationId,
        callScheduledData: [],
      });

      const stage = new StageBuilder("L2_TIMELOCK", "arb1")
        .status("READY")
        .data({ operationId, timelockAddress })
        .build();

      // #when - preparing stage with empty callScheduledData
      const result = await prepareTimelockStage(stage, mockProvider);

      // #then - returns missing callScheduledData error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Missing callScheduledData for preparation");
      }
    });
  });
});
