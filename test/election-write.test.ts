/**
 * Unit tests for election/write.ts
 *
 * Tests for vote parameter encoding/decoding, typed data construction,
 * and transaction preparation for election write actions.
 */

import { describe, it, expect } from "vitest";
import { ethers, BigNumber } from "ethers";

import {
  encodeElectionVoteParams,
  decodeElectionVoteParams,
  getAddContenderTypedData,
  prepareAddContender,
  prepareContenderRegistration,
  prepareNomineeElectionVote,
  prepareMemberElectionVote,
} from "../src/election";
import { ADDRESSES, CHAIN_IDS } from "../src/constants";

describe("election/write", () => {
  // ============================================================================
  // Vote Parameter Encoding/Decoding
  // ============================================================================

  describe("encodeElectionVoteParams", () => {
    it("should encode address and votes correctly", () => {
      const target = "0x" + "ab".repeat(20);
      const votes = BigNumber.from("1000000000000000000");

      const encoded = encodeElectionVoteParams(target, votes);

      expect(encoded).toBeDefined();
      expect(encoded.startsWith("0x")).toBe(true);
      // ABI-encoded (address, uint256) is exactly 64 bytes = 128 hex chars + "0x"
      expect(encoded.length).toBe(2 + 128);
    });

    it("should accept string votes", () => {
      const target = "0x" + "ab".repeat(20);
      const votes = "1000000000000000000";

      const encoded = encodeElectionVoteParams(target, votes);

      expect(encoded).toBeDefined();
      expect(encoded.length).toBe(2 + 128);
    });

    it("should handle zero votes", () => {
      const target = "0x" + "ab".repeat(20);

      const encoded = encodeElectionVoteParams(target, "0");

      expect(encoded).toBeDefined();
      expect(encoded.length).toBe(2 + 128);
    });
  });

  describe("decodeElectionVoteParams", () => {
    it("should round-trip encode/decode", () => {
      const target = ethers.utils.getAddress("0x" + "ab".repeat(20));
      const votes = BigNumber.from("5000000000000000000");

      const encoded = encodeElectionVoteParams(target, votes);
      const decoded = decodeElectionVoteParams(encoded);

      expect(decoded.target.toLowerCase()).toBe(target.toLowerCase());
      expect(decoded.votes.eq(votes)).toBe(true);
    });

    it("should decode large vote amounts", () => {
      const target = "0x" + "01".repeat(20);
      const votes = BigNumber.from("999999999999999999999999");

      const encoded = encodeElectionVoteParams(target, votes);
      const decoded = decodeElectionVoteParams(encoded);

      expect(decoded.votes.eq(votes)).toBe(true);
    });
  });

  // ============================================================================
  // Contender Registration
  // ============================================================================

  describe("getAddContenderTypedData", () => {
    it("should produce valid EIP-712 typed data", () => {
      const result = getAddContenderTypedData("SecurityCouncilNomineeElectionGovernor", "12345");

      expect(result.domain.name).toBe("SecurityCouncilNomineeElectionGovernor");
      expect(result.domain.version).toBe("1");
      expect(result.domain.chainId).toBe(CHAIN_IDS.ARB_ONE);
      expect(result.domain.verifyingContract).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);

      expect(result.primaryType).toBe("AddContenderMessage");
      expect(result.types.AddContenderMessage).toEqual([{ name: "proposalId", type: "uint256" }]);

      expect(result.message.proposalId).toBe("12345");
    });

    it("should accept custom governor address and chain ID", () => {
      const customAddr = "0x" + "ff".repeat(20);
      const customChainId = 421614; // Arbitrum Sepolia

      const result = getAddContenderTypedData("TestGovernor", "99", customAddr, customChainId);

      expect(result.domain.verifyingContract).toBe(customAddr);
      expect(result.domain.chainId).toBe(customChainId);
    });
  });

  describe("prepareAddContender", () => {
    it("should encode addContender calldata correctly", () => {
      const proposalId = "12345";
      const signature = "0x" + "ab".repeat(65);

      const tx = prepareAddContender(proposalId, signature);

      expect(tx.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(tx.chain).toBe("arb1");
      expect(tx.chainId).toBe(CHAIN_IDS.ARB_ONE);
      expect(tx.value).toBe("0");

      // Verify it starts with addContender function selector
      const iface = new ethers.utils.Interface([
        "function addContender(uint256 proposalId, bytes signature)",
      ]);
      const selector = iface.getSighash("addContender");
      expect(tx.data.startsWith(selector)).toBe(true);

      // Verify we can decode it back
      const decoded = iface.decodeFunctionData("addContender", tx.data);
      expect(decoded.proposalId.toString()).toBe(proposalId);
    });
  });

  describe("prepareContenderRegistration", () => {
    it("should return typedData and buildTransaction", () => {
      const result = prepareContenderRegistration(
        "SecurityCouncilNomineeElectionGovernor",
        "12345"
      );

      expect(result.typedData).toBeDefined();
      expect(result.typedData.primaryType).toBe("AddContenderMessage");
      expect(typeof result.buildTransaction).toBe("function");

      // Build transaction with a mock signature
      const signature = "0x" + "ab".repeat(65);
      const tx = result.buildTransaction(signature);
      expect(tx.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(tx.chain).toBe("arb1");
    });
  });

  // ============================================================================
  // Vote Casting
  // ============================================================================

  describe("prepareNomineeElectionVote", () => {
    it("should encode castVoteWithReasonAndParams calldata", () => {
      const proposalId = "12345";
      const target = "0x" + "ab".repeat(20);
      const votes = "1000000000000000000";

      const tx = prepareNomineeElectionVote(proposalId, target, votes);

      expect(tx.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(tx.chain).toBe("arb1");
      expect(tx.value).toBe("0");

      // Verify function selector
      const iface = new ethers.utils.Interface([
        "function castVoteWithReasonAndParams(uint256, uint8, string, bytes) returns (uint256)",
      ]);
      const selector = iface.getSighash("castVoteWithReasonAndParams");
      expect(tx.data.startsWith(selector)).toBe(true);

      // Decode and verify support=1
      const decoded = iface.decodeFunctionData("castVoteWithReasonAndParams", tx.data);
      expect(decoded[1]).toBe(1); // support = 1 (FOR)
    });

    it("should include reason when provided", () => {
      const proposalId = "12345";
      const target = "0x" + "ab".repeat(20);
      const votes = "1000000000000000000";

      const tx = prepareNomineeElectionVote(proposalId, target, votes, "I support this candidate");

      const iface = new ethers.utils.Interface([
        "function castVoteWithReasonAndParams(uint256, uint8, string, bytes) returns (uint256)",
      ]);
      const decoded = iface.decodeFunctionData("castVoteWithReasonAndParams", tx.data);
      expect(decoded[2]).toBe("I support this candidate");
    });

    it("should encode vote params within the calldata", () => {
      const proposalId = "12345";
      const target = "0x" + "ab".repeat(20);
      const votes = BigNumber.from("5000000000000000000");

      const tx = prepareNomineeElectionVote(proposalId, target, votes);

      // Decode the outer call
      const iface = new ethers.utils.Interface([
        "function castVoteWithReasonAndParams(uint256, uint8, string, bytes) returns (uint256)",
      ]);
      const decoded = iface.decodeFunctionData("castVoteWithReasonAndParams", tx.data);

      // Decode the inner params
      const innerDecoded = decodeElectionVoteParams(decoded[3]);
      expect(innerDecoded.target.toLowerCase()).toBe(target.toLowerCase());
      expect(innerDecoded.votes.eq(votes)).toBe(true);
    });
  });

  describe("prepareMemberElectionVote", () => {
    it("should target the member election governor", () => {
      const proposalId = "67890";
      const target = "0x" + "cd".repeat(20);
      const votes = "2000000000000000000";

      const tx = prepareMemberElectionVote(proposalId, target, votes);

      expect(tx.to).toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
      expect(tx.chain).toBe("arb1");
      expect(tx.value).toBe("0");
    });

    it("should use custom governor address", () => {
      const customAddr = "0x" + "ee".repeat(20);

      const tx = prepareMemberElectionVote(
        "12345",
        "0x" + "ab".repeat(20),
        "1000000000000000000",
        "",
        customAddr
      );

      expect(tx.to).toBe(customAddr);
    });

    it("should encode vote params correctly", () => {
      const target = "0x" + "cd".repeat(20);
      const votes = BigNumber.from("3000000000000000000");

      const tx = prepareMemberElectionVote("67890", target, votes);

      const iface = new ethers.utils.Interface([
        "function castVoteWithReasonAndParams(uint256, uint8, string, bytes) returns (uint256)",
      ]);
      const decoded = iface.decodeFunctionData("castVoteWithReasonAndParams", tx.data);

      // support = 1
      expect(decoded[1]).toBe(1);

      // Inner params
      const innerDecoded = decodeElectionVoteParams(decoded[3]);
      expect(innerDecoded.target.toLowerCase()).toBe(target.toLowerCase());
      expect(innerDecoded.votes.eq(votes)).toBe(true);
    });
  });
});
