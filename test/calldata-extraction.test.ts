import { describe, it, expect } from "vitest";
import { extractCalldataFromStage } from "../src/calldata";
import { TrackedStage } from "../src/types";

describe("extractCalldataFromStage", () => {
  it("extracts calldata from PROPOSAL_CREATED style stage", () => {
    // #given - a PROPOSAL_CREATED stage with calldata
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      chainId: 1,
      transactions: [],
      data: {
        calldatas: ["0x1234"],
        targets: ["0xABCD"],
        values: ["100"],
      },
    } as unknown as TrackedStage;

    // #when - extracting calldata
    const result = extractCalldataFromStage(stage);

    // #then - should extract all fields correctly
    expect(result.calldatas).toEqual(["0x1234"]);
    expect(result.targets).toEqual(["0xABCD"]);
    expect(result.values).toEqual(["100"]);
  });

  it("handles missing values in PROPOSAL_CREATED", () => {
    // #given - a PROPOSAL_CREATED stage with multiple calldatas
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      chainId: 1,
      transactions: [],
      data: {
        calldatas: ["0x1", "0x2"],
        targets: ["0xT1", "0xT2"],
        values: ["0", "0"],
      },
    } as unknown as TrackedStage;

    // #when - extracting calldata
    const result = extractCalldataFromStage(stage);

    // #then - should handle values correctly
    expect(result.calldatas).toEqual(["0x1", "0x2"]);
    expect(result.targets).toEqual(["0xT1", "0xT2"]);
    expect(result.values).toEqual(["0", "0"]);
  });

  it("throws error for mismatched array lengths in PROPOSAL_CREATED", () => {
    // #given - a stage with mismatched array lengths
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      chainId: 1,
      transactions: [],
      data: {
        calldatas: ["0x1", "0x2", "0x3"],
        targets: ["0xT1"], // Too short
        values: ["0", "0", "0", "0"], // Too long
      },
    } as unknown as TrackedStage;

    // #when/#then - should throw error for mismatch
    expect(() => extractCalldataFromStage(stage)).toThrow(/Mismatch in targets length/);
  });

  it("extracts calldata from Timelock stage (L1/L2)", () => {
    // #given - an L2_TIMELOCK stage with callScheduledData
    const stage = {
      type: "L2_TIMELOCK",
      status: "READY",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        operationId: "0xop",
        timelockAddress: "0xTL",
        callScheduledData: [
          {
            target: "0xTarget1",
            value: "100",
            data: "0xData1",
          },
          {
            target: "0xTarget2",
            value: "0",
            data: "0xData2",
          },
        ],
      },
    } as unknown as TrackedStage;

    // #when - extracting calldata
    const result = extractCalldataFromStage(stage);

    // #then - should extract from callScheduledData
    expect(result.calldatas).toEqual(["0xData1", "0xData2"]);
    expect(result.targets).toEqual(["0xTarget1", "0xTarget2"]);
    expect(result.values).toEqual(["100", "0"]);
  });

  it("returns empty arrays if no calldata found", () => {
    // #given - a stage with empty data
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      chainId: 1,
      transactions: [],
      data: {},
    } as unknown as TrackedStage;

    // #when - extracting calldata
    const result = extractCalldataFromStage(stage);

    // #then - should return empty arrays
    expect(result.calldatas).toEqual([]);
    expect(result.targets).toEqual([]);
    expect(result.values).toEqual([]);
  });
});
