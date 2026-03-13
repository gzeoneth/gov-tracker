/**
 * Tests for prepareExecuteTimelock standalone function.
 *
 * Verifies the standalone timelock execution preparation that works
 * without the full tracking pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";
import { prepareExecuteTimelock } from "../src/stages/timelock";
import * as timelockDiscovery from "../src/discovery/timelock-discovery";
import * as operationIdUtils from "../src/utils/operation-id";
import * as stageUtils from "../src/stages/utils";
import * as chainUtils from "../src/utils/chain";
import { CallScheduledData, TimelockOperationState } from "../src/types/timelock";
import { timelockInterface } from "../src/abis";

const mockProvider = {} as ethers.providers.Provider;
const TIMELOCK_ADDR = "0x" + "aa".repeat(20);
const OPERATION_ID = "0x" + "bb".repeat(32);
const SALT = "0x" + "cc".repeat(32);

function makeCallScheduledData(overrides: Partial<CallScheduledData> = {}): CallScheduledData {
  return {
    operationId: OPERATION_ID,
    index: BigNumber.from(0),
    target: "0x" + "11".repeat(20),
    value: BigNumber.from(0),
    data: "0xdeadbeef",
    predecessor: ethers.constants.HashZero,
    delay: BigNumber.from(259200),
    blockNumber: 1000,
    txHash: "0x" + "ff".repeat(32),
    logIndex: 0,
    timelockAddress: TIMELOCK_ADDR,
    ...overrides,
  };
}

function mockOperationState(
  state: TimelockOperationState,
  flags: { isOperation?: boolean; isPending?: boolean; isReady?: boolean; isDone?: boolean } = {}
) {
  return {
    state,
    isOperation: flags.isOperation ?? true,
    isPending: flags.isPending ?? false,
    isReady: flags.isReady ?? false,
    isDone: flags.isDone ?? false,
    timestamp: BigNumber.from(0),
  };
}

describe("prepareExecuteTimelock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock chain detection (provider.getNetwork() is not available in unit tests)
    vi.spyOn(chainUtils, "getChain").mockResolvedValue("arb1");
    // Mock checkOperationReady (uses multicall which needs real provider)
    vi.spyOn(stageUtils, "checkOperationReady").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fail when operation does not exist", async () => {
    // #given
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("UNKNOWN", { isOperation: false })
    );

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider);

    // #then
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("should fail when operation is not ready", async () => {
    // #given
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("PENDING", { isPending: true })
    );

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider);

    // #then
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not ready");
    }
  });

  it("should fail when no CallScheduled events found", async () => {
    // #given
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
    });

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider);

    // #then
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No CallScheduled events");
    }
  });

  it("should prepare a single execute transaction when salt validates", async () => {
    // #given
    const scheduledData = makeCallScheduledData();

    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData,
    });
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);
    vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(true);

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.prepared.to).toBe(TIMELOCK_ADDR);
      expect(result.prepared.operationId).toBe(OPERATION_ID);
      expect(result.prepared.description).toContain("execute()");

      const decoded = timelockInterface.decodeFunctionData("execute", result.prepared.data);
      expect(decoded[0]).toBe(scheduledData.target);
    }
  });

  it("should prepare an executeBatch transaction when batch salt validates", async () => {
    // #given
    const data1 = makeCallScheduledData({ index: BigNumber.from(0) });
    const data2 = makeCallScheduledData({
      index: BigNumber.from(1),
      target: "0x" + "22".repeat(20),
      data: "0xcafebabe",
    });

    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData: data1,
      allScheduledData: [data1, data2],
      isBatch: true,
    });
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(true);

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.prepared.description).toContain("executeBatch()");

      const decoded = timelockInterface.decodeFunctionData("executeBatch", result.prepared.data);
      expect(decoded[0]).toHaveLength(2);
      expect(decoded[0][0]).toBe(data1.target);
      expect(decoded[0][1]).toBe(data2.target);
    }
  });

  it("should fail when salt validation fails for both single and batch", async () => {
    // #given
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData: makeCallScheduledData(),
    });
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);
    vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(false);

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Salt validation failed");
    }
  });

  it("should allow preparing completed operations with prepareCompleted flag", async () => {
    // #given
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("DONE", { isDone: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "DONE",
      isReady: false,
      isDone: true,
      scheduledData: makeCallScheduledData(),
    });
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);
    vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(true);

    // #when
    const result = await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      prepareCompleted: true,
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(result.success).toBe(true);
  });

  it("should pass fromBlock to getTimelockState when provided", async () => {
    // #given
    const getTimelockStateSpy = vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData: makeCallScheduledData(),
    });
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);
    vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(true);

    // #when
    await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      fromBlock: 50_000_000,
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(getTimelockStateSpy).toHaveBeenCalledWith(
      TIMELOCK_ADDR,
      OPERATION_ID,
      mockProvider,
      expect.objectContaining({ fromBlock: 50_000_000 })
    );
  });

  it("should use predecessor from CallScheduled event data", async () => {
    // #given
    const customPredecessor = "0x" + "dd".repeat(32);
    const scheduledData = makeCallScheduledData({ predecessor: customPredecessor });

    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData,
    });
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);

    const validateSaltSpy = vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(true);

    // #when
    await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(validateSaltSpy).toHaveBeenCalledWith(
      OPERATION_ID,
      expect.objectContaining({ predecessor: customPredecessor })
    );
  });

  it("should default fromBlock to 0 when not provided", async () => {
    // #given
    const getTimelockStateSpy = vi.spyOn(timelockDiscovery, "getTimelockState").mockResolvedValue({
      operationId: OPERATION_ID,
      state: "READY",
      isReady: true,
      isDone: false,
      scheduledData: makeCallScheduledData(),
    });
    vi.spyOn(timelockDiscovery, "getTimelockOperationState").mockResolvedValue(
      mockOperationState("READY", { isReady: true })
    );
    vi.spyOn(operationIdUtils, "validateSaltBatch").mockReturnValue(false);
    vi.spyOn(operationIdUtils, "validateSalt").mockReturnValue(true);

    // #when
    await prepareExecuteTimelock(TIMELOCK_ADDR, OPERATION_ID, SALT, mockProvider, {
      skipRetryableValueCalculation: true,
    });

    // #then
    expect(getTimelockStateSpy).toHaveBeenCalledWith(
      TIMELOCK_ADDR,
      OPERATION_ID,
      mockProvider,
      expect.objectContaining({ fromBlock: 0 })
    );
  });
});
