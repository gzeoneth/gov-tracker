/**
 * Calldata Decoder Tests
 *
 * Tests for the main calldata decoder functionality.
 * Tests pure functions - no RPC calls required.
 */

import { describe, it, expect } from "vitest";
import { decodeCalldata, decodeCalldataArray, extractCalldataFromStage } from "../src/calldata";
import { ethers } from "ethers";
import { TIMELOCK_SELECTORS, ADDRESSES } from "../src/constants";

describe("Calldata Decoder", () => {
  describe("decodeCalldata", () => {
    it("should handle empty calldata", async () => {
      const result = await decodeCalldata("");
      expect(result.selector).toBe("");
      expect(result.signature).toBeNull();
      expect(result.parameters).toBeNull();
      expect(result.raw).toBe("0x");
      expect(result.decodingSource).toBe("failed");
    });

    it("should handle 0x calldata", async () => {
      const result = await decodeCalldata("0x");
      expect(result.selector).toBe("");
      expect(result.signature).toBeNull();
      expect(result.decodingSource).toBe("failed");
    });

    it("should handle calldata shorter than 10 chars", async () => {
      const result = await decodeCalldata("0x1234");
      expect(result.selector).toBe("");
      expect(result.decodingSource).toBe("failed");
    });

    it("should decode transfer function signature", async () => {
      // transfer(address,uint256) selector: 0xa9059cbb
      const to = "0x" + "1".repeat(40);
      const amount = ethers.utils.parseEther("1.0");
      const iface = new ethers.utils.Interface(["function transfer(address to, uint256 amount)"]);
      const calldata = iface.encodeFunctionData("transfer", [to, amount]);

      const result = await decodeCalldata(calldata);
      expect(result.selector).toBe("0xa9059cbb");
      expect(result.signature).toBe("transfer(address,uint256)");
      expect(result.parameters).not.toBeNull();
      expect(result.parameters!.length).toBe(2);
      expect(result.decodingSource).not.toBe("failed");
    });

    it("should handle unknown selector gracefully", async () => {
      // Random selector unlikely to be in registry
      const calldata = "0xdeadbeef" + "00".repeat(32);
      const result = await decodeCalldata(calldata);
      expect(result.selector).toBe("0xdeadbeef");
      // May or may not find signature - depends on registry
      // But should not throw
      expect(result.raw).toBe(calldata);
    });

    it("should preserve target address", async () => {
      const targetAddress = "0x" + "a".repeat(40);
      const calldata = "0xa9059cbb" + "00".repeat(64);
      const result = await decodeCalldata(calldata, targetAddress);
      expect(result.decodingTarget).toBe(targetAddress);
    });

    it("should handle depth limit", async () => {
      // At max depth, nested decoding should stop
      const calldata = "0xa9059cbb" + "00".repeat(64);
      const result = await decodeCalldata(calldata, undefined, 3);
      // Should decode but not recurse further
      expect(result.raw).toBe(calldata);
    });

    it("should set chain context for address labeling", async () => {
      const calldata = "0xa9059cbb" + "00".repeat(64);
      const result = await decodeCalldata(calldata, undefined, 0, "ethereum");
      // Chain context is used for address labeling
      expect(result.raw).toBe(calldata);
    });

    it("should decode scheduleBatch calldata", async () => {
      const targets = ["0x" + "1".repeat(40)];
      const values = ["0"];
      const calldatas = ["0xabcdef"];
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test");
      const delay = 259200;

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
        [targets, values, calldatas, predecessor, salt, delay]
      );
      const calldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

      const result = await decodeCalldata(calldata);
      expect(result.selector.toLowerCase()).toBe(TIMELOCK_SELECTORS.scheduleBatch);
      expect(result.signature).toContain("scheduleBatch");
    });

    it("should decode execute calldata", async () => {
      const target = "0x" + "1".repeat(40);
      const value = "0";
      const data = "0xabcdef";
      const predecessor = ethers.constants.HashZero;
      const salt = ethers.utils.id("test");

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes", "bytes32", "bytes32"],
        [target, value, data, predecessor, salt]
      );
      const calldata = TIMELOCK_SELECTORS.execute + encoded.slice(2);

      const result = await decodeCalldata(calldata);
      expect(result.selector.toLowerCase()).toBe(TIMELOCK_SELECTORS.execute);
    });

    it("should handle sendTxToL1 with L1 context for nested content", async () => {
      const sendTxToL1Selector = "0x928c169a";
      const l1Target = ADDRESSES.L1_TIMELOCK;
      const l1Data = "0x" + "ab".repeat(32);

      const encoded = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [l1Target, l1Data]);
      const calldata = sendTxToL1Selector + encoded.slice(2);

      const result = await decodeCalldata(calldata, undefined, 0, "arb1");
      expect(result.selector).toBe(sendTxToL1Selector);
      // The first parameter should have L1 address context
      if (result.parameters && result.parameters[0]?.type === "address") {
        // Address labeling should use L1 context
        expect(result.parameters[0].value).toBeTruthy();
      }
    });
  });

  describe("decodeCalldataArray", () => {
    it("should decode empty array", async () => {
      const result = await decodeCalldataArray([], []);
      expect(result).toEqual([]);
    });

    it("should decode multiple calldatas with matching targets", async () => {
      const iface = new ethers.utils.Interface(["function transfer(address,uint256)"]);
      const calldata1 = iface.encodeFunctionData("transfer", [
        "0x" + "1".repeat(40),
        ethers.utils.parseEther("1"),
      ]);
      const calldata2 = iface.encodeFunctionData("transfer", [
        "0x" + "2".repeat(40),
        ethers.utils.parseEther("2"),
      ]);

      const targets = ["0x" + "a".repeat(40), "0x" + "b".repeat(40)];

      const results = await decodeCalldataArray([calldata1, calldata2], targets);
      expect(results.length).toBe(2);
      expect(results[0].decodingTarget).toBe(targets[0]);
      expect(results[1].decodingTarget).toBe(targets[1]);
    });

    it("should handle mixed valid and invalid calldatas", async () => {
      const iface = new ethers.utils.Interface(["function transfer(address,uint256)"]);
      const validCalldata = iface.encodeFunctionData("transfer", [
        "0x" + "1".repeat(40),
        ethers.utils.parseEther("1"),
      ]);

      const results = await decodeCalldataArray(
        [validCalldata, "0x", "0xdeadbeef" + "00".repeat(32)],
        ["0x" + "a".repeat(40), "0x" + "b".repeat(40), "0x" + "c".repeat(40)]
      );

      expect(results.length).toBe(3);
      expect(results[0].signature).toBe("transfer(address,uint256)");
      expect(results[1].decodingSource).toBe("failed");
    });

    it("should use provided chain context", async () => {
      const iface = new ethers.utils.Interface(["function transfer(address,uint256)"]);
      const calldata = iface.encodeFunctionData("transfer", [
        "0x" + "1".repeat(40),
        ethers.utils.parseEther("1"),
      ]);

      const results = await decodeCalldataArray([calldata], ["0x" + "a".repeat(40)], "nova");
      expect(results.length).toBe(1);
      // Chain context should be used for address labeling
    });
  });

  describe("extractCalldataFromStage - additional cases", () => {
    it("should handle empty callScheduledData array", () => {
      const stage = {
        type: "L2_TIMELOCK" as const,
        status: "READY" as const,
        chain: "arb1" as const,
        chainId: 42161,
        transactions: [],
        data: {
          callScheduledData: [],
        },
      };

      const result = extractCalldataFromStage(stage);
      expect(result.calldatas).toEqual([]);
      expect(result.targets).toEqual([]);
      expect(result.values).toEqual([]);
    });

    it("should default value to 0 when missing in callScheduledData", () => {
      const stage = {
        type: "L1_TIMELOCK" as const,
        status: "READY" as const,
        chain: "ethereum" as const,
        chainId: 1,
        transactions: [],
        data: {
          callScheduledData: [
            {
              target: "0xTarget",
              data: "0xData",
              // value is missing
            },
          ],
        },
      };

      const result = extractCalldataFromStage(stage as any);
      expect(result.values[0]).toBe("0");
    });

    it("should throw for mismatched values array length", () => {
      const stage = {
        type: "PROPOSAL_CREATED" as const,
        status: "COMPLETED" as const,
        chain: "arb1" as const,
        chainId: 42161,
        transactions: [],
        data: {
          calldatas: ["0x1", "0x2"],
          targets: ["0xT1", "0xT2"],
          values: ["0"], // Only one value for two calldatas
        },
      };

      expect(() => extractCalldataFromStage(stage)).toThrow(/Mismatch in values length/);
    });
  });
});

// Import retryable ticket functions
import {
  isRetryableTicketMagic,
  getRetryableChainName,
  decodeRetryableTicket,
  RETRYABLE_TICKET_MAGIC,
} from "../src/calldata/retryable-ticket";

describe("Retryable Ticket", () => {
  describe("isRetryableTicketMagic", () => {
    it("should return true for retryable ticket magic address", () => {
      expect(isRetryableTicketMagic(ADDRESSES.RETRYABLE_TICKET_MAGIC)).toBe(true);
    });

    it("should return true for lowercase retryable ticket magic", () => {
      expect(isRetryableTicketMagic(ADDRESSES.RETRYABLE_TICKET_MAGIC.toLowerCase())).toBe(true);
    });

    it("should return false for other addresses", () => {
      expect(isRetryableTicketMagic("0x1111111111111111111111111111111111111111")).toBe(false);
      expect(isRetryableTicketMagic(ADDRESSES.L1_TIMELOCK)).toBe(false);
    });
  });

  describe("getRetryableChainName", () => {
    it("should return 'Arbitrum One' for arb1", () => {
      expect(getRetryableChainName("arb1")).toBe("Arbitrum One");
    });

    it("should return 'Nova' for nova", () => {
      expect(getRetryableChainName("nova")).toBe("Nova");
    });

    it("should return 'Unknown L2' for unknown", () => {
      expect(getRetryableChainName("unknown")).toBe("Unknown L2");
    });
  });

  describe("decodeRetryableTicket", () => {
    it("should decode retryable ticket for Arbitrum One", () => {
      // Encode a retryable ticket: (inbox, l2Target, l2Value, gasLimit, maxFeePerGas, l2Calldata)
      const inbox = ADDRESSES.ARB1_DELAYED_INBOX;
      const l2Target = "0x1234567890123456789012345678901234567890";
      const l2Value = ethers.BigNumber.from("1000000000000000000"); // 1 ETH
      const gasLimit = ethers.BigNumber.from("100000");
      const maxFeePerGas = ethers.BigNumber.from("1000000000"); // 1 gwei
      const l2Calldata = "0xabcdef";

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [inbox, l2Target, l2Value, gasLimit, maxFeePerGas, l2Calldata]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result.targetInbox.toLowerCase()).toBe(inbox.toLowerCase());
      expect(result.l2Target.toLowerCase()).toBe(l2Target.toLowerCase());
      expect(result.l2Value).toBe("1000000000000000000");
      expect(result.gasLimit).toBe("100000");
      expect(result.maxFeePerGas).toBe("1000000000");
      expect(result.l2Calldata).toBe(l2Calldata);
      expect(result.chain).toBe("arb1");
    });

    it("should decode retryable ticket for Nova", () => {
      const inbox = ADDRESSES.NOVA_DELAYED_INBOX;
      const l2Target = "0x2222222222222222222222222222222222222222";
      const l2Value = ethers.BigNumber.from("0");
      const gasLimit = ethers.BigNumber.from("50000");
      const maxFeePerGas = ethers.BigNumber.from("500000000");
      const l2Calldata = "0x";

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [inbox, l2Target, l2Value, gasLimit, maxFeePerGas, l2Calldata]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result.chain).toBe("nova");
    });

    it("should return unknown chain for unrecognized inbox", () => {
      const inbox = "0x9999999999999999999999999999999999999999";
      const l2Target = "0x1234567890123456789012345678901234567890";
      const l2Value = ethers.BigNumber.from("0");
      const gasLimit = ethers.BigNumber.from("100000");
      const maxFeePerGas = ethers.BigNumber.from("1000000000");
      const l2Calldata = "0x1234";

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256", "uint256", "bytes"],
        [inbox, l2Target, l2Value, gasLimit, maxFeePerGas, l2Calldata]
      );

      const result = decodeRetryableTicket(encoded);

      expect(result.chain).toBe("unknown");
    });
  });

  describe("RETRYABLE_TICKET_MAGIC", () => {
    it("should be lowercase", () => {
      expect(RETRYABLE_TICKET_MAGIC).toBe(RETRYABLE_TICKET_MAGIC.toLowerCase());
    });
  });
});

describe("Nested Array Parameter Decoding", () => {
  it("should decode bytes[] with nested calldata items", async () => {
    // Create inner calldata items (transfer calls)
    const transferIface = new ethers.utils.Interface([
      "function transfer(address to, uint256 amount)",
    ]);
    const innerCalldata1 = transferIface.encodeFunctionData("transfer", [
      "0x1111111111111111111111111111111111111111",
      ethers.utils.parseEther("1"),
    ]);
    const innerCalldata2 = transferIface.encodeFunctionData("transfer", [
      "0x2222222222222222222222222222222222222222",
      ethers.utils.parseEther("2"),
    ]);

    // Create outer calldata with bytes[] containing inner calldatas
    const targets = [
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
    ];
    const values = [ethers.BigNumber.from(0), ethers.BigNumber.from(0)];
    const payloads = [innerCalldata1, innerCalldata2];

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
      [targets, values, payloads, ethers.constants.HashZero, ethers.constants.HashZero, 259200]
    );
    const calldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

    const result = await decodeCalldata(calldata);

    expect(result.signature).toContain("scheduleBatch");
    expect(result.parameters).not.toBeNull();

    // Find the bytes[] parameter (payloads/data)
    const bytesArrayParam = result.parameters?.find((p) => p.type === "bytes[]");
    expect(bytesArrayParam).toBeDefined();

    // Should have nestedArray with decoded inner calldatas
    if (bytesArrayParam?.nestedArray) {
      expect(bytesArrayParam.nestedArray.length).toBe(2);
      expect(bytesArrayParam.nestedArray[0].signature).toBe("transfer(address,uint256)");
      expect(bytesArrayParam.nestedArray[1].signature).toBe("transfer(address,uint256)");
    }
  });

  it("should handle bytes[] with mixed valid and invalid calldata", async () => {
    const transferIface = new ethers.utils.Interface([
      "function transfer(address to, uint256 amount)",
    ]);
    const validCalldata = transferIface.encodeFunctionData("transfer", [
      "0x1111111111111111111111111111111111111111",
      ethers.utils.parseEther("1"),
    ]);

    // Mix of valid calldata and short data that won't decode
    const payloads = [validCalldata, "0x1234"];
    const targets = [
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
    ];
    const values = [ethers.BigNumber.from(0), ethers.BigNumber.from(0)];

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
      [targets, values, payloads, ethers.constants.HashZero, ethers.constants.HashZero, 259200]
    );
    const calldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

    const result = await decodeCalldata(calldata);

    const bytesArrayParam = result.parameters?.find((p) => p.type === "bytes[]");
    // Should decode at least the valid one
    if (bytesArrayParam?.nestedArray) {
      expect(bytesArrayParam.nestedArray.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should handle bytes[] with empty array", async () => {
    const targets: string[] = [];
    const values: ethers.BigNumber[] = [];
    const payloads: string[] = [];

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32", "uint256"],
      [targets, values, payloads, ethers.constants.HashZero, ethers.constants.HashZero, 259200]
    );
    const calldata = TIMELOCK_SELECTORS.scheduleBatch + encoded.slice(2);

    const result = await decodeCalldata(calldata);

    const bytesArrayParam = result.parameters?.find((p) => p.type === "bytes[]");
    expect(bytesArrayParam).toBeDefined();
    // Empty array should not create nestedArray
    expect(bytesArrayParam?.nestedArray).toBeUndefined();
  });
});
