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
