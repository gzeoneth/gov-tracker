/**
 * Delegate Indexer Tests (mocked)
 *
 * Tests for buildDelegateCache and adaptive chunking logic.
 * All RPC calls mocked — no network access required.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock queryWithRetry to pass through, delay to no-op
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => unknown) => fn()),
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  delay: vi.fn(() => Promise.resolve()),
}));

import { buildDelegateCache } from "../src/delegates/indexer";
import { EXCLUDED_DELEGATE_ADDRESSES, DEFAULT_MIN_VOTING_POWER } from "../src/constants";
import type { DelegateCache } from "../src/types/delegates";

const ADDR_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ADDR_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ADDR_C = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const ARB_TOKEN = "0x912CE59144191C1204E64559FE8253a0e49E6548";

const TOTAL_SUPPLY = BigNumber.from("10000000000000000000000000000");

function makeDelegateLog(
  delegate: string,
  previousBalance: string,
  newBalance: string,
  blockNumber: number,
  txHash?: string
): ethers.providers.Log {
  const topic0 = ethers.utils.id("DelegateVotesChanged(address,uint256,uint256)");
  const indexedDelegate = ethers.utils.hexZeroPad(delegate, 32);
  return {
    blockNumber,
    blockHash: "0x" + "a".repeat(64),
    transactionIndex: 0,
    removed: false,
    address: ARB_TOKEN,
    data: ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256"],
      [previousBalance, newBalance]
    ),
    topics: [topic0, indexedDelegate],
    transactionHash: txHash || "0x" + blockNumber.toString(16).padStart(64, "0"),
    logIndex: 0,
  };
}

function createMockProvider(
  currentBlock: number,
  logsByRange: Map<string, ethers.providers.Log[]> = new Map()
): ethers.providers.Provider {
  const provider = {
    getBlockNumber: vi.fn().mockResolvedValue(currentBlock),
    getLogs: vi.fn().mockImplementation((filter: { fromBlock: number; toBlock: number }) => {
      for (const [key, logs] of logsByRange.entries()) {
        const [from, to] = key.split("-").map(Number);
        if (filter.fromBlock >= from && filter.toBlock <= to) {
          return Promise.resolve(
            logs.filter((l) => l.blockNumber >= filter.fromBlock && l.blockNumber <= filter.toBlock)
          );
        }
      }
      return Promise.resolve([]);
    }),
    // Mock for totalSupply contract call
    call: vi
      .fn()
      .mockResolvedValue(ethers.utils.defaultAbiCoder.encode(["uint256"], [TOTAL_SUPPLY])),
    // Required for ethers.Contract
    _isProvider: true,
  } as unknown as ethers.providers.Provider;

  return provider;
}

function makeExistingCache(
  delegates: Array<{ address: string; votingPower: string; lastChangeBlock: number }>,
  snapshotBlock: number
): DelegateCache {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    snapshotBlock,
    startBlock: 70398215,
    chainId: 42161,
    totalVotingPower: "0",
    totalSupply: "0",
    delegates: delegates.map((d) => ({
      address: d.address.toLowerCase() as `0x${string}`,
      votingPower: d.votingPower,
      lastChangeBlock: d.lastChangeBlock,
    })),
    stats: { totalDelegates: delegates.length },
  };
}

describe("Delegate Indexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildDelegateCache", () => {
    it("should build a fresh cache from events", async () => {
      // #given - two delegates with events
      const logs = [
        makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 100),
        makeDelegateLog(ADDR_B, "0", "500000000000000000000", 200),
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "100000000000000000000", // 100 ARB
      });

      // #then
      expect(cache.version).toBe(2);
      expect(cache.snapshotBlock).toBe(500);
      expect(cache.chainId).toBe(42161);
      expect(cache.delegates).toHaveLength(2);
      expect(cache.delegates[0].address).toBe(ADDR_A.toLowerCase());
      expect(cache.delegates[0].votingPower).toBe("1000000000000000000000");
      expect(cache.delegates[1].address).toBe(ADDR_B.toLowerCase());
      expect(cache.stats.totalDelegates).toBe(2);
    });

    it("should deduplicate events keeping the latest per delegate", async () => {
      // #given - same delegate with two events, later one overwrites
      const logs = [
        makeDelegateLog(ADDR_A, "0", "100000000000000000000", 100),
        makeDelegateLog(ADDR_A, "100000000000000000000", "500000000000000000000", 200),
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then - only latest balance
      expect(cache.delegates).toHaveLength(1);
      expect(cache.delegates[0].votingPower).toBe("500000000000000000000");
      expect(cache.delegates[0].lastChangeBlock).toBe(200);
    });

    it("should remove delegates with zero balance", async () => {
      // #given - delegate gains then loses all power
      const logs = [
        makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 100),
        makeDelegateLog(ADDR_A, "1000000000000000000000", "0", 200),
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then
      expect(cache.delegates).toHaveLength(0);
    });

    it("should filter out excluded system addresses", async () => {
      // #given - event from excluded address
      const excludedAddr = EXCLUDED_DELEGATE_ADDRESSES[0];
      const logs = [
        makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 100),
        makeDelegateLog(excludedAddr, "0", "999000000000000000000000", 100),
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then
      expect(cache.delegates).toHaveLength(1);
      expect(cache.delegates[0].address).toBe(ADDR_A.toLowerCase());
    });

    it("should filter delegates below minimum voting power", async () => {
      // #given - delegate with 5 ARB, threshold 10 ARB
      const logs = [
        makeDelegateLog(ADDR_A, "0", "5000000000000000000", 100), // 5 ARB
        makeDelegateLog(ADDR_B, "0", "20000000000000000000", 200), // 20 ARB
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: DEFAULT_MIN_VOTING_POWER, // 10 ARB
      });

      // #then
      expect(cache.delegates).toHaveLength(1);
      expect(cache.delegates[0].address).toBe(ADDR_B.toLowerCase());
    });

    it("should sort delegates by voting power descending", async () => {
      // #given - delegates in arbitrary order
      const logs = [
        makeDelegateLog(ADDR_C, "0", "100000000000000000000", 100), // 100 ARB
        makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 200), // 1000 ARB
        makeDelegateLog(ADDR_B, "0", "500000000000000000000", 300), // 500 ARB
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then - sorted descending
      expect(cache.delegates[0].address).toBe(ADDR_A.toLowerCase());
      expect(cache.delegates[1].address).toBe(ADDR_B.toLowerCase());
      expect(cache.delegates[2].address).toBe(ADDR_C.toLowerCase());
    });

    it("should return existing cache when already up to date", async () => {
      // #given - existing cache at block 500, current block is 500
      const existing = makeExistingCache(
        [{ address: ADDR_A, votingPower: "1000", lastChangeBlock: 100 }],
        500
      );
      const provider = createMockProvider(500);

      // #when
      const cache = await buildDelegateCache(provider, { existingCache: existing });

      // #then - returns existing cache unchanged
      expect(cache).toBe(existing);
    });

    it("should return empty cache when no existing and up to date", async () => {
      // #given - startBlock > currentBlock, no existing cache
      const provider = createMockProvider(100);

      // #when
      const cache = await buildDelegateCache(provider, { startBlock: 200 });

      // #then
      expect(cache.delegates).toHaveLength(0);
      expect(cache.snapshotBlock).toBe(100);
    });

    it("should use existingCache.snapshotBlock + 1 for incremental builds", async () => {
      // #given - existing cache at block 400
      const existing = makeExistingCache(
        [{ address: ADDR_A, votingPower: "1000000000000000000000", lastChangeBlock: 100 }],
        400
      );
      const newLog = makeDelegateLog(ADDR_B, "0", "500000000000000000000", 450);
      const logMap = new Map([["401-1000401", [newLog]]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        existingCache: existing,
        minVotingPower: "0",
      });

      // #then - has both old and new delegates
      expect(cache.delegates).toHaveLength(2);
      expect(provider.getLogs).toHaveBeenCalled();
      const callArgs = (provider.getLogs as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.fromBlock).toBe(401);
    });

    it("should not seed from existing cache when startBlock is overridden", async () => {
      // #given - existing cache, but custom startBlock
      const existing = makeExistingCache(
        [{ address: ADDR_A, votingPower: "1000000000000000000000", lastChangeBlock: 100 }],
        400
      );
      const provider = createMockProvider(500);

      // #when
      const cache = await buildDelegateCache(provider, {
        existingCache: existing,
        startBlock: 450,
        minVotingPower: "0",
      });

      // #then - existing delegate NOT included (fresh from startBlock)
      expect(cache.delegates).toHaveLength(0);
    });

    it("should use DELEGATE_START_BLOCK when force is true", async () => {
      // #given - force with existing cache, currentBlock must exceed DELEGATE_START_BLOCK
      const existing = makeExistingCache(
        [{ address: ADDR_A, votingPower: "1000", lastChangeBlock: 100 }],
        400
      );
      const provider = createMockProvider(71_000_000);

      // #when
      const cache = await buildDelegateCache(provider, {
        existingCache: existing,
        force: true,
        minVotingPower: "0",
      });

      // #then - ignores existing, starts fresh from genesis (no events = no delegates)
      expect(cache.delegates).toHaveLength(0);
      const callArgs = (provider.getLogs as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.fromBlock).toBe(70398215); // DELEGATE_START_BLOCK
    });

    it("should call onProgress callback", async () => {
      // #given
      const logs = [makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 100)];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);
      const onProgress = vi.fn();

      // #when
      await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
        onProgress,
      });

      // #then - progress called with 100 at end
      expect(onProgress).toHaveBeenCalledWith(100, 500);
    });

    it("should compute totalVotingPower as sum of all delegates", async () => {
      // #given
      const logs = [
        makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 100),
        makeDelegateLog(ADDR_B, "0", "500000000000000000000", 200),
      ];
      const logMap = new Map([["0-1000000", logs]]);
      const provider = createMockProvider(500, logMap);

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then
      const expected = BigNumber.from("1000000000000000000000")
        .add("500000000000000000000")
        .toString();
      expect(cache.totalVotingPower).toBe(expected);
    });
  });

  describe("adaptive chunking", () => {
    it("should halve chunk size on log limit error and retry", async () => {
      // #given - provider fails first call with log limit error, succeeds after
      let callCount = 0;
      const logs = [makeDelegateLog(ADDR_A, "0", "1000000000000000000000", 50)];

      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(100),
        getLogs: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("logs matched by query exceeds limit of 10000"));
          }
          return Promise.resolve(logs);
        }),
        call: vi
          .fn()
          .mockResolvedValue(ethers.utils.defaultAbiCoder.encode(["uint256"], [TOTAL_SUPPLY])),
        _isProvider: true,
      } as unknown as ethers.providers.Provider;

      // #when
      const cache = await buildDelegateCache(provider, {
        startBlock: 0,
        minVotingPower: "0",
      });

      // #then - retry succeeded
      expect(cache.delegates).toHaveLength(1);
      expect(callCount).toBeGreaterThan(1);
    });

    it("should propagate non-log-limit errors", async () => {
      // #given - provider fails with a non-log-limit error
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(100),
        getLogs: vi.fn().mockRejectedValue(new Error("connection refused")),
        call: vi.fn(),
        _isProvider: true,
      } as unknown as ethers.providers.Provider;

      // #when / #then
      await expect(
        buildDelegateCache(provider, { startBlock: 0, minVotingPower: "0" })
      ).rejects.toThrow("connection refused");
    });
  });
});
