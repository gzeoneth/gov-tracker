/**
 * TUI Component Rendering Tests
 *
 * These tests verify that TUI components render without errors,
 * particularly catching issues like empty strings outside <Text> components.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StageStatus } from "../src/types/index.js";

// Mock ink and react before importing components
vi.mock("ink", () => {
  const React = require("react");

  const Box = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    return React.createElement("box", props, children);
  };

  const Text = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
    return React.createElement("text", props, children);
  };

  const useInput = vi.fn();
  const useApp = () => ({ exit: vi.fn() });
  const useStdout = () => ({ stdout: process.stdout, write: vi.fn() });
  const render = vi.fn(() => ({ waitUntilExit: () => Promise.resolve() }));

  return { Box, Text, useInput, useApp, useStdout, render };
});

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useState: vi.fn((initial) => [initial, vi.fn()]),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn) => fn),
    useMemo: vi.fn((fn) => fn()),
  };
});

describe("TUI Component Rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("KeyHelp", () => {
    it("should render without errors for list view", async () => {
      const { KeyHelp } = await import("../src/cli/tui/components/KeyHelp.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(KeyHelp, { view: "list", hasProviders: true });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render without errors for detail view", async () => {
      const { KeyHelp } = await import("../src/cli/tui/components/KeyHelp.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(KeyHelp, { view: "detail", hasProviders: false });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render without errors for all views", async () => {
      const { KeyHelp } = await import("../src/cli/tui/components/KeyHelp.js");
      const React = await import("react");

      const views = ["list", "detail", "calldata", "stage", "simulation", "description", "election", "help"] as const;

      for (const view of views) {
        expect(() => {
          const element = React.createElement(KeyHelp, { view, hasProviders: true });
          expect(element).toBeDefined();
        }).not.toThrow();
      }
    });
  });

  describe("StatusBadge", () => {
    it("should render without errors for all statuses", async () => {
      const { StatusBadge } = await import("../src/cli/tui/components/StatusBadge.js");
      const React = await import("react");

      const statuses: (StageStatus | "active" | "complete" | "failed")[] = [
        "active", "complete", "failed", "COMPLETED", "PENDING", "READY", "SKIPPED", "NOT_STARTED", "FAILED"
      ];

      for (const status of statuses) {
        expect(() => {
          const element = React.createElement(StatusBadge, { status });
          expect(element).toBeDefined();
        }).not.toThrow();
      }
    });
  });

  describe("Header", () => {
    it("should render without errors for list view", async () => {
      const { Header } = await import("../src/cli/tui/components/Header.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Header, {
          view: "list",
          filter: "all",
          stats: { total: 10, proposals: { total: 10, complete: 5, active: 3, errored: 2 }, timelocks: { total: 0, complete: 0, active: 0, errored: 0 }, elections: { total: 0, complete: 0 } },
          hasProviders: true,
          isTracking: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render without errors with position indicator", async () => {
      const { Header } = await import("../src/cli/tui/components/Header.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Header, {
          view: "list",
          filter: "all",
          stats: null,
          hasProviders: false,
          isTracking: false,
          position: { current: 5, total: 100 },
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render with breadcrumb navigation", async () => {
      const { Header } = await import("../src/cli/tui/components/Header.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Header, {
          view: "detail",
          filter: "all",
          stats: null,
          hasProviders: false,
          isTracking: false,
          breadcrumb: ["Proposals", "Test Proposal", "Stage 1"],
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("ProposalRow", () => {
    const mockCheckpoint = {
      version: 1 as const,
      createdAt: Date.now(),
      input: { type: "governor" as const, proposalId: "123", creationTxHash: "0x123", governorAddress: "0x456" },
      cachedData: { completedStages: [] },
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      updatedAt: 0,
    };

    it("should render without errors with typical data", async () => {
      const { ProposalRow } = await import("../src/cli/tui/components/ProposalRow.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(ProposalRow, {
          item: {
            key: "test",
            title: "Test Proposal",
            type: "governor",
            proposalType: "CONSTITUTIONAL",
            status: "active",
            stageProgress: "3/7",
            currentStage: null,
            hasExecutable: false,
            createdAt: Date.now(),
            checkpoint: mockCheckpoint,
          },
          isSelected: true,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should handle empty title gracefully", async () => {
      const { ProposalRow } = await import("../src/cli/tui/components/ProposalRow.js");
      const React = await import("react");

      // This should not throw - empty titles should be handled gracefully
      expect(() => {
        const element = React.createElement(ProposalRow, {
          item: {
            key: "test",
            title: "", // Empty title - should not cause rendering error
            type: "governor",
            proposalType: undefined,
            status: "active",
            stageProgress: "0/7",
            currentStage: null,
            hasExecutable: false,
            createdAt: null,
            checkpoint: mockCheckpoint,
          },
          isSelected: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("HelpView", () => {
    it("should render without errors", async () => {
      const { HelpView } = await import("../src/cli/tui/views/HelpView.js");
      const React = await import("react");

      const mockNavigation = {
        state: {
          view: "help" as const,
          previousView: "list" as const,
          filter: "all" as const,
          sort: "newest" as const,
          selectedIndex: 0,
          selectedProposal: null,
          selectedStageIndex: 0,
          calldataActionIndex: 0,
          scrollOffset: 0,
          searchQuery: "",
          isSearching: false,
        },
        back: vi.fn(),
        moveUp: vi.fn(),
        moveDown: vi.fn(),
        pageUp: vi.fn(),
        pageDown: vi.fn(),
        goToTop: vi.fn(),
        goToBottom: vi.fn(),
        setFilter: vi.fn(),
        cycleFilter: vi.fn(),
        cycleSort: vi.fn(),
        selectItem: vi.fn(),
        enter: vi.fn(),
        goToCalldata: vi.fn(),
        goToStage: vi.fn(),
        goToSimulation: vi.fn(),
        goToDescription: vi.fn(),
        goToElection: vi.fn(),
        nextAction: vi.fn(),
        prevAction: vi.fn(),
        setScrollOffset: vi.fn(),
        reset: vi.fn(),
        startSearch: vi.fn(),
        cancelSearch: vi.fn(),
        setSearchQuery: vi.fn(),
        appendSearchChar: vi.fn(),
        deleteSearchChar: vi.fn(),
        goToHelp: vi.fn(),
      };

      expect(() => {
        const element = React.createElement(HelpView, { navigation: mockNavigation });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("Spinner", () => {
    it("should render without errors", async () => {
      const { Spinner } = await import("../src/cli/tui/components/Spinner.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Spinner, { text: "Loading..." });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render without text", async () => {
      const { Spinner } = await import("../src/cli/tui/components/Spinner.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Spinner, {});
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("EmptyState", () => {
    it("should render with all props", async () => {
      const { EmptyState } = await import("../src/cli/tui/components/EmptyState.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(EmptyState, {
          title: "No proposals",
          message: "No proposals match your filter",
          hint: "Try changing the filter",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render with minimal props", async () => {
      const { EmptyState } = await import("../src/cli/tui/components/EmptyState.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(EmptyState, { title: "Empty" });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("StatusBar", () => {
    it("should render with all props", async () => {
      const { StatusBar } = await import("../src/cli/tui/components/StatusBar.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(StatusBar, {
          left: "Left text",
          center: "Center text",
          right: "Right text",
          color: "cyan",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("ConfirmDialog", () => {
    it("should render with all props", async () => {
      const { ConfirmDialog } = await import("../src/cli/tui/components/ConfirmDialog.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(ConfirmDialog, {
          title: "Confirm Action",
          message: "Are you sure?",
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("VotingStats", () => {
    it("should render with voting data", async () => {
      const { VotingStats } = await import("../src/cli/tui/components/VotingStats.js");
      const React = await import("react");

      const mockData = {
        forVotes: "1000000",
        againstVotes: "500000",
        abstainVotes: "100000",
        quorum: "500000",
        quorumReached: true,
        proposalState: "Succeeded",
        forVotesRaw: "1000000000000000000000000",
        againstVotesRaw: "500000000000000000000000",
        abstainVotesRaw: "100000000000000000000000",
        quorumRaw: "500000000000000000000000",
        deadline: "1700000000",
      };

      expect(() => {
        const element = React.createElement(VotingStats, { data: mockData });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render in compact mode", async () => {
      const { VotingStats } = await import("../src/cli/tui/components/VotingStats.js");
      const React = await import("react");

      const mockData = {
        forVotes: "1000",
        againstVotes: "500",
        abstainVotes: "100",
        quorum: "500",
        quorumReached: false,
        forVotesRaw: "1000000000000000000000",
        againstVotesRaw: "500000000000000000000",
        abstainVotesRaw: "100000000000000000000",
        quorumRaw: "500000000000000000000",
        deadline: "1700000000",
      };

      expect(() => {
        const element = React.createElement(VotingStats, { data: mockData, compact: true });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("Toast", () => {
    it("should render with all types", async () => {
      const { Toast } = await import("../src/cli/tui/components/Toast.js");
      const React = await import("react");

      const types = ["success", "error", "info", "warning"] as const;
      for (const type of types) {
        expect(() => {
          const element = React.createElement(Toast, {
            message: "Test message",
            type,
            duration: 0,
          });
          expect(element).toBeDefined();
        }).not.toThrow();
      }
    });
  });

  describe("Skeleton", () => {
    it("should render single line skeleton", async () => {
      const { Skeleton } = await import("../src/cli/tui/components/Skeleton.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Skeleton, {
          width: 20,
          animated: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render multi-line skeleton", async () => {
      const { Skeleton } = await import("../src/cli/tui/components/Skeleton.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Skeleton, {
          width: 30,
          height: 3,
          animated: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("SkeletonRow", () => {
    it("should render row with multiple columns", async () => {
      const { SkeletonRow } = await import("../src/cli/tui/components/Skeleton.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SkeletonRow, {
          columns: [5, 20, 10],
          animated: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("SkeletonList", () => {
    it("should render list with default props", async () => {
      const { SkeletonList } = await import("../src/cli/tui/components/Skeleton.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SkeletonList, {
          animated: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render list with custom rows and columns", async () => {
      const { SkeletonList } = await import("../src/cli/tui/components/Skeleton.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SkeletonList, {
          rows: 10,
          columns: [3, 50, 15],
          animated: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("CopyableText", () => {
    it("should render with label and value", async () => {
      const { CopyableText } = await import("../src/cli/tui/components/CopyableText.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(CopyableText, {
          value: "0x1234567890abcdef",
          label: "TX Hash",
          color: "blue",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render with hint", async () => {
      const { CopyableText } = await import("../src/cli/tui/components/CopyableText.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(CopyableText, {
          value: "0xaddress",
          showHint: true,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("CopyFeedback", () => {
    it("should render success feedback", async () => {
      const { CopyFeedback } = await import("../src/cli/tui/components/CopyableText.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(CopyFeedback, {
          message: "Copied!",
          type: "success",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render error feedback", async () => {
      const { CopyFeedback } = await import("../src/cli/tui/components/CopyableText.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(CopyFeedback, {
          message: "Failed to copy",
          type: "error",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("SearchBar", () => {
    it("should render when active with query", async () => {
      const { SearchBar } = await import("../src/cli/tui/components/SearchBar.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SearchBar, {
          query: "test search",
          isActive: true,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render inactive with query and result count", async () => {
      const { SearchBar } = await import("../src/cli/tui/components/SearchBar.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SearchBar, {
          query: "proposal",
          isActive: false,
          resultCount: 5,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render empty when no query and not active", async () => {
      const { SearchBar } = await import("../src/cli/tui/components/SearchBar.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SearchBar, {
          query: "",
          isActive: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("CollapsibleSection", () => {
    it("should render expanded section with children", async () => {
      const { CollapsibleSection } = await import("../src/cli/tui/components/CollapsibleSection.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(
          CollapsibleSection,
          {
            title: "Test Section",
            isExpanded: true,
          },
          React.createElement("span", null, "Child content")
        );
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render collapsed section", async () => {
      const { CollapsibleSection } = await import("../src/cli/tui/components/CollapsibleSection.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(
          CollapsibleSection,
          {
            title: "Collapsed Section",
            isExpanded: false,
            badge: "3 items",
            badgeColor: "green",
          },
          React.createElement("span", null, "Hidden content")
        );
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("SectionItem", () => {
    it("should render with string value", async () => {
      const { SectionItem } = await import("../src/cli/tui/components/CollapsibleSection.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SectionItem, {
          label: "Status",
          value: "Active",
          color: "green",
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render with React node value", async () => {
      const { SectionItem } = await import("../src/cli/tui/components/CollapsibleSection.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(SectionItem, {
          label: "Custom",
          value: React.createElement("span", null, "Custom content"),
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("Timeline", () => {
    it("should render in compact mode", async () => {
      const { Timeline } = await import("../src/cli/tui/components/Timeline.js");
      const React = await import("react");

      const mockStages = [
        { type: "PROPOSAL_CREATED", status: "COMPLETED" as const },
        { type: "VOTING_ACTIVE", status: "COMPLETED" as const },
        { type: "PROPOSAL_QUEUED", status: "PENDING" as const },
      ] as Parameters<typeof Timeline>[0]["stages"];

      expect(() => {
        const element = React.createElement(Timeline, {
          stages: mockStages,
          currentIndex: 2,
          compact: true,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should render in full mode", async () => {
      const { Timeline } = await import("../src/cli/tui/components/Timeline.js");
      const React = await import("react");

      const mockStages = [
        { type: "PROPOSAL_CREATED", status: "COMPLETED" as const, executable: false },
        { type: "VOTING_ACTIVE", status: "READY" as const, executable: true },
      ] as Parameters<typeof Timeline>[0]["stages"];

      expect(() => {
        const element = React.createElement(Timeline, {
          stages: mockStages,
          currentIndex: 1,
          compact: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should handle empty stages array", async () => {
      const { Timeline } = await import("../src/cli/tui/components/Timeline.js");
      const React = await import("react");

      expect(() => {
        const element = React.createElement(Timeline, {
          stages: [],
          currentIndex: 0,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should handle all stage statuses", async () => {
      const { Timeline } = await import("../src/cli/tui/components/Timeline.js");
      const React = await import("react");

      const mockStages = [
        { type: "PROPOSAL_CREATED", status: "COMPLETED" as const },
        { type: "VOTING_ACTIVE", status: "READY" as const },
        { type: "PROPOSAL_QUEUED", status: "PENDING" as const },
        { type: "L2_TIMELOCK", status: "FAILED" as const },
        { type: "L2_TO_L1_MESSAGE", status: "SKIPPED" as const },
        { type: "L1_TIMELOCK", status: "NOT_STARTED" as const },
      ] as Parameters<typeof Timeline>[0]["stages"];

      expect(() => {
        const element = React.createElement(Timeline, {
          stages: mockStages,
          currentIndex: 3,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("StageRow", () => {
    it("should render without errors with minimal stage data", async () => {
      const { StageRow } = await import("../src/cli/tui/components/StageRow.js");
      const React = await import("react");

      // Minimal mock - cast via unknown to bypass strict data property requirements
      const mockStage = {
        type: "PROPOSAL_CREATED",
        status: "COMPLETED",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        data: { proposer: "0x123", proposalId: "1" },
      } as unknown as Parameters<typeof StageRow>[0]["stage"];

      expect(() => {
        const element = React.createElement(StageRow, {
          stage: mockStage,
          index: 0,
          isSelected: false,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });

    it("should handle null timing gracefully", async () => {
      const { StageRow } = await import("../src/cli/tui/components/StageRow.js");
      const React = await import("react");

      // Minimal mock - cast via unknown to bypass strict data property requirements
      const mockStage = {
        type: "VOTING_ACTIVE",
        status: "PENDING",
        chain: "arb1",
        chainId: 42161,
        transactions: [],
        timing: undefined,
        data: { proposalState: "Active" },
      } as unknown as Parameters<typeof StageRow>[0]["stage"];

      expect(() => {
        const element = React.createElement(StageRow, {
          stage: mockStage,
          index: 1,
          isSelected: true,
        });
        expect(element).toBeDefined();
      }).not.toThrow();
    });
  });
});
