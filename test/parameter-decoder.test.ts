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
      // #given - a comma-separated string of basic Solidity types
      const input = "address,uint256";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - returns an array with each type as a separate element
      expect(result).toEqual(["address", "uint256"]);
    });

    it("should parse bytes type", () => {
      // #given - a parameter string containing a bytes type
      const input = "address,bytes,uint256";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - correctly identifies bytes as a distinct type
      expect(result).toEqual(["address", "bytes", "uint256"]);
    });

    it("should parse bytes32 type", () => {
      // #given - a parameter string containing bytes32 fixed-size type
      const input = "bytes32,address";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - correctly parses bytes32 without confusing it with bytes
      expect(result).toEqual(["bytes32", "address"]);
    });

    it("should parse array types", () => {
      // #given - a parameter string with multiple array types
      const input = "address[],uint256[],bytes[]";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - preserves array notation for each type
      expect(result).toEqual(["address[]", "uint256[]", "bytes[]"]);
    });

    it("should parse tuple types", () => {
      // #given - a parameter string with a tuple type
      const input = "(address,uint256)";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - keeps the tuple as a single element with parentheses
      expect(result).toEqual(["(address,uint256)"]);
    });

    it("should parse complex nested tuples", () => {
      // #given - a parameter string with a nested tuple among other types
      const input = "address,(uint256,bytes32),bytes";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - correctly separates the tuple from adjacent types
      expect(result).toEqual(["address", "(uint256,bytes32)", "bytes"]);
    });

    it("should parse tuple arrays", () => {
      // #given - a parameter string with a tuple array type
      const input = "(address,uint256)[]";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - keeps the tuple array as a single element
      expect(result).toEqual(["(address,uint256)[]"]);
    });

    it("should parse empty parameters", () => {
      // #given - an empty parameter string
      const input = "";

      // #when - parsing the empty string
      const result = parseParamTypes(input);

      // #then - returns an empty array
      expect(result).toEqual([]);
    });

    it("should parse single parameter", () => {
      // #given - a parameter string with only one type
      const input = "address";

      // #when - parsing the single parameter string
      const result = parseParamTypes(input);

      // #then - returns a single-element array
      expect(result).toEqual(["address"]);
    });

    it("should parse string type", () => {
      // #given - a parameter string containing the string type
      const input = "address[],uint256[],bytes[],string";

      // #when - parsing the parameter types string
      const result = parseParamTypes(input);

      // #then - correctly identifies string as a distinct type
      expect(result).toEqual(["address[]", "uint256[]", "bytes[]", "string"]);
    });
  });

  describe("getAddressLabel", () => {
    it("should return label for known Arb1 address", () => {
      // #given - the Core Governor address on Arbitrum One
      const address = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

      // #when - looking up the address label on arb1 chain
      const result = getAddressLabel(address, "arb1");

      // #then - returns the human-readable label
      expect(result).toBe("Core Governor");
    });

    it("should return label for known L2 Treasury Timelock", () => {
      // #given - the L2 Treasury Timelock address on Arbitrum One
      const address = "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58";

      // #when - looking up the address label on arb1 chain
      const result = getAddressLabel(address, "arb1");

      // #then - returns the Treasury Timelock label
      expect(result).toBe("L2 Treasury Timelock");
    });

    it("should return label for known Ethereum address", () => {
      // #given - the L1 Timelock address on Ethereum mainnet
      const address = "0xE6841D92B0C345144506576eC13ECf5103aC7f49";

      // #when - looking up the address label on ethereum chain
      const result = getAddressLabel(address, "ethereum");

      // #then - returns the L1 Timelock label
      expect(result).toBe("L1 Timelock");
    });

    it("should return label for known Nova address", () => {
      // #given - the Nova UpgradeExecutor address on Arbitrum Nova
      const address = "0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482";

      // #when - looking up the address label on nova chain
      const result = getAddressLabel(address, "nova");

      // #then - returns the Nova UpgradeExecutor label
      expect(result).toBe("Nova UpgradeExecutor");
    });

    it("should return undefined for unknown address", () => {
      // #given - an address not in the known address registry
      const unknownAddress = "0x1234567890123456789012345678901234567890";

      // #when - looking up the unknown address
      const result = getAddressLabel(unknownAddress, "arb1");

      // #then - returns undefined since address is not recognized
      expect(result).toBeUndefined();
    });

    it("should return undefined for unknown chain", () => {
      // #given - a known address but on an unrecognized chain
      const address = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

      // #when - looking up the address on an unknown chain
      const result = getAddressLabel(address, "unknown");

      // #then - returns undefined since chain is not in registry
      expect(result).toBeUndefined();
    });

    it("should return undefined for undefined chain", () => {
      // #given - a known address but chain is undefined
      const address = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

      // #when - looking up the address with undefined chain
      const result = getAddressLabel(address, undefined);

      // #then - returns undefined since no chain was provided
      expect(result).toBeUndefined();
    });

    it("should be case insensitive", () => {
      // #given - the same address in lowercase and uppercase
      const lowerAddress = "0xf07ded9dc292157749b6fd268e37df6ea38395b9";
      const upperAddress = "0xF07DED9DC292157749B6FD268E37DF6EA38395B9";

      // #when - looking up both case variants
      const lower = getAddressLabel(lowerAddress, "arb1");
      const upper = getAddressLabel(upperAddress, "arb1");

      // #then - both return the same label regardless of case
      expect(lower).toBe("Core Governor");
      expect(upper).toBe("Core Governor");
    });

    it("should find ArbSys precompile", () => {
      // #given - the ArbSys precompile address on Arbitrum
      const arbSysAddress = "0x0000000000000000000000000000000000000064";

      // #when - looking up the precompile address
      const result = getAddressLabel(arbSysAddress, "arb1");

      // #then - returns the ArbSys label
      expect(result).toBe("ArbSys");
    });

    it("should find Arb1 Outbox on Ethereum", () => {
      // #given - the Arb1 Outbox address on Ethereum L1
      const outboxAddress = "0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840";

      // #when - looking up the address on ethereum chain
      const result = getAddressLabel(outboxAddress, "ethereum");

      // #then - returns the Arb1 Outbox label
      expect(result).toBe("Arb1 Outbox");
    });
  });

  describe("isLikelyCalldata", () => {
    it("should return true for valid calldata", () => {
      // #given - a valid hex string with function selector and parameters
      const calldata = "0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(calldata);

      // #then - returns true for valid calldata format
      expect(result).toBe(true);
    });

    it("should return true for minimal calldata (selector only)", () => {
      // #given - a hex string with only the 4-byte function selector
      const calldata = "0xa9059cbb";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(calldata);

      // #then - returns true since selector-only is valid calldata
      expect(result).toBe(true);
    });

    it("should return false for too short hex", () => {
      // #given - a hex string shorter than the minimum selector length
      const shortHex = "0x12345";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(shortHex);

      // #then - returns false since it's too short to be a valid selector
      expect(result).toBe(false);
    });

    it("should return false for non-hex string", () => {
      // #given - a plain text string that is not hex
      const plainText = "hello world";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(plainText);

      // #then - returns false for non-hex input
      expect(result).toBe(false);
    });

    it("should return false for empty string", () => {
      // #given - an empty string
      const empty = "";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(empty);

      // #then - returns false for empty input
      expect(result).toBe(false);
    });

    it("should return false for null/undefined", () => {
      // #given - null and undefined values cast to string type
      const nullValue = null as unknown as string;
      const undefinedValue = undefined as unknown as string;

      // #when - checking if these values are likely calldata
      const nullResult = isLikelyCalldata(nullValue);
      const undefinedResult = isLikelyCalldata(undefinedValue);

      // #then - returns false for null and undefined
      expect(nullResult).toBe(false);
      expect(undefinedResult).toBe(false);
    });

    it("should return false for non-string types", () => {
      // #given - non-string values cast to string type
      const numberValue = 12345 as unknown as string;
      const objectValue = {} as unknown as string;

      // #when - checking if these values are likely calldata
      const numberResult = isLikelyCalldata(numberValue);
      const objectResult = isLikelyCalldata(objectValue);

      // #then - returns false for non-string types
      expect(numberResult).toBe(false);
      expect(objectResult).toBe(false);
    });

    it("should return false for hex without 0x prefix", () => {
      // #given - a hex string without the 0x prefix
      const hexWithoutPrefix = "a9059cbb0000000000000000000000001234567890";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(hexWithoutPrefix);

      // #then - returns false since 0x prefix is required
      expect(result).toBe(false);
    });

    it("should return false for invalid hex characters", () => {
      // #given - a hex string containing invalid characters (XYZ)
      const invalidHex = "0xa9059cbbXYZ";

      // #when - checking if the string is likely calldata
      const result = isLikelyCalldata(invalidHex);

      // #then - returns false for invalid hex characters
      expect(result).toBe(false);
    });
  });

  describe("formatDecodedValue", () => {
    it("should format BigNumber as string", () => {
      // #given - a BigNumber value
      const bn = ethers.BigNumber.from("12345");

      // #when - formatting the BigNumber as uint256
      const result = formatDecodedValue(bn, "uint256");

      // #then - returns the numeric string representation
      expect(result).toBe("12345");
    });

    it("should show ETH conversion for large uint256 values", () => {
      // #given - a BigNumber representing 1.5 ETH in wei
      const oneEth = ethers.utils.parseEther("1.5");

      // #when - formatting the large uint256 value
      const result = formatDecodedValue(oneEth, "uint256");

      // #then - shows both wei value and ETH conversion
      expect(result).toBe("1500000000000000000 (1.5 ETH)");
    });

    it("should not show ETH conversion for small values", () => {
      // #given - a very small BigNumber (100 wei, less than 0.001 ETH)
      const smallWei = ethers.BigNumber.from("100");

      // #when - formatting the small uint256 value
      const result = formatDecodedValue(smallWei, "uint256");

      // #then - shows only the wei value without ETH conversion
      expect(result).toBe("100");
    });

    it("should format arrays", () => {
      // #given - an array of address strings
      const arr = ["0x1111", "0x2222", "0x3333"];

      // #when - formatting the address array
      const result = formatDecodedValue(arr, "address[]");

      // #then - returns comma-separated values in brackets
      expect(result).toBe("[0x1111, 0x2222, 0x3333]");
    });

    it("should format nested BigNumber arrays", () => {
      // #given - an array of BigNumber values
      const arr = [ethers.BigNumber.from("100"), ethers.BigNumber.from("200")];

      // #when - formatting the uint256 array
      const result = formatDecodedValue(arr, "uint256[]");

      // #then - formats each BigNumber and joins them
      expect(result).toBe("[100, 200]");
    });

    it("should truncate very long values (> 1000 chars)", () => {
      // #given - a bytes value exceeding 1000 characters (1202 chars total)
      const longBytes = "0x" + "ab".repeat(600);

      // #when - formatting the long bytes value
      const result = formatDecodedValue(longBytes, "bytes");

      // #then - truncates with ellipsis in the middle
      expect(result).toContain("...");
      expect(result.length).toBe(1003); // 500 + 3 + 500
    });

    it("should not truncate values under 1000 chars", () => {
      // #given - a bytes value under 1000 characters (802 chars)
      const mediumBytes = "0x" + "ab".repeat(400);

      // #when - formatting the medium-length bytes value
      const result = formatDecodedValue(mediumBytes, "bytes");

      // #then - returns the full value without truncation
      expect(result).toBe(mediumBytes);
    });

    it("should convert other values to string", () => {
      // #given - various non-BigNumber, non-array values
      const stringValue = "hello";
      const boolValue = true;
      const numberValue = 42;

      // #when - formatting these values
      const stringResult = formatDecodedValue(stringValue, "string");
      const boolResult = formatDecodedValue(boolValue, "bool");
      const numberResult = formatDecodedValue(numberValue, "uint8");

      // #then - converts each to its string representation
      expect(stringResult).toBe("hello");
      expect(boolResult).toBe("true");
      expect(numberResult).toBe("42");
    });

    it("should handle zero BigNumber", () => {
      // #given - a BigNumber with value zero
      const zero = ethers.BigNumber.from("0");

      // #when - formatting the zero value
      const result = formatDecodedValue(zero, "uint256");

      // #then - returns "0" string
      expect(result).toBe("0");
    });
  });

  describe("decodeParameters", () => {
    it("should decode transfer(address,uint256)", () => {
      // #given - encoded calldata for a transfer function call
      const iface = new ethers.utils.Interface(["function transfer(address to, uint256 amount)"]);
      const calldata = iface.encodeFunctionData("transfer", [
        "0x1234567890123456789012345678901234567890",
        ethers.utils.parseEther("1.0"),
      ]);

      // #when - decoding the parameters using the function signature
      const result = decodeParameters(calldata, "transfer(address,uint256)", "arb1");

      // #then - returns decoded parameters with correct types
      expect(result).not.toBeNull();
      expect(result!.params).toHaveLength(2);
      // Signature doesn't include names, so uses arg0, arg1
      expect(result!.params[0].name).toBe("arg0");
      expect(result!.params[0].type).toBe("address");
      expect(result!.params[1].name).toBe("arg1");
      expect(result!.params[1].type).toBe("uint256");
    });

    it("should add address label for known addresses", () => {
      // #given - encoded calldata with a known governance address (Core Governor)
      const iface = new ethers.utils.Interface(["function upgrade(address target)"]);
      const calldata = iface.encodeFunctionData("upgrade", [
        "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9", // Core Governor
      ]);

      // #when - decoding the parameters on arb1 chain
      const result = decodeParameters(calldata, "upgrade(address)", "arb1");

      // #then - includes the human-readable address label
      expect(result).not.toBeNull();
      expect(result!.params[0].addressLabel).toBe("Core Governor");
    });

    it("should decode bytes parameter and detect nested calldata", () => {
      // #given - encoded calldata with a bytes parameter containing nested calldata
      const iface = new ethers.utils.Interface(["function execute(address target, bytes data)"]);
      const nestedCalldata = "0xa9059cbb000000000000000000000000abcd";
      const calldata = iface.encodeFunctionData("execute", [
        "0x1234567890123456789012345678901234567890",
        nestedCalldata,
      ]);

      // #when - decoding the parameters
      const result = decodeParameters(calldata, "execute(address,bytes)", "arb1");

      // #then - marks the bytes parameter as containing nested calldata
      expect(result).not.toBeNull();
      expect(result!.params[1].type).toBe("bytes");
      expect(result!.params[1].isNested).toBe(true);
    });

    it("should decode bytes[] parameter", () => {
      // #given - encoded calldata with an array of bytes parameters
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

      // #when - decoding the parameters
      const result = decodeParameters(calldata, "batchExecute(address[],bytes[])", "arb1");

      // #then - detects nested calldata in bytes array and provides raw bytes
      expect(result).not.toBeNull();
      expect(result!.params[1].type).toBe("bytes[]");
      expect(result!.params[1].isNested).toBe(true);
      expect(result!.params[1]._rawBytesArray).toHaveLength(2);
    });

    it("should decode schedule function with all parameters", () => {
      // #given - encoded calldata for a timelock schedule function
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

      // #when - decoding the parameters
      const result = decodeParameters(
        calldata,
        "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
        "ethereum"
      );

      // #then - returns all 6 parameters with correct types
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
      // #given - encoded calldata for a function without named parameters
      const iface = new ethers.utils.Interface(["function foo(address,uint256)"]);
      const calldata = iface.encodeFunctionData("foo", [
        "0x1234567890123456789012345678901234567890",
        100,
      ]);

      // #when - decoding the parameters
      const result = decodeParameters(calldata, "foo(address,uint256)", "arb1");

      // #then - uses positional names (arg0, arg1)
      expect(result).not.toBeNull();
      expect(result!.params[0].name).toBe("arg0");
      expect(result!.params[1].name).toBe("arg1");
    });
  });
});
