/**
 * Salt Computation Tests
 *
 * Tests for pure functions in salt-computation module.
 * No RPC calls required.
 */

import { describe, it, expect } from "vitest";
import { ethers, BigNumber } from "ethers";
import {
  saltFromDescription,
  decodeL1TimelockSchedule,
  computeL1TimelockSalt,
  computeL2TimelockSalt,
} from "../src/utils/salt-computation";
import { timelockInterface } from "../src/abis";
import type { TrackedStage } from "../src/types";

describe("Salt Computation", () => {
  describe("saltFromDescription", () => {
    it("should return keccak256 hash of description", () => {
      // #given - a proposal description string
      const description = "AIP-1: Some proposal";
      const expected = ethers.utils.id(description);

      // #when - computing salt from description
      const salt = saltFromDescription(description);

      // #then - salt matches keccak256 hash and is valid hex format
      expect(salt).toBe(expected);
      expect(salt).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("should return different hashes for different descriptions", () => {
      // #given - two different proposal descriptions
      const salt1 = saltFromDescription("Proposal A");
      const salt2 = saltFromDescription("Proposal B");

      // #then - salts are different
      expect(salt1).not.toBe(salt2);
    });

    it("should handle empty string", () => {
      // #given - an empty description string
      // #when - computing salt from empty string
      const salt = saltFromDescription("");

      // #then - returns hash of empty string
      expect(salt).toBe(ethers.utils.id(""));
    });

    it("should handle special characters", () => {
      // #given - a description with emoji and unicode characters
      const description = "AIP-1: Test proposal with emoji 🚀 and unicode 中文";

      // #when - computing salt from description with special chars
      const salt = saltFromDescription(description);

      // #then - correctly hashes special characters
      expect(salt).toBe(ethers.utils.id(description));
    });
  });

  describe("decodeL1TimelockSchedule", () => {
    it("should decode scheduleBatch call", () => {
      // #given - encoded scheduleBatch call with multiple targets
      const targets = [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ];
      const values = [BigNumber.from(0), BigNumber.from(1000)];
      const payloads = ["0xabcdef", "0x123456"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test");
      const delay = BigNumber.from(259200);

      const encoded = timelockInterface.encodeFunctionData("scheduleBatch", [
        targets,
        values,
        payloads,
        predecessor,
        salt,
        delay,
      ]);

      // #when - decoding the scheduleBatch calldata
      const decoded = decodeL1TimelockSchedule(encoded);

      // #then - all batch parameters are correctly decoded
      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "batch") {
        expect(decoded.targets).toEqual(targets);
        expect(decoded.values[0].eq(values[0])).toBe(true);
        expect(decoded.values[1].eq(values[1])).toBe(true);
        expect(decoded.payloads).toEqual(payloads);
        expect(decoded.predecessor).toBe(predecessor);
        expect(decoded.salt).toBe(salt);
        expect(decoded.delay.eq(delay)).toBe(true);
      }
    });

    it("should decode schedule call", () => {
      // #given - encoded single schedule call
      const target = "0x1111111111111111111111111111111111111111";
      const value = BigNumber.from(0);
      const data = "0xabcdef";
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test");
      const delay = BigNumber.from(259200);

      const encoded = timelockInterface.encodeFunctionData("schedule", [
        target,
        value,
        data,
        predecessor,
        salt,
        delay,
      ]);

      // #when - decoding the single schedule calldata
      const decoded = decodeL1TimelockSchedule(encoded);

      // #then - all single schedule parameters are correctly decoded
      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "single") {
        expect(decoded.target).toBe(target);
        expect(decoded.value.eq(value)).toBe(true);
        expect(decoded.data).toBe(data);
        expect(decoded.predecessor).toBe(predecessor);
        expect(decoded.salt).toBe(salt);
        expect(decoded.delay.eq(delay)).toBe(true);
      }
    });

    it("should decode scheduleBatch with empty arrays", () => {
      // #given - encoded scheduleBatch call with empty arrays
      const encoded = timelockInterface.encodeFunctionData("scheduleBatch", [
        [],
        [],
        [],
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        BigNumber.from(0),
      ]);

      // #when - decoding the empty batch calldata
      const decoded = decodeL1TimelockSchedule(encoded);

      // #then - returns batch type with empty arrays
      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "batch") {
        expect(decoded.targets).toEqual([]);
        expect(decoded.values).toEqual([]);
        expect(decoded.payloads).toEqual([]);
      }
    });

    it("should decode schedule with zero value and empty data", () => {
      // #given - encoded schedule call with zero value and empty data
      const encoded = timelockInterface.encodeFunctionData("schedule", [
        "0x1111111111111111111111111111111111111111",
        BigNumber.from(0),
        "0x",
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        BigNumber.from(0),
      ]);

      // #when - decoding the schedule calldata
      const decoded = decodeL1TimelockSchedule(encoded);

      // #then - data field is empty hex
      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "single") {
        expect(decoded.data).toBe("0x");
      }
    });
  });

  describe("computeL1TimelockSalt", () => {
    it("should return HashZero when no stages provided", () => {
      // #given - no stages array provided
      // #when - computing L1 timelock salt with no args
      const result = computeL1TimelockSalt();

      // #then - returns HashZero salt and undefined predecessor
      expect(result.salt).toBe(ethers.constants.HashZero);
      expect(result.predecessor).toBeUndefined();
    });

    it("should return HashZero when no L2_TO_L1_MESSAGE stage", () => {
      // #given - stages array without L2_TO_L1_MESSAGE stage
      const stages = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ] as unknown as TrackedStage[];

      // #when - computing L1 timelock salt
      const result = computeL1TimelockSalt(stages);

      // #then - returns HashZero as fallback
      expect(result.salt).toBe(ethers.constants.HashZero);
    });

    it("should return HashZero when L2_TO_L1_MESSAGE has no l2ToL1TxEvent", () => {
      // #given - L2_TO_L1_MESSAGE stage without l2ToL1TxEvent data
      const stages = [
        {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ] as unknown as TrackedStage[];

      // #when - computing L1 timelock salt
      const result = computeL1TimelockSalt(stages);

      // #then - returns HashZero as fallback
      expect(result.salt).toBe(ethers.constants.HashZero);
    });

    it("should decode salt and predecessor from l2ToL1TxEvent data", () => {
      // #given - L2_TO_L1_MESSAGE stage with scheduleBatch calldata containing salt and predecessor
      const expectedSalt = ethers.utils.id("test-salt");
      const expectedPredecessor = "0x" + "ab".repeat(32);

      const encoded = timelockInterface.encodeFunctionData("scheduleBatch", [
        ["0x1111111111111111111111111111111111111111"],
        [BigNumber.from(0)],
        ["0x1234"],
        expectedPredecessor,
        expectedSalt,
        BigNumber.from(259200),
      ]);

      const stages = [
        {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2ToL1TxEvent: {
              data: encoded,
              caller: "0x1111111111111111111111111111111111111111",
              destination: "0x2222222222222222222222222222222222222222",
              hash: "0x" + "aa".repeat(32),
              position: BigNumber.from(1),
              arbBlockNum: BigNumber.from(1000),
              ethBlockNum: BigNumber.from(500),
              timestamp: BigNumber.from(Date.now()),
              callvalue: BigNumber.from(0),
            },
          },
        },
      ] as unknown as TrackedStage[];

      // #when - computing L1 timelock salt from stages
      const result = computeL1TimelockSalt(stages);

      // #then - extracts salt and predecessor from decoded calldata
      expect(result.salt).toBe(expectedSalt);
      expect(result.predecessor).toBe(expectedPredecessor);
    });

    it("should decode single schedule call salt", () => {
      // #given - L2_TO_L1_MESSAGE stage with single schedule calldata
      const expectedSalt = ethers.utils.id("single-schedule-salt");

      const encoded = timelockInterface.encodeFunctionData("schedule", [
        "0x1111111111111111111111111111111111111111",
        BigNumber.from(0),
        "0x1234",
        ethers.constants.HashZero,
        expectedSalt,
        BigNumber.from(259200),
      ]);

      const stages = [
        {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            l2ToL1TxEvent: {
              data: encoded,
              caller: "0x1111111111111111111111111111111111111111",
              destination: "0x2222222222222222222222222222222222222222",
              hash: "0x" + "aa".repeat(32),
              position: BigNumber.from(1),
              arbBlockNum: BigNumber.from(1000),
              ethBlockNum: BigNumber.from(500),
              timestamp: BigNumber.from(Date.now()),
              callvalue: BigNumber.from(0),
            },
          },
        },
      ] as unknown as TrackedStage[];

      // #when - computing L1 timelock salt from stages
      const result = computeL1TimelockSalt(stages);

      // #then - extracts salt from single schedule call, predecessor is HashZero
      expect(result.salt).toBe(expectedSalt);
      expect(result.predecessor).toBe(ethers.constants.HashZero);
    });
  });

  describe("computeL2TimelockSalt", () => {
    it("should return HashZero when no allStages provided", async () => {
      // #given - empty stage data with no allStages
      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({});

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should return HashZero when allStages is empty", async () => {
      // #given - empty stages array
      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({}, []);

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should return HashZero when no PROPOSAL_CREATED stage", async () => {
      // #given - stages array without PROPOSAL_CREATED stage
      const stages = [
        {
          type: "VOTING_ACTIVE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ] as unknown as TrackedStage[];

      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({}, stages);

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should return HashZero when PROPOSAL_CREATED has no description", async () => {
      // #given - PROPOSAL_CREATED stage without description field
      const stages = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            proposalId: "12345",
          },
        },
      ] as unknown as TrackedStage[];

      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({}, stages);

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should derive salt from proposal description (governor path)", async () => {
      // #given - PROPOSAL_CREATED stage with description
      const description = "AIP-1.2: Test Proposal for Coverage";
      const expectedSalt = ethers.utils.id(description);

      const stages = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {
            proposalId: "12345",
            description,
          },
        },
      ] as unknown as TrackedStage[];

      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({}, stages);

      // #then - derives salt from proposal description
      expect(result).toBe(expectedSalt);
    });

    it("should derive salt from description even with empty stageData", async () => {
      // #given - multiple stages with description only in PROPOSAL_CREATED
      const description = "Another test description";
      const expectedSalt = saltFromDescription(description);

      const stages = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: { description },
        },
        {
          type: "VOTING_ACTIVE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ] as unknown as TrackedStage[];

      // #when - computing L2 timelock salt with non-SC flag
      const result = await computeL2TimelockSalt({ isSecurityCouncilOperation: false }, stages);

      // #then - derives salt from proposal description
      expect(result).toBe(expectedSalt);
    });

    it("should handle SC operation flag without required fields (fallback to HashZero)", async () => {
      // #given - SC operation flag set but no members or nonce
      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({
        isSecurityCouncilOperation: true,
      });

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should handle SC operation with members but no nonce (fallback)", async () => {
      // #given - SC operation with members but missing nonce
      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({
        isSecurityCouncilOperation: true,
        securityCouncilMembers: ["0x1111111111111111111111111111111111111111"],
      });

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });

    it("should handle SC operation with members and nonce but no provider (fallback)", async () => {
      // #given - SC operation with members and nonce but no provider for on-chain call
      // #when - computing L2 timelock salt
      const result = await computeL2TimelockSalt({
        isSecurityCouncilOperation: true,
        securityCouncilMembers: ["0x1111111111111111111111111111111111111111"],
        securityCouncilNonce: "5",
      });

      // #then - returns HashZero as fallback
      expect(result).toBe(ethers.constants.HashZero);
    });
  });
});
