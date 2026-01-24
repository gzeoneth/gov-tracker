/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for utility functions
 *
 * Tests for:
 * - Operation ID computation (hashOperation, hashOperationBatch)
 * - Salt derivation (saltFromDescription, saltForSecurityCouncil)
 * - Timing utilities (calculateEta, etc)
 * - RPC utilities (queryWithRetry)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Public API imports (testing exports work correctly)
import {
  // Salt utilities
  saltFromDescription,

  // Operation ID utilities
  validateSalt,

  // Timing utilities
  calculateRemainingSeconds,
} from "../src";

// Internal imports (for testing internal functions)
import {
  hashOperation,
  hashOperationBatch,
  tryFindSalt,
  computeAndValidateOperationHash,
  validateSaltBatch,
} from "../src/utils/operation-id";
import { isValidOperationId } from "./helpers/discovery-helpers";
import {
  queryWithRetry,
  delay,
  isRetryableError,
  isPermanentError,
  isGasEstimationError,
  getErrorMessage,
  getReceiptOrNull,
} from "../src/utils/rpc-utils";

describe("Operation ID Utilities", () => {
  beforeEach(() => {
    // No-op
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("hashOperation", () => {
    it("should compute deterministic operation ID", async () => {
      // #given - operation parameters with target, value, data, predecessor, and salt
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("1000000000000000000"),
        data: "0xabcdef00",
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("test proposal description"),
      };

      // #when - computing the operation ID twice with same params
      const id1 = hashOperation(params);
      const id2 = hashOperation(params);

      // #then - both IDs should be identical and match bytes32 format
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should produce different IDs for different salts", async () => {
      // #given - base operation parameters without salt
      const baseParams = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
      };

      // #when - computing IDs with different salts
      const id1 = hashOperation({ ...baseParams, salt: ethers.constants.HashZero });
      const id2 = hashOperation({ ...baseParams, salt: ethers.utils.id("description") });

      // #then - operation IDs should be different
      expect(id1).not.toBe(id2);
    });

    it("should produce different IDs for different targets", async () => {
      // #given - base operation parameters without target
      const baseParams = {
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      // #when - computing IDs with different target addresses
      const id1 = hashOperation({
        ...baseParams,
        target: "0x1234567890123456789012345678901234567890",
      });
      const id2 = hashOperation({
        ...baseParams,
        target: "0x0987654321098765432109876543210987654321",
      });

      // #then - operation IDs should be different
      expect(id1).not.toBe(id2);
    });
  });

  describe("hashOperationBatch", () => {
    it("should compute deterministic batch operation ID", async () => {
      // #given - batch operation parameters with multiple targets
      const params = {
        targets: [
          "0x1234567890123456789012345678901234567890",
          "0x0987654321098765432109876543210987654321",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0xabcd", "0xef01"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      // #when - computing the batch operation ID twice with same params
      const id1 = hashOperationBatch(params);
      const id2 = hashOperationBatch(params);

      // #then - both IDs should be identical and match bytes32 format
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should produce different IDs for different target order", async () => {
      // #given - two batch operations with same targets in different order
      const params1 = {
        targets: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0x", "0x"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };
      const params2 = {
        targets: [
          "0x2222222222222222222222222222222222222222",
          "0x1111111111111111111111111111111111111111",
        ],
        values: [BigNumber.from(0), BigNumber.from(0)],
        payloads: ["0x", "0x"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      // #when - computing IDs for both orderings
      const id1 = hashOperationBatch(params1);
      const id2 = hashOperationBatch(params2);

      // #then - operation IDs should be different due to order sensitivity
      expect(id1).not.toBe(id2);
    });
  });

  describe("saltFromDescription", () => {
    it("should compute salt from description", () => {
      // #given - a proposal description string
      const description = "AIP-1: A test proposal";

      // #when - computing the salt from description
      const salt = saltFromDescription(description);

      // #then - salt should be keccak256 hash of description in bytes32 format
      expect(salt).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(salt).toBe(ethers.utils.id(description));
    });

    it("should be deterministic", () => {
      // #given - a description string
      const description = "Another test";

      // #when - computing salt twice from same description
      // #then - both salts should be identical
      expect(saltFromDescription(description)).toBe(saltFromDescription(description));
    });
  });

  describe("validateSalt", () => {
    it("should return true for matching salt", async () => {
      // #given - operation parameters and the computed operation ID from those params
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const operationId = hashOperation(params);

      // #when - validating the salt against the operation ID
      // #then - validation should return true
      expect(validateSalt(operationId, params)).toBe(true);
    });

    it("should return false for non-matching salt", async () => {
      // #given - operation parameters and an unrelated operation ID
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from(0),
        data: "0x",
        predecessor: ethers.constants.HashZero,
        salt: ethers.constants.HashZero,
      };

      const wrongOperationId = "0x0000000000000000000000000000000000000000000000000000000000000001";

      // #when - validating params against wrong operation ID
      // #then - validation should return false
      expect(validateSalt(wrongOperationId, params)).toBe(false);
    });
  });

  describe("validateSaltBatch", () => {
    it("should validate correct salt for batch operation", () => {
      // #given - batch operation parameters and the computed operation ID
      const params = {
        targets: [
          "0x1234567890123456789012345678901234567890",
          "0x2222222222222222222222222222222222222222",
        ],
        values: [BigNumber.from("0"), BigNumber.from("1000")],
        payloads: ["0xabcd", "0xef01"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("batch proposal"),
      };

      const operationId = hashOperationBatch(params);

      // #when - validating the batch salt against the operation ID
      // #then - validation should return true
      expect(validateSaltBatch(operationId, params)).toBe(true);
    });

    it("should reject incorrect salt for batch operation", () => {
      // #given - batch operation parameters and an unrelated operation ID
      const params = {
        targets: ["0x1234567890123456789012345678901234567890"],
        values: [BigNumber.from("0")],
        payloads: ["0xabcd"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("batch proposal"),
      };

      const wrongOperationId = "0x0000000000000000000000000000000000000000000000000000000000000001";

      // #when - validating params against wrong operation ID
      // #then - validation should return false
      expect(validateSaltBatch(wrongOperationId, params)).toBe(false);
    });
  });

  describe("tryFindSalt", () => {
    it("should find matching salt from candidates for single operation", () => {
      // #given - a correct salt, base params, and a list of candidate salts
      const correctSalt = ethers.utils.id("correct description");
      const baseParams = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("0"),
        data: "0xabcdef",
        predecessor: ethers.constants.HashZero,
      };

      const expectedOperationId = hashOperation({ ...baseParams, salt: correctSalt });

      const candidates = [
        ethers.constants.HashZero,
        ethers.utils.id("wrong description"),
        correctSalt,
        ethers.utils.id("another wrong"),
      ];

      // #when - searching for matching salt in candidates
      const foundSalt = tryFindSalt(expectedOperationId, baseParams, candidates);

      // #then - should find the correct salt
      expect(foundSalt).toBe(correctSalt);
    });

    it("should find matching salt from candidates for batch operation", () => {
      // #given - a correct salt, batch params, and candidate salts
      const correctSalt = ethers.utils.id("correct batch description");
      const baseParams = {
        targets: ["0x1234567890123456789012345678901234567890"],
        values: [BigNumber.from("0")],
        payloads: ["0xabcdef"],
        predecessor: ethers.constants.HashZero,
      };

      const expectedOperationId = hashOperationBatch({ ...baseParams, salt: correctSalt });

      const candidates = [ethers.constants.HashZero, correctSalt];

      // #when - searching for matching salt in candidates
      const foundSalt = tryFindSalt(expectedOperationId, baseParams, candidates);

      // #then - should find the correct salt
      expect(foundSalt).toBe(correctSalt);
    });

    it("should return null if no matching salt found", () => {
      // #given - base params and an operation ID that doesn't match any candidate
      const baseParams = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("0"),
        data: "0xabcdef",
        predecessor: ethers.constants.HashZero,
      };

      const wrongOperationId = "0x0000000000000000000000000000000000000000000000000000000000000001";

      const candidates = [
        ethers.constants.HashZero,
        ethers.utils.id("description1"),
        ethers.utils.id("description2"),
      ];

      // #when - searching for matching salt
      const foundSalt = tryFindSalt(wrongOperationId, baseParams, candidates);

      // #then - should return null
      expect(foundSalt).toBeNull();
    });

    it("should return null for empty candidates", () => {
      // #given - base params with an empty candidate list
      const baseParams = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("0"),
        data: "0xabcdef",
        predecessor: ethers.constants.HashZero,
      };

      // #when - searching with empty candidates
      const foundSalt = tryFindSalt("0x" + "a".repeat(64), baseParams, []);

      // #then - should return null
      expect(foundSalt).toBeNull();
    });
  });

  describe("computeAndValidateOperationHash", () => {
    it("should return valid for correct single operation params", () => {
      // #given - single operation params and their correct operation ID
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("1000"),
        data: "0xabcdef",
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("test"),
      };

      const expectedOperationId = hashOperation(params);

      // #when - computing and validating the hash
      const result = computeAndValidateOperationHash(expectedOperationId, params);

      // #then - result should be valid with matching hash and no error
      expect(result.isValid).toBe(true);
      expect(result.computedHash).toBe(expectedOperationId);
      expect(result.error).toBeUndefined();
    });

    it("should return valid for correct batch operation params", () => {
      // #given - batch operation params and their correct operation ID
      const params = {
        targets: ["0x1234567890123456789012345678901234567890"],
        values: [BigNumber.from("0")],
        payloads: ["0xabcd"],
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("batch test"),
      };

      const expectedOperationId = hashOperationBatch(params);

      // #when - computing and validating the batch hash
      const result = computeAndValidateOperationHash(expectedOperationId, params);

      // #then - result should be valid with matching hash and no error
      expect(result.isValid).toBe(true);
      expect(result.computedHash).toBe(expectedOperationId);
      expect(result.error).toBeUndefined();
    });

    it("should return invalid with error for mismatched operation ID", () => {
      // #given - operation params and a wrong expected operation ID
      const params = {
        target: "0x1234567890123456789012345678901234567890",
        value: BigNumber.from("0"),
        data: "0xabcdef",
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.id("test"),
      };

      const wrongOperationId = "0x0000000000000000000000000000000000000000000000000000000000000001";

      // #when - computing and validating against wrong ID
      const result = computeAndValidateOperationHash(wrongOperationId, params);

      // #then - result should be invalid with mismatch error
      expect(result.isValid).toBe(false);
      expect(result.computedHash).not.toBe(wrongOperationId);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("mismatch");
    });
  });

  describe("isValidOperationId", () => {
    it("should validate correct operation ID format", () => {
      // #given - HashZero and a valid non-zero operation ID
      // #when - validating both
      // #then - HashZero should be invalid (indicates no operation), non-zero should be valid
      expect(isValidOperationId(ethers.constants.HashZero)).toBe(false);
      expect(
        isValidOperationId("0xaf607f045944b4a9caf0b7e13f0fca93facbf22e389b23ea6cfee07afe452016")
      ).toBe(true);
    });

    it("should reject invalid formats", () => {
      // #given - various invalid format strings
      // #when - validating each
      // #then - all should be rejected as invalid
      expect(isValidOperationId("")).toBe(false);
      expect(isValidOperationId("0x")).toBe(false);
      expect(isValidOperationId("not-hex")).toBe(false);
      expect(isValidOperationId("0x123")).toBe(false); // Too short
    });
  });
});

describe("Timing Utilities", () => {
  describe("calculateRemainingSeconds", () => {
    it("should calculate positive remaining time", () => {
      // #given - target block ahead of current block with known block time
      const targetBlock = 1000;
      const currentBlock = 500;
      const blockTime = 12;

      // #when - calculating remaining seconds
      const remaining = calculateRemainingSeconds(targetBlock, currentBlock, blockTime);

      // #then - should return correct remaining time in seconds
      expect(remaining).toBe((1000 - 500) * 12);
    });

    it("should return 0 for past deadlines", () => {
      // #given - target block already passed
      const targetBlock = 500;
      const currentBlock = 1000;
      const blockTime = 12;

      // #when - calculating remaining seconds
      const remaining = calculateRemainingSeconds(targetBlock, currentBlock, blockTime);

      // #then - should return 0 since deadline passed
      expect(remaining).toBe(0);
    });
  });
});

describe("RPC Utilities", () => {
  describe("delay", () => {
    it("should delay for specified time", async () => {
      // #given - a target delay of 50ms
      const start = Date.now();

      // #when - awaiting the delay
      await delay(50);
      const elapsed = Date.now() - start;

      // #then - elapsed time should be approximately 50ms
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("queryWithRetry", () => {
    it("should return result on first try success", async () => {
      // #given - a function that succeeds on first call
      const fn = vi.fn().mockResolvedValue("success");

      // #when - executing with retry wrapper
      const result = await queryWithRetry(fn, {
        maxRetries: 3,
        initialDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
      });

      // #then - should return success and call function only once
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      // #given - a function that fails once then succeeds
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockResolvedValue("success");

      // #when - executing with retry wrapper
      const result = await queryWithRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2,
      });

      // #then - should return success after retry
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries for retryable errors", async () => {
      // #given - a function that always fails with retryable error
      const fn = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));

      // #when - executing with limited retries
      // #then - should throw after exhausting retries
      await expect(
        queryWithRetry(fn, { maxRetries: 2, initialDelay: 10, backoffMultiplier: 1, maxDelay: 10 })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should not retry non-retryable errors", async () => {
      // #given - a function that fails with non-retryable error
      const fn = vi.fn().mockRejectedValue(new Error("invalid address"));

      // #when - executing with retry wrapper
      // #then - should throw immediately without retrying
      await expect(
        queryWithRetry(fn, { maxRetries: 3, initialDelay: 10, backoffMultiplier: 1, maxDelay: 10 })
      ).rejects.toThrow("RPC query failed");

      expect(fn).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
    });
  });

  describe("isPermanentError", () => {
    it("should identify contract execution failures", () => {
      // #given - contract execution failure messages
      // #when - checking if permanent error
      // #then - all should be identified as permanent
      expect(isPermanentError(new Error("execution reverted"))).toBe(true);
      expect(isPermanentError(new Error("call revert exception"))).toBe(true);
      expect(isPermanentError(new Error("transaction reverted"))).toBe(true);
    });

    it("should identify invalid request parameters", () => {
      // #given - invalid parameter error messages
      // #when - checking if permanent error
      // #then - all should be identified as permanent
      expect(isPermanentError(new Error("invalid argument"))).toBe(true);
      expect(isPermanentError(new Error("invalid params"))).toBe(true);
      expect(isPermanentError(new Error("method not found"))).toBe(true);
      expect(isPermanentError(new Error("invalid address"))).toBe(true);
      expect(isPermanentError(new Error("ENS name not configured"))).toBe(true);
    });

    it("should identify data decoding errors", () => {
      // #given - data decoding error messages
      // #when - checking if permanent error
      // #then - all should be identified as permanent
      expect(isPermanentError(new Error("could not decode result"))).toBe(true);
      expect(isPermanentError(new Error("data out-of-bounds"))).toBe(true);
      expect(isPermanentError(new Error("invalid data for function"))).toBe(true);
    });

    it("should identify missing resource errors", () => {
      // #given - missing resource error messages
      // #when - checking if permanent error
      // #then - all should be identified as permanent
      expect(isPermanentError(new Error("no contract code at address"))).toBe(true);
      expect(isPermanentError(new Error("contract not deployed"))).toBe(true);
      expect(isPermanentError(new Error("function selector was not recognized"))).toBe(true);
    });

    it("should not identify transient errors as permanent", () => {
      // #given - transient error messages
      // #when - checking if permanent error
      // #then - all should NOT be identified as permanent
      expect(isPermanentError(new Error("rate limit exceeded"))).toBe(false);
      expect(isPermanentError(new Error("timeout"))).toBe(false);
      expect(isPermanentError(new Error("server error"))).toBe(false);
      expect(isPermanentError(new Error("500 internal server error"))).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      // #given - various non-Error objects
      // #when - checking if permanent error
      // #then - all should return false (not identifiable as permanent)
      expect(isPermanentError("string error")).toBe(false);
      expect(isPermanentError(null)).toBe(false);
      expect(isPermanentError(undefined)).toBe(false);
      expect(isPermanentError({ message: "execution reverted" })).toBe(false);
    });
  });

  describe("isRetryableError", () => {
    it("should retry transient network errors", () => {
      // #given - various transient error messages
      // #when - checking if retryable
      // #then - all should be identified as retryable
      expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
      expect(isRetryableError(new Error("timeout"))).toBe(true);
      expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
      expect(isRetryableError(new Error("network error"))).toBe(true);
    });

    it("should retry server errors including 500", () => {
      // #given - various server error messages including 500
      // #when - checking if retryable
      // #then - all should be identified as retryable
      expect(isRetryableError(new Error("server error"))).toBe(true);
      expect(isRetryableError(new Error("500 internal server error"))).toBe(true);
      expect(isRetryableError(new Error("502 bad gateway"))).toBe(true);
      expect(isRetryableError(new Error("503 service unavailable"))).toBe(true);
      expect(isRetryableError(new Error("504 gateway timeout"))).toBe(true);
      // The exact error format from the user's report
      expect(
        isRetryableError(
          new Error(
            'bad response (status=500, headers={"content-type":"application/json"}, body="{"error":{"message":"Temporary internal error"}}")'
          )
        )
      ).toBe(true);
    });

    it("should not retry permanent errors", () => {
      // #given - permanent error messages
      // #when - checking if retryable
      // #then - all should be identified as non-retryable
      expect(isRetryableError(new Error("execution reverted"))).toBe(false);
      expect(isRetryableError(new Error("invalid address"))).toBe(false);
      expect(isRetryableError(new Error("call revert exception"))).toBe(false);
      expect(isRetryableError(new Error("no contract code at address"))).toBe(false);
    });

    it("should retry non-Error objects (unknown errors)", () => {
      // #given - various non-Error objects
      // #when - checking if retryable
      // #then - all should be retryable (unknown errors default to retry)
      expect(isRetryableError("string error")).toBe(true);
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
      expect(isRetryableError({ message: "execution reverted" })).toBe(true);
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error object", () => {
      // #given - an Error with a message
      const error = new Error("test error message");

      // #when - getting error message
      const result = getErrorMessage(error);

      // #then - should return the message
      expect(result).toBe("test error message");
    });

    it("should convert string to string", () => {
      // #given - a plain string
      // #when - getting error message
      // #then - should return the string as-is
      expect(getErrorMessage("plain string")).toBe("plain string");
    });

    it("should convert number to string", () => {
      // #given - a number
      // #when - getting error message
      // #then - should convert to string representation
      expect(getErrorMessage(42)).toBe("42");
    });

    it("should convert null to string", () => {
      // #given - null value
      // #when - getting error message
      // #then - should convert to "null" string
      expect(getErrorMessage(null)).toBe("null");
    });

    it("should convert undefined to string", () => {
      // #given - undefined value
      // #when - getting error message
      // #then - should convert to "undefined" string
      expect(getErrorMessage(undefined)).toBe("undefined");
    });

    it("should handle object by converting to string", () => {
      // #given - a plain object
      // #when - getting error message
      // #then - should convert via String() to "[object Object]"
      expect(getErrorMessage({ foo: "bar" })).toBe("[object Object]");
    });
  });

  describe("isGasEstimationError", () => {
    it("should identify gas required exceeds errors", () => {
      // #given - gas required exceeds error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("gas required exceeds allowance"))).toBe(true);
    });

    it("should identify execution reverted errors", () => {
      // #given - execution reverted error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("execution reverted"))).toBe(true);
    });

    it("should identify out of gas errors", () => {
      // #given - out of gas error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("out of gas"))).toBe(true);
    });

    it("should identify intrinsic gas too low errors", () => {
      // #given - intrinsic gas too low error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("intrinsic gas too low"))).toBe(true);
    });

    it("should identify insufficient funds for gas errors", () => {
      // #given - insufficient funds error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("insufficient funds for gas"))).toBe(true);
    });

    it("should identify cannot estimate gas errors", () => {
      // #given - cannot estimate gas error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("cannot estimate gas; transaction may fail"))).toBe(
        true
      );
    });

    it("should identify gas estimation errors", () => {
      // #given - gas estimation failed error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("gas estimation failed"))).toBe(true);
    });

    it("should identify gas limit errors", () => {
      // #given - exceeds block gas limit error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("exceeds block gas limit"))).toBe(true);
    });

    it("should identify revert errors", () => {
      // #given - transaction will revert error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("transaction will revert"))).toBe(true);
    });

    it("should identify transaction may fail errors", () => {
      // #given - transaction may fail error
      // #when - checking if gas estimation error
      // #then - should be identified as gas error
      expect(isGasEstimationError(new Error("transaction may fail or require more gas"))).toBe(
        true
      );
    });

    it("should handle non-Error objects", () => {
      // #given - string error messages instead of Error objects
      // #when - checking if gas estimation error
      // #then - should still identify gas errors
      expect(isGasEstimationError("execution reverted")).toBe(true);
      expect(isGasEstimationError("out of gas")).toBe(true);
    });

    it("should return false for non-gas errors", () => {
      // #given - non-gas related errors
      // #when - checking if gas estimation error
      // #then - should return false
      expect(isGasEstimationError(new Error("invalid address"))).toBe(false);
      expect(isGasEstimationError(new Error("network error"))).toBe(false);
      expect(isGasEstimationError(new Error("rate limit exceeded"))).toBe(false);
    });

    it("should be case-insensitive", () => {
      // #given - uppercase error messages
      // #when - checking if gas estimation error
      // #then - should identify regardless of case
      expect(isGasEstimationError(new Error("GAS REQUIRED EXCEEDS"))).toBe(true);
      expect(isGasEstimationError(new Error("EXECUTION REVERTED"))).toBe(true);
    });
  });

  describe("getReceiptOrNull", () => {
    it("should return receipt when found", async () => {
      // #given - mock provider that returns a receipt
      const mockReceipt = { transactionHash: "0x123" } as ethers.providers.TransactionReceipt;
      const mockProvider = {
        getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      } as unknown as ethers.providers.Provider;

      // #when - getting receipt
      const result = await getReceiptOrNull("0x123", mockProvider);

      // #then - should return the receipt
      expect(result).toEqual(mockReceipt);
    });

    it("should return null when receipt is null", async () => {
      // #given - mock provider that returns null
      const mockProvider = {
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
      } as unknown as ethers.providers.Provider;

      // #when - getting receipt
      const result = await getReceiptOrNull("0x123", mockProvider);

      // #then - should return null
      expect(result).toBeNull();
    });

    it("should return null when receipt is undefined", async () => {
      // #given - mock provider that returns undefined
      const mockProvider = {
        getTransactionReceipt: vi.fn().mockResolvedValue(undefined),
      } as unknown as ethers.providers.Provider;

      // #when - getting receipt
      const result = await getReceiptOrNull("0x123", mockProvider);

      // #then - should return null
      expect(result).toBeNull();
    });
  });
});

// Timing utility tests - test-only helpers from test/helpers
import {
  estimateBlockFromTimestamp,
  hasDeadlinePassed,
  calculateChallengeEndBlock,
  isChallengeComplete,
  isTimelockReady,
  calculateVotingEndBlock,
  getVotingSearchRange,
  parseEstimatedDurationRange,
} from "./helpers/timing-helpers";
import { TIMING } from "../src/constants";

describe("Timing Helpers (Test-Only)", () => {
  describe("estimateBlockFromTimestamp", () => {
    it("should estimate future block number", () => {
      // #given - current block, timestamp, and a future target timestamp
      const currentBlock = 1000;
      const currentTimestamp = 1700000000;
      const targetTimestamp = 1700001200; // 1200 seconds ahead
      const blockTime = 12;

      // #when - estimating the block number for target timestamp
      const result = estimateBlockFromTimestamp(
        targetTimestamp,
        currentBlock,
        currentTimestamp,
        blockTime
      );

      // #then - should calculate correct future block (100 blocks ahead)
      expect(result).toBe(1000 + 100); // 100 blocks ahead
    });

    it("should estimate past block number", () => {
      // #given - current block, timestamp, and a past target timestamp
      // #when - estimating the block number for past timestamp
      const result = estimateBlockFromTimestamp(1700000000 - 1200, 1000, 1700000000, 12);

      // #then - should calculate correct past block
      expect(result).toBe(900);
    });
  });

  describe("hasDeadlinePassed", () => {
    it("should return true when deadline passed", () => {
      // #given - deadline block before current block
      // #when - checking if deadline passed
      // #then - should return true
      expect(hasDeadlinePassed(100, 200)).toBe(true);
    });

    it("should return true when at deadline", () => {
      // #given - deadline block equal to current block
      // #when - checking if deadline passed
      // #then - should return true (inclusive)
      expect(hasDeadlinePassed(100, 100)).toBe(true);
    });

    it("should return false when before deadline", () => {
      // #given - deadline block after current block
      // #when - checking if deadline passed
      // #then - should return false
      expect(hasDeadlinePassed(200, 100)).toBe(false);
    });

    it("should handle BigNumber deadline", () => {
      // #given - deadline as BigNumber
      // #when - checking if deadline passed
      // #then - should correctly compare with number
      expect(hasDeadlinePassed(BigNumber.from(100), 200)).toBe(true);
      expect(hasDeadlinePassed(BigNumber.from(300), 200)).toBe(false);
    });
  });

  describe("calculateChallengeEndBlock", () => {
    it("should add challenge period blocks", () => {
      // #given - L2→L1 message creation block
      // #when - calculating challenge end block
      const result = calculateChallengeEndBlock(1000);

      // #then - should add challenge period blocks to creation block
      expect(result).toBe(1000 + TIMING.CHALLENGE_PERIOD_BLOCKS_L1);
    });
  });

  describe("isChallengeComplete", () => {
    it("should return true when challenge complete", () => {
      // #given - challenge end block at or before current block
      // #when - checking if challenge complete
      // #then - should return true
      expect(isChallengeComplete(100, 200)).toBe(true);
      expect(isChallengeComplete(100, 100)).toBe(true);
    });

    it("should return false when challenge pending", () => {
      // #given - challenge end block after current block
      // #when - checking if challenge complete
      // #then - should return false
      expect(isChallengeComplete(200, 100)).toBe(false);
    });
  });

  describe("isTimelockReady", () => {
    it("should return true when past ETA", () => {
      // #given - ETA timestamp before current timestamp
      // #when - checking if timelock ready
      // #then - should return true
      expect(isTimelockReady(1700000000, 1700000001)).toBe(true);
    });

    it("should return true when at ETA", () => {
      // #given - ETA timestamp equal to current timestamp
      // #when - checking if timelock ready
      // #then - should return true (inclusive)
      expect(isTimelockReady(1700000000, 1700000000)).toBe(true);
    });

    it("should return false when before ETA", () => {
      // #given - ETA timestamp after current timestamp
      // #when - checking if timelock ready
      // #then - should return false
      expect(isTimelockReady(1700000000, 1699999999)).toBe(false);
    });
  });

  describe("calculateVotingEndBlock", () => {
    it("should add voting period to start block", () => {
      // #given - voting start block and period
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);

      // #when - calculating voting end block
      const result = calculateVotingEndBlock(start, period);

      // #then - should add period to start block
      expect(result.toNumber()).toBe(51400);
    });

    it("should use extension if provided and positive", () => {
      // #given - start block, period, and positive extension deadline
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);
      const extension = BigNumber.from(60000);

      // #when - calculating voting end block with extension
      const result = calculateVotingEndBlock(start, period, extension);

      // #then - should use extension deadline instead of start + period
      expect(result.toNumber()).toBe(60000);
    });

    it("should ignore zero extension", () => {
      // #given - start block, period, and zero extension
      const start = BigNumber.from(1000);
      const period = BigNumber.from(50400);
      const extension = BigNumber.from(0);

      // #when - calculating voting end block with zero extension
      const result = calculateVotingEndBlock(start, period, extension);

      // #then - should fall back to start + period
      expect(result.toNumber()).toBe(51400);
    });
  });

  describe("getVotingSearchRange", () => {
    it("should return range from creation to max voting period", () => {
      // #given - creation block and a far future current block
      // #when - getting voting search range
      const result = getVotingSearchRange(1000, 10000000);

      // #then - should cap at max voting period from creation
      expect(result.fromBlock).toBe(1000);
      expect(result.toBlock).toBe(1000 + TIMING.MAX_VOTING_PERIOD_BLOCKS_L2);
    });

    it("should cap at current block", () => {
      // #given - creation block and nearby current block
      // #when - getting voting search range
      const result = getVotingSearchRange(1000, 2000);

      // #then - should cap at current block
      expect(result.fromBlock).toBe(1000);
      expect(result.toBlock).toBe(2000);
    });
  });

  describe("parseEstimatedDurationRange", () => {
    it("should parse range format (14-16 days)", () => {
      // #given - duration range string
      // #when - parsing the range
      const result = parseEstimatedDurationRange("14-16 days");

      // #then - should extract min and max values
      expect(result).toEqual({ min: 14, max: 16 });
    });

    it("should parse single value (3 days)", () => {
      // #given - single duration string
      // #when - parsing the value
      const result = parseEstimatedDurationRange("3 days");

      // #then - should set min and max to same value
      expect(result).toEqual({ min: 3, max: 3 });
    });

    it("should handle tilde prefix (~3 days)", () => {
      // #given - duration with approximate prefix
      // #when - parsing the value
      const result = parseEstimatedDurationRange("~3 days");

      // #then - should extract numeric value ignoring tilde
      expect(result).toEqual({ min: 3, max: 3 });
    });

    it("should handle singular day", () => {
      // #given - singular "day" instead of "days"
      // #when - parsing the value
      const result = parseEstimatedDurationRange("1 day");

      // #then - should correctly parse
      expect(result).toEqual({ min: 1, max: 1 });
    });

    it("should return zeros for undefined", () => {
      // #given - undefined input
      // #when - parsing undefined
      const result = parseEstimatedDurationRange(undefined);

      // #then - should return zeros
      expect(result).toEqual({ min: 0, max: 0 });
    });

    it("should return zeros for invalid format", () => {
      // #given - invalid format string
      // #when - parsing invalid input
      const result = parseEstimatedDurationRange("invalid");

      // #then - should return zeros
      expect(result).toEqual({ min: 0, max: 0 });
    });
  });
});

// Stage Metadata Tests
import {
  getStageMetadata,
  formatStageTitle,
  getAllStageMetadata,
  ALL_STAGE_TYPES,
} from "../src/utils/stage-metadata";

describe("Stage Metadata Utilities", () => {
  describe("getStageMetadata", () => {
    it("should return metadata for PROPOSAL_CREATED", () => {
      // #given - PROPOSAL_CREATED stage type
      // #when - getting metadata
      const meta = getStageMetadata("PROPOSAL_CREATED");

      // #then - should return complete metadata for stage
      expect(meta.title).toBe("Proposal Created");
      expect(meta.description).toBeDefined();
      expect(meta.chain).toBe("arb1");
      expect(typeof meta.estimatedDays).toBe("number");
    });

    it("should return metadata for L1 stages", () => {
      // #given - L1_TIMELOCK stage type
      // #when - getting metadata
      const meta = getStageMetadata("L1_TIMELOCK");

      // #then - should return L1-specific metadata
      expect(meta.chain).toBe("ethereum");
      expect(meta.title).toBeDefined();
    });

    it("should return metadata for all stage types", () => {
      // #given - all possible stage types
      const stageTypes: StageType[] = [
        "PROPOSAL_CREATED",
        "VOTING_ACTIVE",
        "PROPOSAL_QUEUED",
        "L2_TIMELOCK",
        "L2_TIMELOCK",
        "L2_TO_L1_MESSAGE",
        "L2_TO_L1_MESSAGE",
        "L1_TIMELOCK",
        "L1_TIMELOCK",
        "RETRYABLE_EXECUTED",
      ];

      // #when - getting metadata for each stage type
      // #then - all should have complete metadata with valid chain
      for (const stageType of stageTypes) {
        const meta = getStageMetadata(stageType);
        expect(meta.title).toBeDefined();
        expect(meta.description).toBeDefined();
        expect(["ethereum", "arb1", "nova", "CROSS_CHAIN"]).toContain(meta.chain);
      }
    });
  });

  describe("formatStageTitle", () => {
    it("should format stage title correctly", () => {
      // #given - stage type constants in SCREAMING_SNAKE_CASE
      // #when - formatting to title case
      // #then - should convert to readable title
      expect(formatStageTitle("L2_TIMELOCK")).toBe("L2 Timelock");
      expect(formatStageTitle("VOTING_ACTIVE")).toBe("Voting Active");
      expect(formatStageTitle("RETRYABLE_EXECUTED")).toBe("Retryable Executed");
    });
  });

  describe("getAllStageMetadata", () => {
    it("should return metadata for all stage types", () => {
      // #given - no preconditions (calling the function)
      // #when - getting all stage metadata
      const allMeta = getAllStageMetadata();

      // #then - should return metadata for all stage types
      expect(Object.keys(allMeta).length).toBe(ALL_STAGE_TYPES.length);
      for (const stageType of ALL_STAGE_TYPES) {
        expect(allMeta[stageType]).toBeDefined();
        expect(allMeta[stageType].title).toBeDefined();
        expect(allMeta[stageType].description).toBeDefined();
      }
    });

    it("should return memoized result on subsequent calls", () => {
      // #given - no preconditions
      // #when - calling getAllStageMetadata twice
      const first = getAllStageMetadata();
      const second = getAllStageMetadata();

      // #then - should return the same cached object reference
      expect(first).toBe(second);
    });

    it("should include both governor and election stage types", () => {
      // #given - no preconditions
      // #when - getting all stage metadata
      const allMeta = getAllStageMetadata();

      // #then - should include governor stages
      expect(allMeta["PROPOSAL_CREATED"]).toBeDefined();
      expect(allMeta["VOTING_ACTIVE"]).toBeDefined();
      expect(allMeta["L2_TIMELOCK"]).toBeDefined();
      expect(allMeta["RETRYABLE_EXECUTED"]).toBeDefined();

      // #then - should include election stages
      expect(allMeta["CREATE_ELECTION"]).toBeDefined();
      expect(allMeta["NOMINEE_ELECTION"]).toBeDefined();
      expect(allMeta["MEMBER_ELECTION"]).toBeDefined();
    });
  });

  describe("ALL_STAGE_TYPES", () => {
    it("should include all governance and election stage types", () => {
      // #given - the ALL_STAGE_TYPES constant
      // #when - checking its contents
      // #then - should include all expected stage types
      expect(ALL_STAGE_TYPES).toContain("PROPOSAL_CREATED");
      expect(ALL_STAGE_TYPES).toContain("VOTING_ACTIVE");
      expect(ALL_STAGE_TYPES).toContain("PROPOSAL_QUEUED");
      expect(ALL_STAGE_TYPES).toContain("L2_TIMELOCK");
      expect(ALL_STAGE_TYPES).toContain("L2_TO_L1_MESSAGE");
      expect(ALL_STAGE_TYPES).toContain("L1_TIMELOCK");
      expect(ALL_STAGE_TYPES).toContain("RETRYABLE_EXECUTED");
      expect(ALL_STAGE_TYPES).toContain("CREATE_ELECTION");
      expect(ALL_STAGE_TYPES).toContain("NOMINEE_ELECTION");
      expect(ALL_STAGE_TYPES).toContain("NOMINEE_VETTING");
      expect(ALL_STAGE_TYPES).toContain("MEMBER_ELECTION");
    });

    it("should have correct total count", () => {
      // #given - the ALL_STAGE_TYPES constant
      // #then - should have 11 stage types (7 governor + 4 election)
      expect(ALL_STAGE_TYPES.length).toBe(11);
    });
  });
});

// Tracker unit tests (no RPC required)
import { createTracker } from "../src";

describe("Tracker Creation (Unit Tests)", () => {
  describe("createTracker", () => {
    it("should throw if l1Provider missing", () => {
      // #given - tracker options with missing l1Provider
      // #when - creating tracker
      // #then - should throw error about missing provider
      expect(() =>
        createTracker({
          l2Provider: {} as ethers.providers.Provider,
          novaProvider: {} as ethers.providers.Provider,
          l1Provider: undefined,
        } as any)
      ).toThrow("Provider or RPC URL is required");
    });

    it("should create tracker with valid providers", () => {
      // #given - mock providers for all three chains
      const mockL1Provider = { getNetwork: () => Promise.resolve({ chainId: 1 }) };
      const mockL2Provider = { getNetwork: () => Promise.resolve({ chainId: 42161 }) };
      const mockNovaProvider = { getNetwork: () => Promise.resolve({ chainId: 42170 }) };

      // #when - creating tracker with valid providers
      const tracker = createTracker({
        l1Provider: mockL1Provider as any,
        l2Provider: mockL2Provider as any,
        novaProvider: mockNovaProvider as any,
      });

      // #then - tracker should have all expected methods
      expect(tracker).toBeDefined();
      expect(typeof tracker.trackByTxHash).toBe("function");
      expect(typeof tracker.trackFromCheckpoint).toBe("function");
      expect(typeof tracker.prepareTransaction).toBe("function");
    });

    it("should create tracker with RPC URLs", () => {
      // #when - creating tracker with RPC URL strings
      const tracker = createTracker({
        l1Provider: "https://eth.llamarpc.com",
        l2Provider: "https://arb1.arbitrum.io/rpc",
        novaProvider: "https://nova.arbitrum.io/rpc",
      });

      // #then - tracker should have all expected methods
      expect(tracker).toBeDefined();
      expect(typeof tracker.trackByTxHash).toBe("function");
    });

    it("should create tracker with mixed providers and URLs", () => {
      // #given - mock provider for L1
      const mockL1Provider = { getNetwork: () => Promise.resolve({ chainId: 1 }) };

      // #when - creating tracker with mixed provider types
      const tracker = createTracker({
        l1Provider: mockL1Provider as any,
        l2Provider: "https://arb1.arbitrum.io/rpc",
      });

      // #then - tracker should be created
      expect(tracker).toBeDefined();
    });
  });
});

// Import StageType for use in tests
import type { StageType, StageTransaction } from "../src/types";

// URL utility tests
import { getExplorerUrl, getTxUrl, getStageTransactionUrl, CHAIN_IDS } from "../src/constants";

describe("URL Utilities", () => {
  describe("getExplorerUrl", () => {
    it("should return Etherscan URL for Ethereum", () => {
      // #given - Ethereum chain ID, tx type, and hash
      // #when - getting explorer URL
      const url = getExplorerUrl(1, "tx", "0x123");

      // #then - should return Etherscan URL
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });

    it("should return Arbiscan URL for Arbitrum One", () => {
      // #given - Arbitrum One chain ID, tx type, and hash
      // #when - getting explorer URL
      const url = getExplorerUrl(CHAIN_IDS.ARB_ONE, "tx", "0x456");

      // #then - should return Arbiscan URL
      expect(url).toBe("https://arbiscan.io/tx/0x456");
    });

    it("should return Nova Arbiscan URL for Nova", () => {
      // #given - Nova chain ID, address type, and address
      // #when - getting explorer URL
      const url = getExplorerUrl(CHAIN_IDS.NOVA, "address", "0x789");

      // #then - should return Nova Arbiscan URL
      expect(url).toBe("https://nova.arbiscan.io/address/0x789");
    });

    it("should default to Etherscan for unknown chain", () => {
      // #given - unknown chain ID
      // #when - getting explorer URL
      const url = getExplorerUrl(999, "tx", "0xabc");

      // #then - should fall back to Etherscan
      expect(url).toBe("https://etherscan.io/tx/0xabc");
    });
  });

  describe("getTxUrl", () => {
    it("should return transaction URL", () => {
      // #given - chain ID and transaction hash
      // #when - getting transaction URL
      const url = getTxUrl(1, "0x123");

      // #then - should return correct explorer tx URL
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });
  });

  describe("getStageTransactionUrl", () => {
    it("should return URL for L1 transaction", () => {
      // #given - L1 stage transaction
      const tx: StageTransaction = {
        hash: "0x123",
        blockNumber: 100,
        chain: "ethereum",
        chainId: 1,
      };

      // #when - getting stage transaction URL
      const url = getStageTransactionUrl(tx);

      // #then - should return Etherscan URL
      expect(url).toBe("https://etherscan.io/tx/0x123");
    });

    it("should return URL for L2 transaction", () => {
      // #given - L2 (Arbitrum One) stage transaction
      const tx: StageTransaction = {
        hash: "0x456",
        blockNumber: 200,
        chain: "arb1",
        chainId: 42161,
      };

      // #when - getting stage transaction URL
      const url = getStageTransactionUrl(tx);

      // #then - should return Arbiscan URL
      expect(url).toBe("https://arbiscan.io/tx/0x456");
    });

    it("should return URL for Nova transaction", () => {
      // #given - Nova stage transaction
      const tx: StageTransaction = {
        hash: "0x789",
        blockNumber: 300,
        chain: "nova",
        chainId: 42170,
      };

      // #when - getting stage transaction URL
      const url = getStageTransactionUrl(tx);

      // #then - should return Nova Arbiscan URL
      expect(url).toBe("https://nova.arbiscan.io/tx/0x789");
    });
  });
});
