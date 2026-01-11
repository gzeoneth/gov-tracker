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
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: () => {},
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

describe("useTracker discovery via CLI subprocess", () => {
  beforeEach(() => {
    stateStore = undefined;
    vi.resetModules();
  });

  it("should return false when no RPC is configured", async () => {
    // #given - No providers and no config RPC
    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    vi.doMock("../src/index.js", () => ({
      createTracker: vi.fn(),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    const mockRun = vi.fn();
    vi.doMock("../src/cli/tui/hooks/useCliProcess.js", () => ({
      useCliProcess: () => ({
        isRunning: false,
        progress: null,
        error: null,
        run: mockRun,
        cancel: vi.fn(),
      }),
    }));

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: undefined, cachePath: "/tmp/test" });
    const result = await tracker.discover();

    // #then - Should return false since no RPC configured and not call CLI
    expect(result).toBe(false);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("should return true and call onDiscoveryComplete on success", async () => {
    // #given - Config has RPC URLs
    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "http://l1.example.com", l2Url: "http://l2.example.com", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    vi.doMock("../src/index.js", () => ({
      createTracker: vi.fn(),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    const mockRun = vi.fn().mockResolvedValue({ success: true });
    vi.doMock("../src/cli/tui/hooks/useCliProcess.js", () => ({
      useCliProcess: () => ({
        isRunning: false,
        progress: null,
        error: null,
        run: mockRun,
        cancel: vi.fn(),
      }),
    }));

    const onDiscoveryComplete = vi.fn();

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({
      providers: undefined,
      cachePath: "/tmp/test",
      onDiscoveryComplete,
    });
    const result = await tracker.discover();

    // #then
    expect(result).toBe(true);
    expect(onDiscoveryComplete).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(expect.arrayContaining(["run", "--cache", "/tmp/test"]));
  });

  it("should include RPC URLs from config in CLI args", async () => {
    // #given
    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: {
          l1Url: "http://l1.example.com",
          l2Url: "http://l2.example.com",
          novaUrl: "http://nova.example.com",
        },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: 12345, chunkSize: 50000, concurrency: 4 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    vi.doMock("../src/index.js", () => ({
      createTracker: vi.fn(),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    const mockRun = vi.fn().mockResolvedValue({ success: true });
    vi.doMock("../src/cli/tui/hooks/useCliProcess.js", () => ({
      useCliProcess: () => ({
        isRunning: false,
        progress: null,
        error: null,
        run: mockRun,
        cancel: vi.fn(),
      }),
    }));

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: undefined, cachePath: "/tmp/test" });
    await tracker.discover();

    // #then - Verify CLI args include all config values
    expect(mockRun).toHaveBeenCalledWith(
      expect.arrayContaining([
        "--l1-rpc",
        "http://l1.example.com",
        "--l2-rpc",
        "http://l2.example.com",
        "--nova-rpc",
        "http://nova.example.com",
        "--max-age-days",
        "60",
        "--start-block",
        "12345",
        "--l2-chunk-size",
        "50000",
        "--concurrency",
        "4",
      ])
    );
  });

  it("should return false on CLI failure", async () => {
    // #given
    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "http://l1.example.com", l2Url: "", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    vi.doMock("../src/index.js", () => ({
      createTracker: vi.fn(),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    const mockRun = vi.fn().mockResolvedValue({ success: false, error: "RPC timeout" });
    vi.doMock("../src/cli/tui/hooks/useCliProcess.js", () => ({
      useCliProcess: () => ({
        isRunning: false,
        progress: null,
        error: null,
        run: mockRun,
        cancel: vi.fn(),
      }),
    }));

    const onDiscoveryComplete = vi.fn();

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({
      providers: undefined,
      cachePath: "/tmp/test",
      onDiscoveryComplete,
    });
    const result = await tracker.discover();

    // #then
    expect(result).toBe(false);
    expect(onDiscoveryComplete).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it("should report canTrack true when config has RPC URLs", async () => {
    // #given
    vi.doMock("../src/cli/tui/config.js", () => ({
      loadConfig: () => ({
        rpc: { l1Url: "", l2Url: "http://l2.example.com", novaUrl: "" },
        cache: { path: "" },
        display: { theme: "dark", showProgressBar: true, compactMode: false },
        discovery: { defaultDays: 60, startBlock: null, chunkSize: 10_000_000, concurrency: 1 },
        debug: { logFile: "", namespaces: "gov-tracker:*" },
      }),
    }));

    vi.doMock("../src/index.js", () => ({
      createTracker: vi.fn(),
      CHUNK_SIZES: { L2: 50000, L1: 10000, NOVA: 50000, DELAY_MS: 0 },
    }));

    vi.doMock("../src/cli/tui/hooks/useCliProcess.js", () => ({
      useCliProcess: () => ({
        isRunning: false,
        progress: null,
        error: null,
        run: vi.fn(),
        cancel: vi.fn(),
      }),
    }));

    // #when
    const { useTracker } = await import("../src/cli/tui/hooks/useTracker.js");
    const tracker = useTracker({ providers: undefined, cachePath: "/tmp/test" });

    // #then
    expect(tracker.canTrack).toBe(true);
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
