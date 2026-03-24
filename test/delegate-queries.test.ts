/**
 * Delegate Query Tests (mocked)
 *
 * Tests for queryDelegatesNotVoted and queryDelegateVotingPowers
 * with mocked multicall responses.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock multicall
vi.mock("../src/utils/multicall", () => ({
  multicall: vi.fn(),
  buildCallInput: vi.fn(
    (targetAddr: string, iface: ethers.utils.Interface, method: string, args: unknown[]) => ({
      targetAddr,
      encoder: () => iface.encodeFunctionData(method, args),
      decoder: (data: string) => iface.decodeFunctionResult(method, data)[0],
    })
  ),
  getMultiCaller: vi.fn(),
}));

import { multicall } from "../src/utils/multicall";
import { queryDelegatesNotVoted, queryDelegateVotingPowers } from "../src/delegates/queries";
import type { DelegateCache, DelegateInfo } from "../src/types/delegates";

const mockedMulticall = vi.mocked(multicall);

function makeDelegate(address: string, votingPower: string): DelegateInfo {
  return {
    address: address.toLowerCase() as `0x${string}`,
    votingPower,
    lastChangeBlock: 100,
  };
}

function makeCache(delegates: DelegateInfo[]): DelegateCache {
  return {
    version: 1,
    generatedAt: "2026-03-17T00:00:00.000Z",
    snapshotBlock: 400000000,
    startBlock: 70398215,
    chainId: 42161,
    totalVotingPower: "0",
    totalSupply: "0",
    delegates,
    stats: { totalDelegates: delegates.length },
  };
}

const MOCK_PROVIDER = {} as ethers.providers.Provider;
const MOCK_GOVERNOR = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
const PROPOSAL_ID = "12345";

describe("Delegate Queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryDelegatesNotVoted", () => {
    it("should return delegates that haven't voted", async () => {
      // #given
      const delegates = [
        makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000"),
        makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500"),
        makeDelegate("0xcccccccccccccccccccccccccccccccccccccccc", "100"),
      ];
      const cache = makeCache(delegates);

      // delegate A voted, B and C did not
      mockedMulticall.mockResolvedValueOnce([true, false, false] as never);

      // #when
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
        limit: 5,
        batchSize: 10,
      });

      // #then
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      expect(result[0].rank).toBe(2);
      expect(result[1].address).toBe("0xcccccccccccccccccccccccccccccccccccccccc");
      expect(result[1].rank).toBe(3);
    });

    it("should stop early when limit reached", async () => {
      // #given
      const delegates = [
        makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000"),
        makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500"),
        makeDelegate("0xcccccccccccccccccccccccccccccccccccccccc", "100"),
        makeDelegate("0xdddddddddddddddddddddddddddddddddddddddd", "50"),
      ];
      const cache = makeCache(delegates);

      // none voted
      mockedMulticall.mockResolvedValueOnce([false, false, false, false] as never);

      // #when - limit to 2
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
        limit: 2,
        batchSize: 10,
      });

      // #then
      expect(result).toHaveLength(2);
    });

    it("should return empty array for empty cache", async () => {
      // #given
      const cache = makeCache([]);

      // #when
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
      });

      // #then
      expect(result).toHaveLength(0);
      expect(mockedMulticall).not.toHaveBeenCalled();
    });

    it("should respect maxDelegatesToCheck", async () => {
      // #given - 4 delegates but only check top 2
      const delegates = [
        makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000"),
        makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500"),
        makeDelegate("0xcccccccccccccccccccccccccccccccccccccccc", "100"),
        makeDelegate("0xdddddddddddddddddddddddddddddddddddddddd", "50"),
      ];
      const cache = makeCache(delegates);

      mockedMulticall.mockResolvedValueOnce([true, false] as never);

      // #when
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
        maxDelegatesToCheck: 2,
        batchSize: 10,
      });

      // #then - only 1 non-voter from top 2
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("should handle undefined multicall results gracefully", async () => {
      // #given
      const delegates = [
        makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000"),
        makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500"),
      ];
      const cache = makeCache(delegates);

      // undefined = call failed, skip that delegate
      mockedMulticall.mockResolvedValueOnce([undefined, false] as never);

      // #when
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
        batchSize: 10,
      });

      // #then - only B is confirmed as non-voter
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("should process in batches", async () => {
      // #given - 4 delegates, batchSize 2
      const delegates = [
        makeDelegate("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1000"),
        makeDelegate("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "500"),
        makeDelegate("0xcccccccccccccccccccccccccccccccccccccccc", "100"),
        makeDelegate("0xdddddddddddddddddddddddddddddddddddddddd", "50"),
      ];
      const cache = makeCache(delegates);

      // batch 1: A voted, B didn't
      mockedMulticall.mockResolvedValueOnce([true, false] as never);
      // batch 2: C voted, D didn't
      mockedMulticall.mockResolvedValueOnce([true, false] as never);

      // #when
      const result = await queryDelegatesNotVoted(MOCK_PROVIDER, PROPOSAL_ID, MOCK_GOVERNOR, {
        cache,
        limit: 5,
        batchSize: 2,
      });

      // #then - two batches called
      expect(mockedMulticall).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  describe("queryDelegateVotingPowers", () => {
    it("should return voting powers as map", async () => {
      // #given
      const addresses = [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ];

      mockedMulticall.mockResolvedValueOnce([
        BigNumber.from("1000000000000000000000"),
        BigNumber.from("500000000000000000000"),
      ] as never);

      // #when
      const result = await queryDelegateVotingPowers(MOCK_PROVIDER, addresses);

      // #then
      expect(result.size).toBe(2);
      expect(result.get("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
        "1000000000000000000000"
      );
      expect(result.get("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(
        "500000000000000000000"
      );
    });

    it("should return empty map for empty addresses", async () => {
      // #given / #when
      const result = await queryDelegateVotingPowers(MOCK_PROVIDER, []);

      // #then
      expect(result.size).toBe(0);
      expect(mockedMulticall).not.toHaveBeenCalled();
    });

    it("should skip undefined results", async () => {
      // #given
      const addresses = [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ];

      mockedMulticall.mockResolvedValueOnce([BigNumber.from("1000"), undefined] as never);

      // #when
      const result = await queryDelegateVotingPowers(MOCK_PROVIDER, addresses);

      // #then
      expect(result.size).toBe(1);
      expect(result.has("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(false);
    });
  });
});
