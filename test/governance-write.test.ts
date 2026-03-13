/**
 * Unit tests for governance/write.ts
 *
 * Tests for vote transaction preparation for regular Governor proposals.
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";

import {
  prepareCastVote,
  prepareCastVoteWithReason,
  prepareCastVoteWithReasonAndParams,
  VOTE_SUPPORT,
  ADDRESSES,
  CHAIN_IDS,
} from "../src";

const castVoteIface = new ethers.utils.Interface([
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
]);

const castVoteWithReasonIface = new ethers.utils.Interface([
  "function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)",
]);

const castVoteWithReasonAndParamsIface = new ethers.utils.Interface([
  "function castVoteWithReasonAndParams(uint256 proposalId, uint8 support, string reason, bytes params) returns (uint256)",
]);

describe("governance/write", () => {
  // ============================================================================
  // prepareCastVote
  // ============================================================================

  describe("prepareCastVote", () => {
    it("should prepare a FOR vote on the constitutional governor by default", () => {
      // #given
      const proposalId = "12345";

      // #when
      const tx = prepareCastVote(proposalId, VOTE_SUPPORT.FOR);

      // #then
      expect(tx.to).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
      expect(tx.chain).toBe("arb1");
      expect(tx.chainId).toBe(CHAIN_IDS.ARB_ONE);
      expect(tx.value).toBe("0");

      const decoded = castVoteIface.decodeFunctionData("castVote", tx.data);
      expect(decoded.proposalId.toString()).toBe("12345");
      expect(decoded.support).toBe(1);
    });

    it("should prepare an AGAINST vote", () => {
      // #when
      const tx = prepareCastVote("12345", VOTE_SUPPORT.AGAINST);

      // #then
      const decoded = castVoteIface.decodeFunctionData("castVote", tx.data);
      expect(decoded.support).toBe(0);
      expect(tx.description).toContain("Against");
    });

    it("should prepare an ABSTAIN vote", () => {
      // #when
      const tx = prepareCastVote("12345", VOTE_SUPPORT.ABSTAIN);

      // #then
      const decoded = castVoteIface.decodeFunctionData("castVote", tx.data);
      expect(decoded.support).toBe(2);
      expect(tx.description).toContain("Abstain");
    });

    it("should target constitutional governor with shorthand", () => {
      const tx = prepareCastVote("12345", VOTE_SUPPORT.FOR, "constitutional");
      expect(tx.to).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
    });

    it("should target non-constitutional governor with shorthand", () => {
      const tx = prepareCastVote("12345", VOTE_SUPPORT.FOR, "non-constitutional");
      expect(tx.to).toBe(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
    });

    it("should accept explicit governor address", () => {
      const customAddr = "0x" + "ff".repeat(20);
      const tx = prepareCastVote("12345", VOTE_SUPPORT.FOR, customAddr);
      expect(tx.to).toBe(customAddr);
    });

    it("should use castVote function selector", () => {
      const tx = prepareCastVote("12345", VOTE_SUPPORT.FOR);
      const selector = castVoteIface.getSighash("castVote");
      expect(tx.data.startsWith(selector)).toBe(true);
    });

    it("should handle large proposal IDs", () => {
      const largeId =
        "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      const tx = prepareCastVote(largeId, VOTE_SUPPORT.FOR);
      const decoded = castVoteIface.decodeFunctionData("castVote", tx.data);
      expect(decoded.proposalId.toString()).toBe(largeId);
    });

    it("should accept custom chainId", () => {
      const tx = prepareCastVote("12345", VOTE_SUPPORT.FOR, undefined, 1);
      expect(tx.chainId).toBe(1);
    });
  });

  // ============================================================================
  // prepareCastVoteWithReason
  // ============================================================================

  describe("prepareCastVoteWithReason", () => {
    it("should encode reason string in calldata", () => {
      // #when
      const tx = prepareCastVoteWithReason(
        "67890",
        VOTE_SUPPORT.FOR,
        "This proposal improves governance"
      );

      // #then
      const decoded = castVoteWithReasonIface.decodeFunctionData("castVoteWithReason", tx.data);
      expect(decoded[0].toString()).toBe("67890");
      expect(decoded[1]).toBe(1);
      expect(decoded[2]).toBe("This proposal improves governance");
    });

    it("should handle empty reason", () => {
      const tx = prepareCastVoteWithReason("12345", VOTE_SUPPORT.AGAINST, "");

      const decoded = castVoteWithReasonIface.decodeFunctionData("castVoteWithReason", tx.data);
      expect(decoded[2]).toBe("");
    });

    it("should target non-constitutional governor with shorthand", () => {
      const tx = prepareCastVoteWithReason(
        "12345",
        VOTE_SUPPORT.FOR,
        "reason",
        "non-constitutional"
      );
      expect(tx.to).toBe(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
    });

    it("should use castVoteWithReason function selector", () => {
      const tx = prepareCastVoteWithReason("12345", VOTE_SUPPORT.FOR, "reason");
      const selector = castVoteWithReasonIface.getSighash("castVoteWithReason");
      expect(tx.data.startsWith(selector)).toBe(true);
    });

    it("should handle unicode reason strings", () => {
      const tx = prepareCastVoteWithReason("12345", VOTE_SUPPORT.FOR, "投票理由 🗳️");
      const decoded = castVoteWithReasonIface.decodeFunctionData("castVoteWithReason", tx.data);
      expect(decoded[2]).toBe("投票理由 🗳️");
    });
  });

  // ============================================================================
  // prepareCastVoteWithReasonAndParams
  // ============================================================================

  describe("prepareCastVoteWithReasonAndParams", () => {
    it("should encode reason and params in calldata", () => {
      // #given
      const params = ethers.utils.defaultAbiCoder.encode(["uint256"], [42]);

      // #when
      const tx = prepareCastVoteWithReasonAndParams(
        "12345",
        VOTE_SUPPORT.FOR,
        "custom vote",
        params
      );

      // #then
      const decoded = castVoteWithReasonAndParamsIface.decodeFunctionData(
        "castVoteWithReasonAndParams",
        tx.data
      );
      expect(decoded[0].toString()).toBe("12345");
      expect(decoded[1]).toBe(1);
      expect(decoded[2]).toBe("custom vote");
      expect(decoded[3]).toBe(params);
    });

    it("should use correct function selector", () => {
      const tx = prepareCastVoteWithReasonAndParams("12345", VOTE_SUPPORT.ABSTAIN, "", "0x");
      const selector = castVoteWithReasonAndParamsIface.getSighash("castVoteWithReasonAndParams");
      expect(tx.data.startsWith(selector)).toBe(true);
    });

    it("should handle empty params", () => {
      const tx = prepareCastVoteWithReasonAndParams("12345", VOTE_SUPPORT.FOR, "reason", "0x");
      const decoded = castVoteWithReasonAndParamsIface.decodeFunctionData(
        "castVoteWithReasonAndParams",
        tx.data
      );
      expect(decoded[3]).toBe("0x");
    });

    it("should accept complex encoded params", () => {
      const params = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256", "bytes"],
        ["0x" + "ab".repeat(20), 1000, "0xdeadbeef"]
      );

      const tx = prepareCastVoteWithReasonAndParams(
        "12345",
        VOTE_SUPPORT.FOR,
        "complex params",
        params
      );
      const decoded = castVoteWithReasonAndParamsIface.decodeFunctionData(
        "castVoteWithReasonAndParams",
        tx.data
      );
      expect(decoded[3]).toBe(params);
    });
  });

  // ============================================================================
  // VOTE_SUPPORT constants
  // ============================================================================

  describe("VOTE_SUPPORT", () => {
    it("should have standard OpenZeppelin values", () => {
      expect(VOTE_SUPPORT.AGAINST).toBe(0);
      expect(VOTE_SUPPORT.FOR).toBe(1);
      expect(VOTE_SUPPORT.ABSTAIN).toBe(2);
    });

    it("should have exactly three entries", () => {
      expect(Object.keys(VOTE_SUPPORT)).toEqual(["AGAINST", "FOR", "ABSTAIN"]);
    });
  });

  // ============================================================================
  // hashOperation / hashOperationBatch re-exports
  // ============================================================================

  describe("public re-exports", () => {
    it("should export hashOperation from root index", async () => {
      const { hashOperation } = await import("../src");
      expect(typeof hashOperation).toBe("function");
    });

    it("should export hashOperationBatch from root index", async () => {
      const { hashOperationBatch } = await import("../src");
      expect(typeof hashOperationBatch).toBe("function");
    });
  });
});
