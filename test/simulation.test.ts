/**
 * Simulation Data Tests
 *
 * Tests for simulation data preparation functions.
 * All functions are pure - no RPC calls required.
 */

import { describe, it, expect } from "vitest";
import {
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  prepareCallSimulation,
  extractAllSimulationsFromDecoded,
} from "../src/simulation";
import { ADDRESSES, NETWORK_IDS, TIMELOCK_SELECTORS } from "../src/constants";
import { Address } from "@arbitrum/sdk/dist/lib/dataEntities/address";
import { ethers } from "ethers";
import type { DecodedCalldata } from "../src/types/calldata";

describe("Simulation Data Preparation", () => {
  describe("prepareRetryableSimulation", () => {
    it("should prepare retryable simulation for arb1", () => {
      const result = prepareRetryableSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "1000000000000000000",
        "arb1"
      );

      expect(result.type).toBe("retryable");
      expect(result.networkId).toBe(NETWORK_IDS.arb1);
      expect(result.l2Chain).toBe("arb1");
      expect(result.l2ChainId).toBe(42161);
      expect(result.to).toBe("0x1234567890123456789012345678901234567890");
      expect(result.input).toBe("0xabcdef");
      expect(result.value).toBe("1000000000000000000");
      // L1 timelock address should be aliased
      const expectedFrom = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;
      expect(result.from).toBe(expectedFrom);
    });

    it("should prepare retryable simulation for nova", () => {
      const result = prepareRetryableSimulation(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0x1234",
        "0",
        "nova"
      );

      expect(result.type).toBe("retryable");
      expect(result.networkId).toBe(NETWORK_IDS.nova);
      expect(result.l2Chain).toBe("nova");
      expect(result.l2ChainId).toBe(42170);
      expect(result.value).toBe("0");
    });

    it("should default value to 0 when empty", () => {
      const result = prepareRetryableSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "",
        "arb1"
      );

      expect(result.value).toBe("0");
      expect(result.l2Value).toBe("0");
    });

    it("should handle unknown chain with ethereum network ID", () => {
      const result = prepareRetryableSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "unknown"
      );

      expect(result.networkId).toBe(NETWORK_IDS.ethereum);
    });
  });

  describe("prepareTimelockSimulation", () => {
    // Create a valid scheduleBatch calldata
    const createScheduleBatchCalldata = (
      targets: string[],
      values: string[],
      calldatas: string[],
      predecessor: string,
      salt: string,
      delay: number
    ) => {
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [targets, values, calldatas, predecessor, salt, delay]
      );
      return TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);
    };

    it("should prepare timelock simulation from scheduleBatch calldata", () => {
      const targets = ["0x1234567890123456789012345678901234567890"];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt");
      const delay = 259200;

      const scheduleBatchCalldata = createScheduleBatchCalldata(
        targets,
        values,
        calldatas,
        predecessor,
        salt,
        delay
      );

      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "ethereum"
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("timelock");
      expect(result!.networkId).toBe(NETWORK_IDS.ethereum);
      expect(result!.timelockAddress).toBe(ADDRESSES.L1_TIMELOCK);
      expect(result!.originalCalldata).toBe(scheduleBatchCalldata);
      // Execute calldata should start with executeBatch selector
      expect(
        result!.executeCalldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.executeBatch)
      ).toBe(true);
      expect(result!.operationId).toBeDefined();
      expect(result!.batchParams).toBeDefined();
      expect(result!.batchParams.targets).toEqual(targets);
      expect(result!.storageOverride).toBeDefined();
    });

    it("should throw for invalid calldata", () => {
      // Too short to be valid scheduleBatch - throws during decode
      const invalidCalldata = "0x12345678";
      expect(() =>
        prepareTimelockSimulation(ADDRESSES.L1_TIMELOCK, invalidCalldata, "ethereum")
      ).toThrow();
    });

    it("should handle arb1 chain context", () => {
      const targets = ["0x1234567890123456789012345678901234567890"];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt");
      const delay = 259200;

      const scheduleBatchCalldata = createScheduleBatchCalldata(
        targets,
        values,
        calldatas,
        predecessor,
        salt,
        delay
      );

      const result = prepareTimelockSimulation(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        scheduleBatchCalldata,
        "arb1"
      );

      expect(result).not.toBeNull();
      expect(result!.networkId).toBe(NETWORK_IDS.arb1);
    });

    it("should handle scheduleBatch with multiple targets", () => {
      const targets = [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        "0x3333333333333333333333333333333333333333",
      ];
      const values = ["0", "1000000000000000000", "0"];
      const calldatas = ["0xabcdef", "0x123456", "0x789abc"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("multi-target-salt");
      const delay = 259200;

      const scheduleBatchCalldata = createScheduleBatchCalldata(
        targets,
        values,
        calldatas,
        predecessor,
        salt,
        delay
      );

      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "ethereum"
      );

      expect(result).not.toBeNull();
      expect(result!.batchParams.targets).toHaveLength(3);
      expect(result!.batchParams.targets[0]).toBe(targets[0]);
      expect(result!.batchParams.targets[1]).toBe(targets[1]);
      expect(result!.batchParams.targets[2]).toBe(targets[2]);
      expect(result!.batchParams.values[1]).toBe("1000000000000000000");
    });

    it("should handle unknown chain with ethereum network ID", () => {
      const targets = ["0x1234567890123456789012345678901234567890"];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("unknown-chain-salt");
      const delay = 259200;

      const scheduleBatchCalldata = createScheduleBatchCalldata(
        targets,
        values,
        calldatas,
        predecessor,
        salt,
        delay
      );

      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "unknown"
      );

      expect(result).not.toBeNull();
      expect(result!.networkId).toBe(NETWORK_IDS.ethereum);
    });
  });

  describe("prepareCallSimulation", () => {
    it("should prepare call simulation for ethereum", () => {
      const result = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "1000",
        "ethereum"
      );

      expect(result.type).toBe("call");
      expect(result.networkId).toBe(NETWORK_IDS.ethereum);
      expect(result.chain).toBe("ethereum");
      expect(result.chainId).toBe(1);
      expect(result.target).toBe("0x1234567890123456789012345678901234567890");
      expect(result.calldata).toBe("0xabcdef");
      expect(result.value).toBe("1000");
      // Default from should be L1 timelock for ethereum
      expect(result.from).toBe(ADDRESSES.L1_TIMELOCK);
    });

    it("should prepare call simulation for arb1 with aliased sender", () => {
      const result = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "arb1"
      );

      expect(result.chain).toBe("arb1");
      expect(result.chainId).toBe(42161);
      // For L2, sender should be aliased L1 timelock
      const expectedFrom = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;
      expect(result.from).toBe(expectedFrom);
    });

    it("should use custom from address when provided", () => {
      const customFrom = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      const result = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "arb1",
        customFrom
      );

      expect(result.from).toBe(customFrom);
    });

    it("should default value to 0 when empty", () => {
      const result = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "",
        "ethereum"
      );

      expect(result.value).toBe("0");
    });

    it("should handle nova chain", () => {
      const result = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "nova"
      );

      expect(result.chain).toBe("nova");
      expect(result.chainId).toBe(42170);
      expect(result.networkId).toBe(NETWORK_IDS.nova);
    });
  });

  describe("extractAllSimulationsFromDecoded", () => {
    it("should return empty array for simple calldata without simulations", () => {
      const decoded: DecodedCalldata = {
        selector: "0x12345678",
        signature: "transfer(address,uint256)",
        parameters: [
          { name: "to", type: "address", value: "0x123", rawValue: "0x123", isNested: false },
          { name: "amount", type: "uint256", value: "100", rawValue: "100", isNested: false },
        ],
        raw: "0x12345678...",
        decodingSource: "local",
      };

      const result = extractAllSimulationsFromDecoded(decoded);
      expect(result).toEqual([]);
    });

    it("should extract timelock simulation from scheduleBatch call", () => {
      // Create a minimal scheduleBatch decoded calldata
      const targets = ["0x1234567890123456789012345678901234567890"];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt");
      const delay = 259200;

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [targets, values, calldatas, predecessor, salt, delay]
      );
      const rawCalldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "targets",
            type: "address[]",
            value: targets.join(","),
            rawValue: targets,
            isNested: false,
          },
        ],
        raw: rawCalldata,
        decodingSource: "local",
        decodingTarget: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
      };

      const result = extractAllSimulationsFromDecoded(decoded, "arb1");
      expect(result.length).toBeGreaterThanOrEqual(1);
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
      expect(timelockSim!.label).toContain("Timelock");
    });

    it("should extract retryable simulation from nested retryable ticket", () => {
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "payloads",
            type: "bytes[]",
            value: "",
            rawValue: [],
            isNested: true,
            nestedArray: [
              {
                selector: "",
                signature: null,
                isRetryable: true,
                targetChain: "arb1",
                parameters: [
                  {
                    name: "inbox",
                    type: "address",
                    value: ADDRESSES.ARB1_DELAYED_INBOX,
                    rawValue: ADDRESSES.ARB1_DELAYED_INBOX,
                    isNested: false,
                  },
                  {
                    name: "l2Target",
                    type: "address",
                    value: "0x1234567890123456789012345678901234567890",
                    rawValue: "0x1234567890123456789012345678901234567890",
                    isNested: false,
                  },
                  { name: "l2Value", type: "uint256", value: "0", rawValue: "0", isNested: false },
                  {
                    name: "l2Calldata",
                    type: "bytes",
                    value: "0xabcdef",
                    rawValue: "0xabcdef",
                    isNested: false,
                  },
                ],
                raw: "0x...",
                decodingSource: "local",
              },
            ],
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      const result = extractAllSimulationsFromDecoded(decoded, "ethereum");
      const retryableSim = result.find((s) => s.simulation.type === "retryable");
      expect(retryableSim).toBeDefined();
      expect(retryableSim!.label).toContain("Retryable Ticket");
      expect(retryableSim!.batchIndex).toBe(0);
    });

    it("should extract generic call simulation from nested non-retryable calls", () => {
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "targets",
            type: "address[]",
            value: "",
            rawValue: ["0x1234567890123456789012345678901234567890"],
            isNested: false,
          },
          {
            name: "payloads",
            type: "bytes[]",
            value: "",
            rawValue: [],
            isNested: true,
            nestedArray: [
              {
                selector: "0xa9059cbb",
                signature: "transfer(address,uint256)",
                isRetryable: false,
                parameters: [],
                raw: "0xa9059cbb...",
                decodingSource: "local",
              },
            ],
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      const result = extractAllSimulationsFromDecoded(decoded, "arb1");
      const callSim = result.find((s) => s.simulation.type === "call");
      expect(callSim).toBeDefined();
      expect(callSim!.label).toContain("Call:");
    });

    it("should recursively extract simulations from deeply nested structures", () => {
      const innerNested: DecodedCalldata = {
        selector: "",
        signature: null,
        isRetryable: true,
        targetChain: "nova",
        parameters: [
          {
            name: "inbox",
            type: "address",
            value: ADDRESSES.NOVA_DELAYED_INBOX,
            rawValue: ADDRESSES.NOVA_DELAYED_INBOX,
            isNested: false,
          },
          {
            name: "l2Target",
            type: "address",
            value: "0xaaaa",
            rawValue: "0xaaaa",
            isNested: false,
          },
          { name: "l2Value", type: "uint256", value: "0", rawValue: "0", isNested: false },
          {
            name: "l2Calldata",
            type: "bytes",
            value: "0x1234",
            rawValue: "0x1234",
            isNested: false,
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      const decoded: DecodedCalldata = {
        selector: "0x12345678",
        signature: "someFunction(bytes)",
        parameters: [
          {
            name: "data",
            type: "bytes[]",
            value: "",
            rawValue: [],
            isNested: true,
            nestedArray: [innerNested],
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      const result = extractAllSimulationsFromDecoded(decoded, "ethereum");
      const novaSim = result.find(
        (s) => s.simulation.type === "retryable" && (s.simulation as any).l2Chain === "nova"
      );
      expect(novaSim).toBeDefined();
    });

    it("should handle nested param with single nested calldata", () => {
      // Create valid scheduleBatch calldata for the inner call
      const targets = ["0x" + "1".repeat(40)];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt");
      const delay = 259200;

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [targets, values, calldatas, predecessor, salt, delay]
      );
      const validScheduleBatch = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

      const innerDecoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [],
        raw: validScheduleBatch,
        decodingSource: "local",
        decodingTarget: ADDRESSES.L1_TIMELOCK,
      };

      const decoded: DecodedCalldata = {
        selector: "0x928c169a",
        signature: "sendTxToL1(address,bytes)",
        parameters: [
          {
            name: "l1Target",
            type: "address",
            value: ADDRESSES.L1_TIMELOCK,
            rawValue: ADDRESSES.L1_TIMELOCK,
            isNested: false,
          },
          {
            name: "data",
            type: "bytes",
            value: "",
            rawValue: "",
            isNested: true,
            nested: innerDecoded,
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      // This should recursively process the nested calldata
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");
      // The inner scheduleBatch should be detected as a timelock simulation
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
    });
  });
});
