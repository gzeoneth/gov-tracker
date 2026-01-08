/**
 * Tests for Parameter Decoder
 *
 * Tests for the parameter decoding and formatting utilities.
 * Pure functions - no RPC calls required.
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  parseParamTypes,
  getAddressLabel,
  isLikelyCalldata,
  formatDecodedValue,
  decodeParameters,
} from "../src/calldata/parameter-decoder";

describe("Parameter Decoder", () => {
  describe("parseParamTypes", () => {
    it("should parse simple types", () => {
      const result = parseParamTypes("address,uint256");
      expect(result).toEqual(["address", "uint256"]);
    });

    it("should parse bytes type", () => {
      const result = parseParamTypes("address,bytes,uint256");
      expect(result).toEqual(["address", "bytes", "uint256"]);
    });

    it("should parse bytes32 type", () => {
      const result = parseParamTypes("bytes32,address");
      expect(result).toEqual(["bytes32", "address"]);
    });

    it("should parse array types", () => {
      const result = parseParamTypes("address[],uint256[],bytes[]");
      expect(result).toEqual(["address[]", "uint256[]", "bytes[]"]);
    });

    it("should parse tuple types", () => {
      const result = parseParamTypes("(address,uint256)");
      expect(result).toEqual(["(address,uint256)"]);
    });

    it("should parse complex nested tuples", () => {
      const result = parseParamTypes("address,(uint256,bytes32),bytes");
      expect(result).toEqual(["address", "(uint256,bytes32)", "bytes"]);
    });

    it("should parse tuple arrays", () => {
      const result = parseParamTypes("(address,uint256)[]");
      expect(result).toEqual(["(address,uint256)[]"]);
    });

    it("should parse empty parameters", () => {
      const result = parseParamTypes("");
      expect(result).toEqual([]);
    });

    it("should parse single parameter", () => {
      const result = parseParamTypes("address");
      expect(result).toEqual(["address"]);
    });

    it("should parse string type", () => {
      const result = parseParamTypes("address[],uint256[],bytes[],string");
      expect(result).toEqual(["address[]", "uint256[]", "bytes[]", "string"]);
    });
  });

  describe("getAddressLabel", () => {
    it("should return label for known Arb1 address", () => {
      const result = getAddressLabel("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", "arb1");
      expect(result).toBe("Core Governor");
    });

    it("should return label for known L2 Treasury Timelock", () => {
      const result = getAddressLabel("0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58", "arb1");
      expect(result).toBe("L2 Treasury Timelock");
    });

    it("should return label for known Ethereum address", () => {
      const result = getAddressLabel("0xE6841D92B0C345144506576eC13ECf5103aC7f49", "ethereum");
      expect(result).toBe("L1 Timelock");
    });

    it("should return label for known Nova address", () => {
      const result = getAddressLabel("0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482", "nova");
      expect(result).toBe("Nova UpgradeExecutor");
    });

    it("should return undefined for unknown address", () => {
      const result = getAddressLabel("0x1234567890123456789012345678901234567890", "arb1");
      expect(result).toBeUndefined();
    });

    it("should return undefined for unknown chain", () => {
      const result = getAddressLabel("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", "unknown");
      expect(result).toBeUndefined();
    });

    it("should return undefined for undefined chain", () => {
      const result = getAddressLabel("0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", undefined);
      expect(result).toBeUndefined();
    });

    it("should be case insensitive", () => {
      const lower = getAddressLabel("0xf07ded9dc292157749b6fd268e37df6ea38395b9", "arb1");
      const upper = getAddressLabel("0xF07DED9DC292157749B6FD268E37DF6EA38395B9", "arb1");
      expect(lower).toBe("Core Governor");
      expect(upper).toBe("Core Governor");
    });

    it("should find ArbSys precompile", () => {
      const result = getAddressLabel("0x0000000000000000000000000000000000000064", "arb1");
      expect(result).toBe("ArbSys");
    });

    it("should find Arb1 Outbox on Ethereum", () => {
      const result = getAddressLabel("0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840", "ethereum");
      expect(result).toBe("Arb1 Outbox");
    });
  });

  describe("isLikelyCalldata", () => {
    it("should return true for valid calldata", () => {
      const calldata = "0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890";
      expect(isLikelyCalldata(calldata)).toBe(true);
    });

    it("should return true for minimal calldata (selector only)", () => {
      const calldata = "0xa9059cbb";
      expect(isLikelyCalldata(calldata)).toBe(true);
    });

    it("should return false for too short hex", () => {
      expect(isLikelyCalldata("0x12345")).toBe(false);
    });

    it("should return false for non-hex string", () => {
      expect(isLikelyCalldata("hello world")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isLikelyCalldata("")).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isLikelyCalldata(null as unknown as string)).toBe(false);
      expect(isLikelyCalldata(undefined as unknown as string)).toBe(false);
    });

    it("should return false for non-string types", () => {
      expect(isLikelyCalldata(12345 as unknown as string)).toBe(false);
      expect(isLikelyCalldata({} as unknown as string)).toBe(false);
    });

    it("should return false for hex without 0x prefix", () => {
      expect(isLikelyCalldata("a9059cbb0000000000000000000000001234567890")).toBe(false);
    });

    it("should return false for invalid hex characters", () => {
      expect(isLikelyCalldata("0xa9059cbbXYZ")).toBe(false);
    });
  });

  describe("formatDecodedValue", () => {
    it("should format BigNumber as string", () => {
      const bn = ethers.BigNumber.from("12345");
      const result = formatDecodedValue(bn, "uint256");
      expect(result).toBe("12345");
    });

    it("should show ETH conversion for large uint256 values", () => {
      const oneEth = ethers.utils.parseEther("1.5");
      const result = formatDecodedValue(oneEth, "uint256");
      expect(result).toBe("1500000000000000000 (1.5 ETH)");
    });

    it("should not show ETH conversion for small values", () => {
      const smallWei = ethers.BigNumber.from("100"); // 100 wei, way less than 0.001 ETH
      const result = formatDecodedValue(smallWei, "uint256");
      expect(result).toBe("100");
    });

    it("should format arrays", () => {
      const arr = ["0x1111", "0x2222", "0x3333"];
      const result = formatDecodedValue(arr, "address[]");
      expect(result).toBe("[0x1111, 0x2222, 0x3333]");
    });

    it("should format nested BigNumber arrays", () => {
      const arr = [ethers.BigNumber.from("100"), ethers.BigNumber.from("200")];
      const result = formatDecodedValue(arr, "uint256[]");
      expect(result).toBe("[100, 200]");
    });

    it("should truncate very long values (> 1000 chars)", () => {
      const longBytes = "0x" + "ab".repeat(600); // 1202 chars total
      const result = formatDecodedValue(longBytes, "bytes");
      expect(result).toContain("...");
      expect(result.length).toBe(1003); // 500 + 3 + 500
    });

    it("should not truncate values under 1000 chars", () => {
      const mediumBytes = "0x" + "ab".repeat(400); // 802 chars
      const result = formatDecodedValue(mediumBytes, "bytes");
      expect(result).toBe(mediumBytes);
    });

    it("should convert other values to string", () => {
      expect(formatDecodedValue("hello", "string")).toBe("hello");
      expect(formatDecodedValue(true, "bool")).toBe("true");
      expect(formatDecodedValue(42, "uint8")).toBe("42");
    });

    it("should handle zero BigNumber", () => {
      const zero = ethers.BigNumber.from("0");
      const result = formatDecodedValue(zero, "uint256");
      expect(result).toBe("0");
    });
  });

  describe("decodeParameters", () => {
    it("should decode transfer(address,uint256)", () => {
      const iface = new ethers.utils.Interface(["function transfer(address to, uint256 amount)"]);
      const calldata = iface.encodeFunctionData("transfer", [
        "0x1234567890123456789012345678901234567890",
        ethers.utils.parseEther("1.0"),
      ]);

      const result = decodeParameters(calldata, "transfer(address,uint256)", "arb1");

      expect(result).not.toBeNull();
      expect(result!.params).toHaveLength(2);
      // Signature doesn't include names, so uses arg0, arg1
      expect(result!.params[0].name).toBe("arg0");
      expect(result!.params[0].type).toBe("address");
      expect(result!.params[1].name).toBe("arg1");
      expect(result!.params[1].type).toBe("uint256");
    });

    it("should add address label for known addresses", () => {
      const iface = new ethers.utils.Interface(["function upgrade(address target)"]);
      const calldata = iface.encodeFunctionData("upgrade", [
        "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", // Core Governor
      ]);

      const result = decodeParameters(calldata, "upgrade(address)", "arb1");

      expect(result).not.toBeNull();
      expect(result!.params[0].addressLabel).toBe("Core Governor");
    });

    it("should decode bytes parameter and detect nested calldata", () => {
      const iface = new ethers.utils.Interface(["function execute(address target, bytes data)"]);
      const nestedCalldata = "0xa9059cbb000000000000000000000000abcd";
      const calldata = iface.encodeFunctionData("execute", [
        "0x1234567890123456789012345678901234567890",
        nestedCalldata,
      ]);

      const result = decodeParameters(calldata, "execute(address,bytes)", "arb1");

      expect(result).not.toBeNull();
      expect(result!.params[1].type).toBe("bytes");
      expect(result!.params[1].isNested).toBe(true);
    });

    it("should decode bytes[] parameter", () => {
      const iface = new ethers.utils.Interface([
        "function batchExecute(address[] targets, bytes[] datas)",
      ]);
      const calldata = iface.encodeFunctionData("batchExecute", [
        [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        ["0xa9059cbb00000000", "0x095ea7b300000000"],
      ]);

      const result = decodeParameters(calldata, "batchExecute(address[],bytes[])", "arb1");

      expect(result).not.toBeNull();
      expect(result!.params[1].type).toBe("bytes[]");
      expect(result!.params[1].isNested).toBe(true);
      expect(result!.params[1]._rawBytesArray).toHaveLength(2);
    });

    it("should decode schedule function with all parameters", () => {
      const iface = new ethers.utils.Interface([
        "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
      ]);
      const calldata = iface.encodeFunctionData("schedule", [
        "0x1234567890123456789012345678901234567890",
        ethers.utils.parseEther("0.5"),
        "0xa9059cbb",
        ethers.constants.HashZero,
        ethers.constants.HashZero,
        86400,
      ]);

      const result = decodeParameters(
        calldata,
        "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
        "ethereum"
      );

      expect(result).not.toBeNull();
      expect(result!.params).toHaveLength(6);
      // Signature doesn't preserve names, uses arg0, arg1, etc.
      expect(result!.params[0].name).toBe("arg0");
      expect(result!.params[4].name).toBe("arg4");
      expect(result!.params[5].name).toBe("arg5");
      // Types are still correct
      expect(result!.params[0].type).toBe("address");
      expect(result!.params[2].type).toBe("bytes");
      expect(result!.params[5].type).toBe("uint256");
    });

    it("should use arg0, arg1 for unnamed parameters", () => {
      const iface = new ethers.utils.Interface(["function foo(address,uint256)"]);
      const calldata = iface.encodeFunctionData("foo", [
        "0x1234567890123456789012345678901234567890",
        100,
      ]);

      const result = decodeParameters(calldata, "foo(address,uint256)", "arb1");

      expect(result).not.toBeNull();
      expect(result!.params[0].name).toBe("arg0");
      expect(result!.params[1].name).toBe("arg1");
    });
  });
});
