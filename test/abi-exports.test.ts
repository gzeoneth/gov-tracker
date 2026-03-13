/**
 * ABI export tests
 *
 * Verifies that ABI constants are exported with `as const` for wagmi/viem compatibility
 * and that ethers v5 Interface instances can be created from them.
 */

import { describe, it, expect } from "vitest";
import { ethers } from "ethers";

import {
  GOVERNOR_ABI,
  TIMELOCK_ABI,
  NOMINEE_ELECTION_GOVERNOR_ABI,
  MEMBER_ELECTION_GOVERNOR_ABI,
  SECURITY_COUNCIL_MANAGER_ABI,
  ERC20_VOTES_ABI,
} from "../src";

describe("ABI exports", () => {
  describe("as const readonly arrays", () => {
    it("should export GOVERNOR_ABI as a readonly tuple", () => {
      // #given - GOVERNOR_ABI is exported with `as const`

      // #then - elements are string literals, array is not empty
      expect(GOVERNOR_ABI.length).toBeGreaterThan(0);
      expect(GOVERNOR_ABI[0]).toContain("function state");
    });

    it("should export TIMELOCK_ABI as a readonly tuple", () => {
      expect(TIMELOCK_ABI.length).toBeGreaterThan(0);
      expect(TIMELOCK_ABI).toContain("function isOperationReady(bytes32 id) view returns (bool)");
    });

    it("should export NOMINEE_ELECTION_GOVERNOR_ABI", () => {
      expect(NOMINEE_ELECTION_GOVERNOR_ABI.length).toBeGreaterThan(0);
      expect(NOMINEE_ELECTION_GOVERNOR_ABI).toContain(
        "function electionCount() view returns (uint256)"
      );
    });

    it("should export MEMBER_ELECTION_GOVERNOR_ABI", () => {
      expect(MEMBER_ELECTION_GOVERNOR_ABI.length).toBeGreaterThan(0);
    });

    it("should export SECURITY_COUNCIL_MANAGER_ABI", () => {
      expect(SECURITY_COUNCIL_MANAGER_ABI.length).toBeGreaterThan(0);
      expect(SECURITY_COUNCIL_MANAGER_ABI).toContain(
        "function cohortSize() view returns (uint256)"
      );
    });

    it("should export ERC20_VOTES_ABI", () => {
      expect(ERC20_VOTES_ABI.length).toBe(1);
      expect(ERC20_VOTES_ABI[0]).toContain("getPastVotes");
    });
  });

  describe("ethers v5 Interface compatibility", () => {
    it("should create Interface from GOVERNOR_ABI", () => {
      // #when - create Interface from readonly array
      const iface = new ethers.utils.Interface(GOVERNOR_ABI);

      // #then - interface has the expected functions
      expect(iface.getFunction("state")).toBeDefined();
      expect(iface.getFunction("castVote")).toBeDefined();
      expect(iface.getFunction("execute")).toBeDefined();
    });

    it("should create Interface from TIMELOCK_ABI", () => {
      const iface = new ethers.utils.Interface(TIMELOCK_ABI);

      expect(iface.getFunction("isOperationReady")).toBeDefined();
      expect(iface.getFunction("execute")).toBeDefined();
      expect(iface.getFunction("executeBatch")).toBeDefined();
    });

    it("should create Interface from NOMINEE_ELECTION_GOVERNOR_ABI", () => {
      const iface = new ethers.utils.Interface(NOMINEE_ELECTION_GOVERNOR_ABI);

      expect(iface.getFunction("addContender")).toBeDefined();
      expect(iface.getFunction("castVoteWithReasonAndParams")).toBeDefined();
    });

    it("should create Interface from MEMBER_ELECTION_GOVERNOR_ABI", () => {
      const iface = new ethers.utils.Interface(MEMBER_ELECTION_GOVERNOR_ABI);

      expect(iface.getFunction("castVoteWithReasonAndParams")).toBeDefined();
      expect(iface.getFunction("weightReceived")).toBeDefined();
    });

    it("should encode function data from readonly ABI", () => {
      // #given - Interface from as-const ABI
      const iface = new ethers.utils.Interface(GOVERNOR_ABI);

      // #when - encode a function call
      const data = iface.encodeFunctionData("castVote", [ethers.BigNumber.from("12345"), 1]);

      // #then - valid calldata produced
      expect(data).toMatch(/^0x/);
      expect(data.length).toBeGreaterThan(10);

      // round-trip decode
      const decoded = iface.decodeFunctionData("castVote", data);
      expect(decoded.proposalId.toString()).toBe("12345");
      expect(decoded.support).toBe(1);
    });
  });
});
