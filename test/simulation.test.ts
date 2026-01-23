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
      // #given - parameters for an arb1 retryable ticket
      const target = "0x1234567890123456789012345678901234567890";
      const calldata = "0xabcdef";
      const value = "1000000000000000000";

      // #when - preparing simulation
      const result = prepareRetryableSimulation(target, calldata, value, "arb1");

      // #then - should return correctly configured retryable simulation
      expect(result.type).toBe("retryable");
      expect(result.networkId).toBe(NETWORK_IDS.arb1);
      expect(result.l2Chain).toBe("arb1");
      expect(result.l2ChainId).toBe(42161);
      expect(result.to).toBe("0x1234567890123456789012345678901234567890");
      expect(result.input).toBe("0xabcdef");
      expect(result.value).toBe("1000000000000000000");
      const expectedFrom = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;
      expect(result.from).toBe(expectedFrom);
    });

    it("should prepare retryable simulation for nova", () => {
      // #given - parameters for a nova retryable ticket
      const target = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const calldata = "0x1234";
      const value = "0";

      // #when - preparing simulation
      const result = prepareRetryableSimulation(target, calldata, value, "nova");

      // #then - should use nova network ID and chain
      expect(result.type).toBe("retryable");
      expect(result.networkId).toBe(NETWORK_IDS.nova);
      expect(result.l2Chain).toBe("nova");
      expect(result.l2ChainId).toBe(42170);
      expect(result.value).toBe("0");
    });

    it("should default value to 0 when empty", () => {
      // #given - empty value string
      const target = "0x1234567890123456789012345678901234567890";
      const calldata = "0xabcdef";
      const value = "";

      // #when - preparing simulation
      const result = prepareRetryableSimulation(target, calldata, value, "arb1");

      // #then - should default value to "0"
      expect(result.value).toBe("0");
      expect(result.l2Value).toBe("0");
    });

    it("should handle unknown chain with ethereum network ID", () => {
      // #given - unknown chain parameter
      const target = "0x1234567890123456789012345678901234567890";
      const calldata = "0xabcdef";

      // #when - preparing simulation with unknown chain
      const result = prepareRetryableSimulation(target, calldata, "0", "unknown");

      // #then - should fallback to ethereum network ID
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
      // #given - valid scheduleBatch calldata
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

      // #when - preparing timelock simulation
      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "ethereum"
      );

      // #then - should return timelock simulation with correct fields
      expect(result).not.toBeNull();
      expect(result!.type).toBe("timelock");
      expect(result!.networkId).toBe(NETWORK_IDS.ethereum);
      expect(result!.timelockAddress).toBe(ADDRESSES.L1_TIMELOCK);
      expect(result!.originalCalldata).toBe(scheduleBatchCalldata);
      expect(
        result!.executeCalldata.toLowerCase().startsWith(TIMELOCK_SELECTORS.executeBatch)
      ).toBe(true);
      expect(result!.operationId).toBeDefined();
      expect(result!.batchParams).toBeDefined();
      expect(result!.batchParams.targets).toEqual(targets);
      expect(result!.storageOverride).toBeDefined();
    });

    it("should return null for invalid calldata", () => {
      // #given - invalid (too short) calldata
      const invalidCalldata = "0x12345678";

      // #when - attempt to prepare simulation with invalid calldata
      const result = prepareTimelockSimulation(ADDRESSES.L1_TIMELOCK, invalidCalldata, "ethereum");

      // #then - should return null instead of throwing
      expect(result).toBeNull();
    });

    it("should handle arb1 chain context", () => {
      // #given - scheduleBatch calldata for L2 timelock
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

      // #when - preparing simulation for arb1 chain
      const result = prepareTimelockSimulation(
        ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
        scheduleBatchCalldata,
        "arb1"
      );

      // #then - should use arb1 network ID
      expect(result).not.toBeNull();
      expect(result!.networkId).toBe(NETWORK_IDS.arb1);
    });

    it("should handle scheduleBatch with multiple targets", () => {
      // #given - scheduleBatch with 3 targets
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

      // #when - preparing simulation
      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "ethereum"
      );

      // #then - should preserve all targets and values
      expect(result).not.toBeNull();
      expect(result!.batchParams.targets).toHaveLength(3);
      expect(result!.batchParams.targets[0]).toBe(targets[0]);
      expect(result!.batchParams.targets[1]).toBe(targets[1]);
      expect(result!.batchParams.targets[2]).toBe(targets[2]);
      expect(result!.batchParams.values[1]).toBe("1000000000000000000");
    });

    it("should handle unknown chain with ethereum network ID", () => {
      // #given - scheduleBatch calldata with unknown chain
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

      // #when - preparing simulation with unknown chain
      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        scheduleBatchCalldata,
        "unknown"
      );

      // #then - should fallback to ethereum network ID
      expect(result).not.toBeNull();
      expect(result!.networkId).toBe(NETWORK_IDS.ethereum);
    });

    // NOTE: Lines 116-133 in simulation-data.ts (single schedule → execute conversion)
    // are dead code - unreachable because decodeScheduleBatchParams fails before
    // convertScheduleToExecute is called. The code could be removed or the
    // architecture could be modified to support single schedule calls.
  });

  describe("prepareCallSimulation", () => {
    it("should prepare call simulation for ethereum", () => {
      // #given - call parameters for ethereum
      const target = "0x1234567890123456789012345678901234567890";
      const calldata = "0xabcdef";
      const value = "1000";

      // #when - preparing call simulation
      const result = prepareCallSimulation(target, calldata, value, "ethereum");

      // #then - should return correctly configured call simulation
      expect(result.type).toBe("call");
      expect(result.networkId).toBe(NETWORK_IDS.ethereum);
      expect(result.chain).toBe("ethereum");
      expect(result.chainId).toBe(1);
      expect(result.target).toBe("0x1234567890123456789012345678901234567890");
      expect(result.calldata).toBe("0xabcdef");
      expect(result.value).toBe("1000");
      expect(result.from).toBe(ADDRESSES.L1_TIMELOCK);
    });

    it("should prepare call simulation for arb1 with aliased sender", () => {
      // #given - call parameters for arb1
      const target = "0x1234567890123456789012345678901234567890";
      const calldata = "0xabcdef";

      // #when - preparing call simulation
      const result = prepareCallSimulation(target, calldata, "0", "arb1");

      // #then - should use aliased L1 timelock as sender
      expect(result.chain).toBe("arb1");
      expect(result.chainId).toBe(42161);
      const expectedFrom = new Address(ADDRESSES.L1_TIMELOCK).applyAlias().value;
      expect(result.from).toBe(expectedFrom);
    });

    it("should use custom from address when provided", () => {
      // #given - custom from address
      const customFrom = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      const target = "0x1234567890123456789012345678901234567890";

      // #when - preparing simulation with custom from
      const result = prepareCallSimulation(target, "0xabcdef", "0", "arb1", customFrom);

      // #then - should use custom from address
      expect(result.from).toBe(customFrom);
    });

    it("should default value to 0 when empty", () => {
      // #given - empty value string
      const target = "0x1234567890123456789012345678901234567890";

      // #when - preparing simulation with empty value
      const result = prepareCallSimulation(target, "0xabcdef", "", "ethereum");

      // #then - should default to "0"
      expect(result.value).toBe("0");
    });

    it("should handle nova chain", () => {
      // #given - call parameters for nova
      const target = "0x1234567890123456789012345678901234567890";

      // #when - preparing simulation for nova
      const result = prepareCallSimulation(target, "0xabcdef", "0", "nova");

      // #then - should use nova chain config
      expect(result.chain).toBe("nova");
      expect(result.chainId).toBe(42170);
      expect(result.networkId).toBe(NETWORK_IDS.nova);
    });
  });

  describe("extractAllSimulationsFromDecoded", () => {
    it("should return empty array for simple calldata without simulations", () => {
      // #given - simple transfer calldata without nested calls
      const decoded: DecodedCalldata = {
        selector: "0x12345678",
        signature: "transfer(address,uint256)",
        parameters: [
          {
            name: "to",
            type: "address",
            displayValue: "0x123",
            rawValue: "0x123",
            isNested: false,
          },
          {
            name: "amount",
            type: "uint256",
            displayValue: "100",
            rawValue: "100",
            isNested: false,
          },
        ],
        raw: "0x12345678...",
        decodingSource: "local",
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded);

      // #then - should return empty array
      expect(result).toEqual([]);
    });

    it("should extract timelock simulation from scheduleBatch call", () => {
      // #given - a scheduleBatch decoded calldata
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
            displayValue: targets.join(","),
            rawValue: targets,
            isNested: false,
          },
        ],
        raw: rawCalldata,
        decodingSource: "local",
        decodingTarget: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");

      // #then - should include timelock simulation
      expect(result.length).toBeGreaterThanOrEqual(1);
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
      expect(timelockSim!.label).toContain("Timelock");
    });

    it("should extract retryable simulation from nested retryable ticket", () => {
      // #given - decoded calldata with nested retryable ticket
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "payloads",
            type: "bytes[]",
            displayValue: "",
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
                    displayValue: ADDRESSES.ARB1_DELAYED_INBOX,
                    rawValue: ADDRESSES.ARB1_DELAYED_INBOX,
                    isNested: false,
                  },
                  {
                    name: "l2Target",
                    type: "address",
                    displayValue: "0x1234567890123456789012345678901234567890",
                    rawValue: "0x1234567890123456789012345678901234567890",
                    isNested: false,
                  },
                  {
                    name: "l2Value",
                    type: "uint256",
                    displayValue: "0",
                    rawValue: "0",
                    isNested: false,
                  },
                  {
                    name: "l2Calldata",
                    type: "bytes",
                    displayValue: "0xabcdef",
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

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "ethereum");

      // #then - should extract retryable ticket simulation
      const retryableSim = result.find((s) => s.simulation.type === "retryable");
      expect(retryableSim).toBeDefined();
      expect(retryableSim!.label).toContain("Retryable Ticket");
      expect(retryableSim!.batchIndex).toBe(0);
    });

    it("should extract generic call simulation from nested non-retryable calls", () => {
      // #given - decoded calldata with nested non-retryable call
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "targets",
            type: "address[]",
            displayValue: "",
            rawValue: ["0x1234567890123456789012345678901234567890"],
            isNested: false,
          },
          {
            name: "payloads",
            type: "bytes[]",
            displayValue: "",
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

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");

      // #then - should extract generic call simulation
      const callSim = result.find((s) => s.simulation.type === "call");
      expect(callSim).toBeDefined();
      expect(callSim!.label).toContain("Call:");
    });

    it("should recursively extract simulations from deeply nested structures", () => {
      // #given - deeply nested decoded calldata with nova retryable
      const innerNested: DecodedCalldata = {
        selector: "",
        signature: null,
        isRetryable: true,
        targetChain: "nova",
        parameters: [
          {
            name: "inbox",
            type: "address",
            displayValue: ADDRESSES.NOVA_DELAYED_INBOX,
            rawValue: ADDRESSES.NOVA_DELAYED_INBOX,
            isNested: false,
          },
          {
            name: "l2Target",
            type: "address",
            displayValue: "0xaaaa",
            rawValue: "0xaaaa",
            isNested: false,
          },
          { name: "l2Value", type: "uint256", displayValue: "0", rawValue: "0", isNested: false },
          {
            name: "l2Calldata",
            type: "bytes",
            displayValue: "0x1234",
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
            displayValue: "",
            rawValue: [],
            isNested: true,
            nestedArray: [innerNested],
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "ethereum");

      // #then - should extract nova retryable from nested structure
      const novaSim = result.find(
        (s) => s.simulation.type === "retryable" && (s.simulation as any).l2Chain === "nova"
      );
      expect(novaSim).toBeDefined();
    });

    it("should handle nested param with single nested calldata", () => {
      // #given - sendTxToL1 with nested scheduleBatch calldata
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
            displayValue: ADDRESSES.L1_TIMELOCK,
            rawValue: ADDRESSES.L1_TIMELOCK,
            isNested: false,
          },
          {
            name: "data",
            type: "bytes",
            displayValue: "",
            rawValue: "",
            isNested: true,
            nested: innerDecoded,
          },
        ],
        raw: "0x...",
        decodingSource: "local",
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");

      // #then - should detect inner scheduleBatch as timelock simulation
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
    });
  });
});
