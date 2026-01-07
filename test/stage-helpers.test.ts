/**
 * Tests for Stage Helpers
 *
 * Tests for serialization, validation, and helper utilities.
 */

import { describe, it, expect } from "vitest";
import { ethers, BigNumber } from "ethers";
import {
  serialize,
  deserialize,
  serializeCallScheduledData,
  deserializeCallScheduledData,
  serializeCallScheduledDataArray,
  deserializeCallScheduledDataArray,
  createTimelockStageData,
  collectAllScheduledData,
  buildExecutionPayloadData,
  validateStageForPrepare,
  bulkPrepareError,
  simpleBulkError,
  validateStageForBulkPrepare,
  validateStageForSimpleBulk,
} from "../src/utils/stage-helpers";
import { StageBuilder } from "../src/stages/stage-builder";
import type { CallScheduledData, SerializedCallScheduledData, TimelockState } from "../src/types";

describe("Serialization Utilities", () => {
  describe("serialize", () => {
    it("should convert BigNumber fields to strings", () => {
      const data = {
        index: BigNumber.from(5),
        value: BigNumber.from("1000000000000000000"),
        name: "test",
        count: 42,
      };

      const result = serialize(data, ["index", "value"]);

      expect(result.index).toBe("5");
      expect(result.value).toBe("1000000000000000000");
      expect(result.name).toBe("test");
      expect(result.count).toBe(42);
    });

    it("should handle null/undefined values", () => {
      const data = {
        index: null,
        value: undefined,
        name: "test",
      };

      const result = serialize(data, ["index", "value"]);

      expect(result.index).toBeNull();
      expect(result.value).toBeUndefined();
    });

    it("should not modify non-BigNumber fields", () => {
      const data = {
        address: "0x1234",
        isActive: true,
        items: [1, 2, 3],
      };

      const result = serialize(data, ["nonExistent"]);

      expect(result.address).toBe("0x1234");
      expect(result.isActive).toBe(true);
      expect(result.items).toEqual([1, 2, 3]);
    });
  });

  describe("deserialize", () => {
    it("should convert string fields to BigNumber", () => {
      const data = {
        index: "5",
        value: "1000000000000000000",
        name: "test",
      };

      const result = deserialize(data, ["index", "value"]);

      expect(BigNumber.isBigNumber(result.index)).toBe(true);
      expect((result.index as BigNumber).toString()).toBe("5");
      expect(BigNumber.isBigNumber(result.value)).toBe(true);
      expect((result.value as BigNumber).toString()).toBe("1000000000000000000");
      expect(result.name).toBe("test");
    });

    it("should not modify non-string fields", () => {
      const data = {
        index: 5, // number, not string
        value: "100",
      };

      const result = deserialize(data, ["index", "value"]);

      // index is number, should remain number
      expect(result.index).toBe(5);
      // value is string, should become BigNumber
      expect(BigNumber.isBigNumber(result.value)).toBe(true);
    });
  });

  describe("serializeCallScheduledData", () => {
    it("should serialize all BigNumber fields", () => {
      const data: CallScheduledData = {
        operationId: "0xabc",
        index: BigNumber.from(0),
        target: "0x1111111111111111111111111111111111111111",
        value: BigNumber.from("1000000000000000000"),
        data: "0xabcd",
        predecessor: ethers.constants.HashZero,
        delay: BigNumber.from(86400),
        txHash: "0xdef",
        blockNumber: 12345,
      };

      const result = serializeCallScheduledData(data);

      expect(result.index).toBe("0");
      expect(result.value).toBe("1000000000000000000");
      expect(result.delay).toBe("86400");
      expect(result.target).toBe("0x1111111111111111111111111111111111111111");
      expect(result.operationId).toBe("0xabc");
    });
  });

  describe("deserializeCallScheduledData", () => {
    it("should deserialize all string fields to BigNumber", () => {
      const data: SerializedCallScheduledData = {
        operationId: "0xabc",
        index: "0",
        target: "0x1111111111111111111111111111111111111111",
        value: "1000000000000000000",
        data: "0xabcd",
        predecessor: ethers.constants.HashZero,
        delay: "86400",
        txHash: "0xdef",
        blockNumber: 12345,
      };

      const result = deserializeCallScheduledData(data);

      expect(BigNumber.isBigNumber(result.index)).toBe(true);
      expect(result.index.toNumber()).toBe(0);
      expect(BigNumber.isBigNumber(result.value)).toBe(true);
      expect(result.value.toString()).toBe("1000000000000000000");
      expect(BigNumber.isBigNumber(result.delay)).toBe(true);
      expect(result.delay.toNumber()).toBe(86400);
    });
  });

  describe("serializeCallScheduledDataArray", () => {
    it("should serialize array of CallScheduledData", () => {
      const dataArray: CallScheduledData[] = [
        {
          operationId: "0xabc",
          index: BigNumber.from(0),
          target: "0x1111111111111111111111111111111111111111",
          value: BigNumber.from(0),
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xdef",
          blockNumber: 12345,
        },
        {
          operationId: "0xabc",
          index: BigNumber.from(1),
          target: "0x2222222222222222222222222222222222222222",
          value: BigNumber.from(100),
          data: "0xab",
          predecessor: ethers.constants.HashZero,
          delay: BigNumber.from(86400),
          txHash: "0xdef",
          blockNumber: 12345,
        },
      ];

      const result = serializeCallScheduledDataArray(dataArray);

      expect(result.length).toBe(2);
      expect(result[0].index).toBe("0");
      expect(result[1].index).toBe("1");
      expect(result[1].value).toBe("100");
    });
  });

  describe("deserializeCallScheduledDataArray", () => {
    it("should deserialize array of SerializedCallScheduledData", () => {
      const dataArray: SerializedCallScheduledData[] = [
        {
          operationId: "0xabc",
          index: "0",
          target: "0x1111111111111111111111111111111111111111",
          value: "0",
          data: "0x",
          predecessor: ethers.constants.HashZero,
          delay: "86400",
          txHash: "0xdef",
          blockNumber: 12345,
        },
        {
          operationId: "0xabc",
          index: "1",
          target: "0x2222222222222222222222222222222222222222",
          value: "100",
          data: "0xab",
          predecessor: ethers.constants.HashZero,
          delay: "86400",
          txHash: "0xdef",
          blockNumber: 12345,
        },
      ];

      const result = deserializeCallScheduledDataArray(dataArray);

      expect(result.length).toBe(2);
      expect(result[0].index.toNumber()).toBe(0);
      expect(result[1].index.toNumber()).toBe(1);
      expect(result[1].value.toNumber()).toBe(100);
    });
  });
});

describe("createTimelockStageData", () => {
  it("should extract timelock data from L2_TIMELOCK stage", () => {
    const serializedData: SerializedCallScheduledData[] = [
      {
        operationId: "0xabc123",
        index: "0",
        target: "0x1111111111111111111111111111111111111111",
        value: "0",
        data: "0xabcd",
        predecessor: ethers.constants.HashZero,
        delay: "86400",
        txHash: "0xdef",
        blockNumber: 12345,
      },
    ];

    const stage = new StageBuilder("L2_TIMELOCK", "arb1")
      .status("READY")
      .data({
        timelockAddress: "0x3333333333333333333333333333333333333333",
        operationId: "0xabc123",
        callScheduledData: serializedData,
      })
      .build();

    const result = createTimelockStageData(stage);

    expect(result).not.toBeNull();
    expect(result?.timelockAddress).toBe("0x3333333333333333333333333333333333333333");
    expect(result?.operationId).toBe("0xabc123");
    expect(result?.callScheduledData.length).toBe(1);
    expect(result?.callScheduledData[0].index.toNumber()).toBe(0);
  });

  it("should extract timelock data from L1_TIMELOCK stage", () => {
    const serializedData: SerializedCallScheduledData[] = [
      {
        operationId: "0xdef456",
        index: "0",
        target: "0x1111111111111111111111111111111111111111",
        value: "0",
        data: "0x",
        predecessor: ethers.constants.HashZero,
        delay: "259200",
        txHash: "0xghi",
        blockNumber: 21000000,
      },
    ];

    const stage = new StageBuilder("L1_TIMELOCK", "ethereum")
      .status("READY")
      .data({
        timelockAddress: "0x4444444444444444444444444444444444444444",
        operationId: "0xdef456",
        callScheduledData: serializedData,
      })
      .build();

    const result = createTimelockStageData(stage);

    expect(result).not.toBeNull();
    expect(result?.timelockAddress).toBe("0x4444444444444444444444444444444444444444");
    expect(result?.operationId).toBe("0xdef456");
  });

  it("should include Security Council data if present", () => {
    const serializedData: SerializedCallScheduledData[] = [
      {
        operationId: "0xsc123",
        index: "0",
        target: "0x1111111111111111111111111111111111111111",
        value: "0",
        data: "0x",
        predecessor: ethers.constants.HashZero,
        delay: "86400",
        txHash: "0xsc",
        blockNumber: 12345,
      },
    ];

    const stage = new StageBuilder("L2_TIMELOCK", "arb1")
      .status("READY")
      .data({
        timelockAddress: "0x3333333333333333333333333333333333333333",
        operationId: "0xsc123",
        callScheduledData: serializedData,
        isSecurityCouncilOperation: true,
        securityCouncilMembers: ["0xmember1", "0xmember2"],
        securityCouncilNonce: "5",
      })
      .build();

    const result = createTimelockStageData(stage);

    expect(result?.isSecurityCouncilOperation).toBe(true);
    expect(result?.securityCouncilMembers).toEqual(["0xmember1", "0xmember2"]);
    expect(result?.securityCouncilNonce).toBe("5");
  });

  it("should return null for non-timelock stages", () => {
    const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("COMPLETED").build();

    const result = createTimelockStageData(stage);

    expect(result).toBeNull();
  });

  it("should return null when missing required data", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1")
      .status("READY")
      .data({
        timelockAddress: "0x3333333333333333333333333333333333333333",
        // Missing operationId and callScheduledData
      })
      .build();

    const result = createTimelockStageData(stage);

    expect(result).toBeNull();
  });

  it("should return null for empty callScheduledData array", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1")
      .status("READY")
      .data({
        timelockAddress: "0x3333333333333333333333333333333333333333",
        operationId: "0xabc",
        callScheduledData: [],
      })
      .build();

    const result = createTimelockStageData(stage);

    expect(result).toBeNull();
  });
});

describe("collectAllScheduledData", () => {
  it("should return allScheduledData when available", () => {
    const data1: CallScheduledData = {
      operationId: "0xabc",
      index: BigNumber.from(0),
      target: "0x1111111111111111111111111111111111111111",
      value: BigNumber.from(0),
      data: "0x",
      predecessor: ethers.constants.HashZero,
      delay: BigNumber.from(86400),
      txHash: "0xdef",
      blockNumber: 12345,
    };
    const data2: CallScheduledData = {
      operationId: "0xabc",
      index: BigNumber.from(1),
      target: "0x2222222222222222222222222222222222222222",
      value: BigNumber.from(0),
      data: "0xab",
      predecessor: ethers.constants.HashZero,
      delay: BigNumber.from(86400),
      txHash: "0xdef",
      blockNumber: 12345,
    };

    const timelockState: TimelockState = {
      operationId: "0xabc",
      scheduledData: data1,
      allScheduledData: [data1, data2],
    };

    const result = collectAllScheduledData(timelockState);

    expect(result.length).toBe(2);
    expect(result[0].target).toBe("0x1111111111111111111111111111111111111111");
    expect(result[1].target).toBe("0x2222222222222222222222222222222222222222");
  });

  it("should return array with scheduledData when allScheduledData not available", () => {
    const data: CallScheduledData = {
      operationId: "0xabc",
      index: BigNumber.from(0),
      target: "0x1111111111111111111111111111111111111111",
      value: BigNumber.from(0),
      data: "0x",
      predecessor: ethers.constants.HashZero,
      delay: BigNumber.from(86400),
      txHash: "0xdef",
      blockNumber: 12345,
    };

    const timelockState: TimelockState = {
      operationId: "0xabc",
      scheduledData: data,
    };

    const result = collectAllScheduledData(timelockState);

    expect(result.length).toBe(1);
    expect(result[0].target).toBe("0x1111111111111111111111111111111111111111");
  });

  it("should return empty array when no data available", () => {
    const timelockState: TimelockState = {
      operationId: "0xabc",
    };

    const result = collectAllScheduledData(timelockState);

    expect(result).toEqual([]);
  });
});

describe("buildExecutionPayloadData", () => {
  it("should build payload with serialized data", () => {
    const allData: CallScheduledData[] = [
      {
        operationId: "0xabc",
        index: BigNumber.from(0),
        target: "0x1111111111111111111111111111111111111111",
        value: BigNumber.from(100),
        data: "0xabcd",
        predecessor: ethers.constants.HashZero,
        delay: BigNumber.from(86400),
        txHash: "0xdef",
        blockNumber: 12345,
      },
    ];

    const result = buildExecutionPayloadData("0xTimelock", "0xOpId123", allData);

    expect(result.timelockAddress).toBe("0xTimelock");
    expect(result.operationId).toBe("0xOpId123");
    expect(result.callScheduledData).toBeDefined();
    expect((result.callScheduledData as SerializedCallScheduledData[])[0].value).toBe("100");
  });

  it("should not include callScheduledData when array is empty", () => {
    const result = buildExecutionPayloadData("0xTimelock", "0xOpId123", []);

    expect(result.timelockAddress).toBe("0xTimelock");
    expect(result.operationId).toBe("0xOpId123");
    expect(result.callScheduledData).toBeUndefined();
  });
});

describe("validateStageForPrepare", () => {
  it("should return null for READY stage", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();

    const result = validateStageForPrepare(stage);

    expect(result).toBeNull();
  });

  it("should return error for non-READY stage", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build();

    const result = validateStageForPrepare(stage);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("not ready");
  });

  it("should allow non-READY with prepareCompleted=true", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build();

    const result = validateStageForPrepare(stage, { prepareCompleted: true });

    expect(result).toBeNull();
  });

  it("should check expectedTypes", () => {
    const stage = new StageBuilder("VOTING_ACTIVE", "arb1").status("READY").build();

    const result = validateStageForPrepare(stage, {
      expectedTypes: ["L2_TIMELOCK", "L1_TIMELOCK"],
    });

    expect(result).not.toBeNull();
    expect(result?.error).toContain("Unexpected stage type");
  });

  it("should pass when stage type matches expectedTypes", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();

    const result = validateStageForPrepare(stage, {
      expectedTypes: ["L2_TIMELOCK", "L1_TIMELOCK"],
    });

    expect(result).toBeNull();
  });
});

describe("bulkPrepareError", () => {
  it("should create error result with target chain", () => {
    const result = bulkPrepareError("Test error", "ethereum");

    expect(result.total).toBe(0);
    expect(result.results.length).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("Test error");
    expect(result.targetChain).toBe("ethereum");
  });
});

describe("simpleBulkError", () => {
  it("should create simple error result", () => {
    const result = simpleBulkError("Simple error");

    expect(result.total).toBe(0);
    expect(result.results.length).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("Simple error");
  });
});

describe("validateStageForBulkPrepare", () => {
  it("should return null for valid stage", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("READY").build();

    const result = validateStageForBulkPrepare(stage, "arb1");

    expect(result).toBeNull();
  });

  it("should return error result for invalid stage", () => {
    const stage = new StageBuilder("L2_TIMELOCK", "arb1").status("PENDING").build();

    const result = validateStageForBulkPrepare(stage, "arb1");

    expect(result).not.toBeNull();
    expect(result?.total).toBe(0);
    expect(result?.targetChain).toBe("arb1");
  });
});

describe("validateStageForSimpleBulk", () => {
  it("should return null for valid stage", () => {
    const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("READY").build();

    const result = validateStageForSimpleBulk(stage);

    expect(result).toBeNull();
  });

  it("should return error result for invalid stage", () => {
    const stage = new StageBuilder("L2_TO_L1_MESSAGE", "arb1").status("COMPLETED").build();

    const result = validateStageForSimpleBulk(stage);

    expect(result).not.toBeNull();
    expect(result?.total).toBe(0);
  });
});
