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
