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
} from "../src/utils/salt-computation";
import { timelockInterface } from "../src/abis";
import type { TrackedStage } from "../src/types";

describe("Salt Computation", () => {
  describe("saltFromDescription", () => {
    it("should return keccak256 hash of description", () => {
      const description = "AIP-1: Some proposal";
      const expected = ethers.utils.id(description);

      const salt = saltFromDescription(description);

      expect(salt).toBe(expected);
      expect(salt).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("should return different hashes for different descriptions", () => {
      const salt1 = saltFromDescription("Proposal A");
      const salt2 = saltFromDescription("Proposal B");

      expect(salt1).not.toBe(salt2);
    });

    it("should handle empty string", () => {
      const salt = saltFromDescription("");
      expect(salt).toBe(ethers.utils.id(""));
    });

    it("should handle special characters", () => {
      const description = "AIP-1: Test proposal with emoji 🚀 and unicode 中文";
      const salt = saltFromDescription(description);

      expect(salt).toBe(ethers.utils.id(description));
    });
  });

  describe("decodeL1TimelockSchedule", () => {
    it("should decode scheduleBatch call", () => {
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

      const decoded = decodeL1TimelockSchedule(encoded);

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

      const decoded = decodeL1TimelockSchedule(encoded);

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
      const encoded = timelockInterface.encodeFunctionData("scheduleBatch", [
        [],
        [],
        [],
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        BigNumber.from(0),
      ]);

      const decoded = decodeL1TimelockSchedule(encoded);

      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "batch") {
        expect(decoded.targets).toEqual([]);
        expect(decoded.values).toEqual([]);
        expect(decoded.payloads).toEqual([]);
      }
    });

    it("should decode schedule with zero value and empty data", () => {
      const encoded = timelockInterface.encodeFunctionData("schedule", [
        "0x1111111111111111111111111111111111111111",
        BigNumber.from(0),
        "0x",
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        BigNumber.from(0),
      ]);

      const decoded = decodeL1TimelockSchedule(encoded);

      expect(decoded).not.toBeNull();
      if (decoded && decoded.type === "single") {
        expect(decoded.data).toBe("0x");
      }
    });
  });

  describe("computeL1TimelockSalt", () => {
    it("should return HashZero when no stages provided", () => {
      const result = computeL1TimelockSalt();

      expect(result.salt).toBe(ethers.constants.HashZero);
      expect(result.predecessor).toBeUndefined();
    });

    it("should return HashZero when no L2_TO_L1_MESSAGE stage", () => {
      const stages: TrackedStage[] = [
        {
          type: "PROPOSAL_CREATED",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ];

      const result = computeL1TimelockSalt(stages);

      expect(result.salt).toBe(ethers.constants.HashZero);
    });

    it("should return HashZero when L2_TO_L1_MESSAGE has no l2ToL1TxEvent", () => {
      const stages: TrackedStage[] = [
        {
          type: "L2_TO_L1_MESSAGE",
          status: "COMPLETED",
          chain: "arb1",
          chainId: 42161,
          transactions: [],
          data: {},
        },
      ];

      const result = computeL1TimelockSalt(stages);

      expect(result.salt).toBe(ethers.constants.HashZero);
    });

    it("should decode salt and predecessor from l2ToL1TxEvent data", () => {
      const expectedSalt = ethers.utils.id("test-salt");
      const expectedPredecessor = "0x" + "ab".repeat(32);

      // Create a scheduleBatch encoded call with known salt and predecessor
      const encoded = timelockInterface.encodeFunctionData("scheduleBatch", [
        ["0x1111111111111111111111111111111111111111"],
        [BigNumber.from(0)],
        ["0x1234"],
        expectedPredecessor,
        expectedSalt,
        BigNumber.from(259200),
      ]);

      const stages: TrackedStage[] = [
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
      ];

      const result = computeL1TimelockSalt(stages);

      expect(result.salt).toBe(expectedSalt);
      expect(result.predecessor).toBe(expectedPredecessor);
    });

    it("should decode single schedule call salt", () => {
      const expectedSalt = ethers.utils.id("single-schedule-salt");

      const encoded = timelockInterface.encodeFunctionData("schedule", [
        "0x1111111111111111111111111111111111111111",
        BigNumber.from(0),
        "0x1234",
        ethers.constants.HashZero,
        expectedSalt,
        BigNumber.from(259200),
      ]);

      const stages: TrackedStage[] = [
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
      ];

      const result = computeL1TimelockSalt(stages);

      expect(result.salt).toBe(expectedSalt);
      expect(result.predecessor).toBe(ethers.constants.HashZero);
    });
  });
});
