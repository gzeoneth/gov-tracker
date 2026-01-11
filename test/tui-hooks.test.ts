/**
 * TUI hook behavior tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrackingCheckpoint, TrackerStats, TrackedStage } from "../src/types/index.js";

let stateStore: unknown;

vi.mock("react", () => {
  return {
    useState: (initial: unknown) => {
      if (stateStore === undefined) {
        stateStore = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const setState = (updater: unknown) => {
        if (typeof updater === "function") {
          stateStore = (updater as (prev: unknown) => unknown)(stateStore);
        } else {
          stateStore = updater;
        }
      };
      return [stateStore, setState];
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: unknown) => (fn as () => unknown)(),
  };
});

describe("useNavigation", () => {
  beforeEach(() => {
    stateStore = undefined;
  });

  it("keeps selection at zero when list is empty", async () => {
    const { useNavigation } = await import("../src/cli/tui/hooks/useNavigation.js");

    const nav = useNavigation();
    nav.moveDown(0);

    const next = useNavigation();
    expect(next.state.selectedIndex).toBe(0);
  });

  it("prevents page navigation from going negative", async () => {
    const { useNavigation } = await import("../src/cli/tui/hooks/useNavigation.js");

    const nav = useNavigation();
    nav.pageDown(0);

    const next = useNavigation();
    expect(next.state.selectedIndex).toBe(0);
  });

  it("clamps scroll offset for scrollable views", async () => {
    const { useNavigation } = await import("../src/cli/tui/hooks/useNavigation.js");

    const nav = useNavigation();
    nav.goToCalldata();
    nav.moveDown(0);

    const next = useNavigation();
    expect(next.state.scrollOffset).toBe(0);
  });

  it("applies search text on finish", async () => {
    const { useNavigation } = await import("../src/cli/tui/hooks/useNavigation.js");

    const nav = useNavigation();
    nav.startSearch();
    nav.appendSearchChar("a");
    nav.finishSearch();

    const next = useNavigation();
    expect(next.state.isSearching).toBe(false);
    expect(next.state.searchQuery).toBe("a");
  });

  it("clears search text on cancel", async () => {
    const { useNavigation } = await import("../src/cli/tui/hooks/useNavigation.js");

    const nav = useNavigation();
    nav.startSearch();
    nav.appendSearchChar("a");
    nav.clearSearch();

    const next = useNavigation();
    expect(next.state.isSearching).toBe(false);
    expect(next.state.searchQuery).toBe("");
  });
});

describe("useTracker discovery 60-day default", () => {
  const BLOCKS_PER_DAY_L2 = (24 * 60 * 60) / 0.25; // ~345,600 blocks/day on Arbitrum

  beforeEach(() => {
    stateStore = undefined;
    vi.resetModules();
  });

  it("should use 60-day default when no watermarks exist", async () => {
    // #given - Mock the tracker module
    const mockCurrentBlock = 200_000_000;
    const expectedFromBlock = Math.max(0, mockCurrentBlock - Math.floor(BLOCKS_PER_DAY_L2 * 60));

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue({}), // Empty = no cache
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(mockCurrentBlock) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then
    expect(capturedFromWatermarks).toBeDefined();
    expect(capturedFromWatermarks!.constitutionalGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.nonConstitutionalGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.electionNomineeGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.electionMemberGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.l2ConstitutionalTimelock).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.l2NonConstitutionalTimelock).toBe(expectedFromBlock);
  });

  it("should use cached watermarks when all exist", async () => {
    // #given - All watermarks are cached (complete cache)
    const cachedWatermarks = {
      constitutionalGovernor: 190_000_000,
      nonConstitutionalGovernor: 195_000_000,
      electionNomineeGovernor: 192_000_000,
      electionMemberGovernor: 193_000_000,
      l2ConstitutionalTimelock: 191_000_000,
      l2NonConstitutionalTimelock: 194_000_000,
    };

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue(cachedWatermarks),
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(200_000_000) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then - fromWatermarks should be undefined when all watermarks are cached
    expect(capturedFromWatermarks).toBeUndefined();
  });

  it("should fill missing watermarks with 60-day default for partial cache", async () => {
    // #given - Only some governors have watermarks (partial cache)
    const mockCurrentBlock = 200_000_000;
    const expectedFromBlock = Math.max(0, mockCurrentBlock - Math.floor(BLOCKS_PER_DAY_L2 * 60));

    // Partial cache: only constitutionalGovernor has a watermark
    const partialWatermarks = {
      constitutionalGovernor: 190_000_000,
    };

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue(partialWatermarks),
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(mockCurrentBlock) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then - Should preserve cached watermark and fill missing with 60-day default
    expect(capturedFromWatermarks).toBeDefined();
    // Cached watermark should be preserved
    expect(capturedFromWatermarks!.constitutionalGovernor).toBe(190_000_000);
    // Missing watermarks should use 60-day default, NOT undefined
    expect(capturedFromWatermarks!.nonConstitutionalGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.electionNomineeGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.electionMemberGovernor).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.l2ConstitutionalTimelock).toBe(expectedFromBlock);
    expect(capturedFromWatermarks!.l2NonConstitutionalTimelock).toBe(expectedFromBlock);
  });

  it("should clamp negative defaultDays to minimum of 1", async () => {
    // #given - Negative defaultDays should be clamped to 1
    const mockCurrentBlock = 200_000_000;
    const expectedFromBlock = Math.max(0, mockCurrentBlock - Math.floor(BLOCKS_PER_DAY_L2 * 1)); // Clamped to 1

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue({}),
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: -10, startBlock: null, chunkSize: 10_000_000, concurrency: 1 }, // Invalid: negative
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(mockCurrentBlock) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then - Should clamp to 1 day for negative values
    expect(capturedFromWatermarks).toBeDefined();
    expect(capturedFromWatermarks!.constitutionalGovernor).toBe(expectedFromBlock);
  });

  it("should clamp excessive defaultDays to maximum of 365", async () => {
    // #given - Excessive defaultDays should be clamped to 365
    const mockCurrentBlock = 200_000_000;
    const expectedFromBlock = Math.max(0, mockCurrentBlock - Math.floor(BLOCKS_PER_DAY_L2 * 365)); // Clamped to 365

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue({}),
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 9999, startBlock: null, chunkSize: 10_000_000, concurrency: 1 }, // Invalid: too high
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(mockCurrentBlock) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then - Should clamp to 365 days for excessive values
    expect(capturedFromWatermarks).toBeDefined();
    expect(capturedFromWatermarks!.constitutionalGovernor).toBe(expectedFromBlock);
  });

  it("should respect custom defaultDays from config", async () => {
    // #given
    const mockCurrentBlock = 200_000_000;
    const customDays = 30;
    const expectedFromBlock = Math.max(
      0,
      mockCurrentBlock - Math.floor(BLOCKS_PER_DAY_L2 * customDays)
    );

    let capturedFromWatermarks: Record<string, number> | undefined;

    vi.doMock("../src/index.js", () => ({
      createTracker: () => ({
        loadWatermarks: vi.fn().mockResolvedValue({}),
        discoverAll: vi.fn().mockImplementation((_targets, _toBlock, fromWatermarks) => {
          capturedFromWatermarks = fromWatermarks;
          return Promise.resolve({ proposals: [], timelockOps: [] });
        }),
        saveWatermarks: vi.fn().mockResolvedValue(undefined),
      }),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: {
          defaultDays: customDays,
          startBlock: null,
          chunkSize: 10_000_000,
          concurrency: 1,
        },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    const mockProviders = {
      l1Provider: { getBlockNumber: vi.fn().mockResolvedValue(19_000_000) },
      l2Provider: { getBlockNumber: vi.fn().mockResolvedValue(mockCurrentBlock) },
      novaProvider: { getBlockNumber: vi.fn().mockResolvedValue(50_000_000) },
    };

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: mockProviders as never, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then
    expect(capturedFromWatermarks).toBeDefined();
    expect(capturedFromWatermarks!.constitutionalGovernor).toBe(expectedFromBlock);
  });
});

describe("useProposals", () => {
  beforeEach(() => {
    stateStore = undefined;
  });

  it("filters proposals by search query", async () => {
    const { useProposals } = await import("../src/cli/tui/hooks/useProposals.js");

    const stats: TrackerStats = {
      total: 0,
      proposals: { total: 0, complete: 0, active: 0, errored: 0 },
      timelocks: { total: 0, complete: 0, active: 0, errored: 0 },
      elections: { total: 0, complete: 0 },
    };

    const makeStage = (description: string): TrackedStage =>
      ({
        type: "PROPOSAL_CREATED",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: { description },
      }) as unknown as TrackedStage;

    const makeCheckpoint = (description: string): TrackingCheckpoint => ({
      version: 1,
      createdAt: Date.now(),
      input: {
        type: "governor",
        governorAddress: "0xabc",
        proposalId: "1",
        creationTxHash: "0x123",
      },
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      cachedData: { completedStages: [makeStage(description)] },
      metadata: { errorCount: 0, lastTrackedAt: 0 },
    });

    const data = {
      checkpoints: new Map([
        ["alpha", makeCheckpoint("# Alpha Proposal")],
        ["beta", makeCheckpoint("# Beta Proposal")],
      ]),
      stats,
    };

    const result = useProposals(data, "all", "alpha");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Alpha Proposal");
  });
});
