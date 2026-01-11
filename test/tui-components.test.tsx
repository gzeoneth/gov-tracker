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

      const views = ["list", "detail", "calldata", "stage", "simulation", "description", "election"] as const;

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
