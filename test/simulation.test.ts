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
  extractSimulationsByActionIndex,
  buildTenderlySimRequest,
  buildTenderlyEncodeStatesRequest,
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

    it("should handle malformed calldata in scheduleBatch gracefully", () => {
      // #given - calldata with valid selector but corrupted data
      const corruptedCalldata = TIMELOCK_SELECTORS.scheduleBatch + "abcd".repeat(100);

      // #when - preparing simulation with corrupted calldata
      const result = prepareTimelockSimulation(
        ADDRESSES.L1_TIMELOCK,
        corruptedCalldata,
        "ethereum"
      );

      // #then - should return null instead of throwing
      expect(result).toBeNull();
    });

    it("should return null for calldata that is too short to decode", () => {
      // #given - scheduleBatch selector with insufficient data
      const shortCalldata = TIMELOCK_SELECTORS.scheduleBatch + "00".repeat(10);

      // #when - attempting to prepare simulation
      const result = prepareTimelockSimulation(ADDRESSES.L1_TIMELOCK, shortCalldata, "ethereum");

      // #then - should return null
      expect(result).toBeNull();
    });
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

    it("should skip retryable when targetChain is unknown", () => {
      // #given - decoded calldata with retryable ticket but unknown chain
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
                targetChain: "unknown", // not arb1 or nova
                parameters: [
                  {
                    name: "l2Target",
                    type: "address",
                    displayValue: "0x1234567890123456789012345678901234567890",
                    rawValue: "0x1234567890123456789012345678901234567890",
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

      // #then - should not extract retryable simulation for unknown chain
      const retryableSim = result.find((s) => s.simulation.type === "retryable");
      expect(retryableSim).toBeUndefined();
    });

    it("should skip retryable when l2Target parameter is missing", () => {
      // #given - retryable ticket missing l2Target parameter
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
                  // l2Target is missing
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

      // #then - should not extract retryable simulation when l2Target is missing
      const retryableSim = result.find((s) => s.simulation.type === "retryable");
      expect(retryableSim).toBeUndefined();
    });

    it("should skip generic call when target address is not available", () => {
      // #given - nested call without corresponding address in targets array
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "targets",
            type: "address[]",
            displayValue: "",
            rawValue: [], // empty array - no target for index 0
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

      // #then - should not extract call simulation when target is undefined
      const callSim = result.find((s) => s.simulation.type === "call");
      expect(callSim).toBeUndefined();
    });

    it("should skip generic call when raw calldata is missing", () => {
      // #given - nested call without raw calldata
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
                raw: "", // empty raw calldata
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

      // #then - should not extract call simulation when raw is empty
      const callSim = result.find((s) => s.simulation.type === "call");
      expect(callSim).toBeUndefined();
    });

    it("should skip timelock simulation when timelockAddress is not available", () => {
      // #given - schedule call without decodingTarget and without address parameter
      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [
          // No address parameter that could be used as fallback
          {
            name: "values",
            type: "uint256[]",
            displayValue: "",
            rawValue: [],
            isNested: false,
          },
        ],
        raw: "0x12345678",
        decodingSource: "local",
        // decodingTarget is undefined
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");

      // #then - should not extract timelock simulation when address unavailable
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeUndefined();
    });

    it("should use first address param as timelock for non-batch schedule call", () => {
      // #given - a schedule() (non-batch) decoded calldata without decodingTarget
      const target = "0x1234567890123456789012345678901234567890";
      const value = "0";
      const calldata = "0xabcdef";
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt");
      const delay = 259200;

      // Create a valid scheduleBatch calldata (schedule() has different encoding but
      // prepareTimelockSimulation uses decodeScheduleBatchParams which expects batch format)
      // So we still need batch-compatible raw calldata for the simulation to work
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [[target], [value], [calldata], predecessor, salt, delay]
      );
      const rawCalldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

      const decoded: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.schedule, // non-batch
        signature: "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
        parameters: [
          {
            name: "target",
            type: "address",
            displayValue: target,
            rawValue: target,
            isNested: false,
          },
        ],
        raw: rawCalldata, // using batch format for decoding
        decodingSource: "local",
        // Note: no decodingTarget set
      };

      // #when - extracting simulations
      const result = extractAllSimulationsFromDecoded(decoded, "arb1");

      // #then - should extract timelock simulation using first address param
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
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

  describe("extractSimulationsByActionIndex", () => {
    it("should track action index for each simulation", () => {
      // #given - multiple decoded actions with simulations
      const action0: DecodedCalldata = {
        selector: "0xa9059cbb",
        signature: "transfer(address,uint256)",
        parameters: [],
        raw: "0xa9059cbb...",
        decodingSource: "local",
      };

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

      const action1: DecodedCalldata = {
        selector: TIMELOCK_SELECTORS.scheduleBatch,
        signature: "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        parameters: [],
        raw: rawCalldata,
        decodingSource: "local",
        decodingTarget: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
      };

      // #when - extracting with action index
      const result = extractSimulationsByActionIndex([action0, action1], "arb1");

      // #then - simulations should have correct action index
      expect(result.length).toBeGreaterThanOrEqual(1);
      const timelockSim = result.find((s) => s.simulation.type === "timelock");
      expect(timelockSim).toBeDefined();
      expect(timelockSim!.actionIndex).toBe(1);
    });

    it("should handle empty action array", () => {
      // #given - empty decoded actions array

      // #when - extracting simulations
      const result = extractSimulationsByActionIndex([], "arb1");

      // #then - should return empty array
      expect(result).toEqual([]);
    });

    it("should preserve all simulation properties plus action index", () => {
      // #given - action with retryable ticket
      const action: DecodedCalldata = {
        selector: "0x12345678",
        signature: "someFunction(bytes[])",
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
                    name: "l2Target",
                    type: "address",
                    displayValue: "0x1234567890123456789012345678901234567890",
                    rawValue: "0x1234567890123456789012345678901234567890",
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

      // #when - extracting with action index
      const result = extractSimulationsByActionIndex([action], "ethereum");

      // #then - should have label, simulation, batchIndex, and actionIndex
      expect(result.length).toBeGreaterThanOrEqual(1);
      const retryableSim = result.find((s) => s.simulation.type === "retryable");
      expect(retryableSim).toBeDefined();
      expect(retryableSim!.actionIndex).toBe(0);
      expect(retryableSim!.label).toContain("Retryable");
      expect(retryableSim!.batchIndex).toBe(0);
    });
  });

  describe("buildTenderlySimRequest", () => {
    it("should build basic simulation request from retryable data", () => {
      // #given - retryable simulation data
      const sim = prepareRetryableSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "1000",
        "arb1"
      );

      // #when - building Tenderly request
      const request = buildTenderlySimRequest(sim);

      // #then - should have correct Tenderly API fields
      expect(request.network_id).toBe(NETWORK_IDS.arb1);
      expect(request.from).toBe(sim.from);
      expect(request.to).toBe(sim.to);
      expect(request.input).toBe(sim.input);
      expect(request.value).toBe("1000");
      expect(request.save).toBe(true);
      expect(request.save_if_fails).toBe(true);
      expect(request.simulation_type).toBe("quick");
    });

    it("should allow overrides to be merged", () => {
      // #given - call simulation data
      const sim = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "ethereum"
      );

      // #when - building with overrides
      const request = buildTenderlySimRequest(sim, {
        simulation_type: "full",
        save: false,
      });

      // #then - overrides should take precedence
      expect(request.simulation_type).toBe("full");
      expect(request.save).toBe(false);
      expect(request.save_if_fails).toBe(true); // default preserved
    });

    it("should handle state_objects override for timelock simulations", () => {
      // #given - timelock simulation data
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

      const sim = prepareTimelockSimulation(ADDRESSES.L1_TIMELOCK, rawCalldata, "ethereum");

      // #when - building with state_objects override
      const request = buildTenderlySimRequest(sim!, {
        state_objects: {
          [ADDRESSES.L1_TIMELOCK]: {
            storage: { "0x1234": "0x1" },
          },
        },
      });

      // #then - should include state_objects
      expect(request.state_objects).toBeDefined();
      expect(request.state_objects![ADDRESSES.L1_TIMELOCK]).toBeDefined();
    });
  });

  describe("buildTenderlyEncodeStatesRequest", () => {
    // Helper to create valid timelock simulation with unique salt
    let simCounter = 0;
    const createTimelockSim = (timelockAddress: string, networkId: string) => {
      const targets = ["0x1234567890123456789012345678901234567890"];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test-salt-" + timelockAddress + "-" + simCounter++);
      const delay = 259200;

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [targets, values, calldatas, predecessor, salt, delay]
      );
      const rawCalldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

      const chain = networkId === "1" ? "ethereum" : "arb1";
      return prepareTimelockSimulation(timelockAddress, rawCalldata, chain);
    };

    it("should build encode-states request from timelock simulations", () => {
      // #given - timelock simulation
      const sim = createTimelockSim(ADDRESSES.L1_TIMELOCK, "1");

      // #when - building encode-states request
      const request = buildTenderlyEncodeStatesRequest([sim!]);

      // #then - should have correct structure
      expect(request).not.toBeNull();
      expect(request!.networkID).toBe("1");
      expect(request!.stateOverrides).toBeDefined();
      expect(request!.stateOverrides[ADDRESSES.L1_TIMELOCK]).toBeDefined();
      expect(request!.stateOverrides[ADDRESSES.L1_TIMELOCK].value).toBeDefined();
    });

    it("should return null when no timelock simulations provided", () => {
      // #given - non-timelock simulations only
      const retryableSim = prepareRetryableSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "arb1"
      );
      const callSim = prepareCallSimulation(
        "0x1234567890123456789012345678901234567890",
        "0xabcdef",
        "0",
        "ethereum"
      );

      // #when - building encode-states request
      const request = buildTenderlyEncodeStatesRequest([retryableSim, callSim]);

      // #then - should return null
      expect(request).toBeNull();
    });

    it("should merge storage overrides for same timelock address", () => {
      // #given - two timelock simulations for same address
      const sim1 = createTimelockSim(ADDRESSES.L1_TIMELOCK, "1");
      const sim2 = createTimelockSim(ADDRESSES.L1_TIMELOCK, "1");

      // #when - building encode-states request
      const request = buildTenderlyEncodeStatesRequest([sim1!, sim2!]);

      // #then - should have merged overrides
      expect(request).not.toBeNull();
      const overrides = request!.stateOverrides[ADDRESSES.L1_TIMELOCK].value;
      expect(Object.keys(overrides).length).toBe(2);
    });

    it("should handle empty array", () => {
      // #given - empty simulations array

      // #when - building encode-states request
      const request = buildTenderlyEncodeStatesRequest([]);

      // #then - should return null
      expect(request).toBeNull();
    });
  });
});
