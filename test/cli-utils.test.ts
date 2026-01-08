/**
 * Tests for CLI utility functions
 *
 * Tests formatting functions, option parsing, and provider creation.
 * No RPC calls needed except where explicitly noted.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  formatDryRun,
  formatTrackingResult,
  formatCacheStatus,
  formatMultiplePreparedTransactions,
  parseGasSettings,
  parseChunkingConfig,
  createProvidersFromOptions,
  createSigner,
  requirePrivateKeyForWrite,
  DEFAULT_L2_GAS_SETTINGS,
  isShuttingDown,
  addOptions,
} from "../src/cli/lib/cli";
import { Command, Option } from "commander";
import {
  PreparedTransaction,
  TrackingResult,
  TrackedStage,
  TrackingCheckpoint,
  StageStatus,
} from "../src/index";
import { ADDRESSES } from "../src/constants";
import { StageBuilder } from "../src/stages/stage-builder";

type MockStageType =
  | "PROPOSAL_CREATED"
  | "VOTING_ACTIVE"
  | "PROPOSAL_QUEUED"
  | "L2_TIMELOCK"
  | "L2_TO_L1_MESSAGE"
  | "L1_TIMELOCK"
  | "RETRYABLE_EXECUTED";

function createMockPrepared(overrides: Partial<PreparedTransaction> = {}): PreparedTransaction {
  return {
    to: "0x1234567890123456789012345678901234567890",
    data: "0xabcdef",
    value: "0",
    chain: "arb1",
    chainId: 42161,
    description: "Test transaction",
    ...overrides,
  };
}

function createMockStage(
  type: MockStageType,
  status: StageStatus,
  chain: "ethereum" | "arb1" | "nova" = "arb1",
  data: Record<string, unknown> = {}
): TrackedStage {
  const builder = new StageBuilder(type, chain, status);
  if (Object.keys(data).length > 0) {
    builder.data(data as never);
  }
  return builder.build();
}

function createMockTrackingResult(
  stages: TrackedStage[],
  overrides: Partial<TrackingResult> = {}
): TrackingResult {
  const input = overrides.input ?? {
    type: "governor" as const,
    governorAddress: "0x1234567890123456789012345678901234567890",
    proposalId: "123456789",
    creationTxHash: "0x" + "a".repeat(64),
  };
  return {
    input,
    stages,
    checkpoint: {
      version: 1,
      createdAt: Date.now(),
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      input,
      cachedData: { completedStages: stages },
      metadata: { errorCount: 0, lastTrackedAt: Date.now() },
    },
    isComplete: false,
    isElection: false,
    ...overrides,
  };
}

function createMockCheckpoint(
  type: "governor" | "timelock",
  isComplete: boolean,
  isFailed: boolean,
  isElection = false
): TrackingCheckpoint {
  const governorAddress = isElection
    ? ADDRESSES.ELECTION_NOMINEE_GOVERNOR
    : "0x1234567890123456789012345678901234567890";

  const stages: TrackedStage[] = isComplete
    ? [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "COMPLETED"),
        createMockStage("PROPOSAL_QUEUED", "COMPLETED"),
        createMockStage("L2_TIMELOCK", "COMPLETED"),
        createMockStage("L2_TO_L1_MESSAGE", "SKIPPED"),
        createMockStage("L1_TIMELOCK", "SKIPPED", "ethereum"),
        createMockStage("RETRYABLE_EXECUTED", "SKIPPED"),
      ]
    : [
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
      ];

  if (type === "governor") {
    return {
      version: 1,
      createdAt: Date.now(),
      lastProcessedStage: null,
      lastProcessedBlock: { l1: 0, l2: 0 },
      input: {
        type: "governor",
        governorAddress,
        proposalId: "123",
        creationTxHash: "0x" + "a".repeat(64),
      },
      cachedData: { completedStages: stages },
      metadata: { errorCount: isFailed ? 5 : 0, lastTrackedAt: Date.now() },
    };
  }

  return {
    version: 1,
    createdAt: Date.now(),
    lastProcessedStage: null,
    lastProcessedBlock: { l1: 0, l2: 0 },
    input: {
      type: "timelock",
      timelockAddress: "0xTL",
      operationId: "0xOP",
      scheduledTxHash: "0x" + "b".repeat(64),
    },
    cachedData: { completedStages: stages },
    metadata: { errorCount: isFailed ? 5 : 0, lastTrackedAt: Date.now() },
  };
}

describe("CLI Utilities", () => {
  describe("formatDryRun", () => {
    it("should format basic transaction", () => {
      const prepared = createMockPrepared({
        description: "Execute L2 timelock",
      });

      const output = formatDryRun(prepared);

      expect(output).toContain("[DRY RUN] Execute L2 timelock");
      expect(output).toContain("Chain: arb1");
      expect(output).toContain("To: 0x1234567890123456789012345678901234567890");
      expect(output).toContain("Data: 0xabcdef");
    });

    it("should include value when non-zero", () => {
      const prepared = createMockPrepared({
        value: "1000000000000000000",
        chain: "ethereum",
        chainId: 1,
        description: "Send ETH",
      });

      const output = formatDryRun(prepared);

      expect(output).toContain("Value: 1000000000000000000");
    });

    it("should not include value when zero", () => {
      const prepared = createMockPrepared({
        value: "0",
        description: "No value",
      });

      const output = formatDryRun(prepared);

      expect(output).not.toContain("Value:");
    });

    it("should include operationId when present", () => {
      const prepared = createMockPrepared({
        operationId: "0xoperationid123",
        description: "Timelock execute",
      });

      const output = formatDryRun(prepared);

      expect(output).toContain("OperationId: 0xoperationid123");
    });

    it("should show hash validation success", () => {
      const prepared = createMockPrepared({
        description: "Test",
        hashValidation: { isValid: true },
      });

      const output = formatDryRun(prepared);

      expect(output).toContain("Hash Valid: YES");
    });

    it("should show hash validation failure with error", () => {
      const prepared = createMockPrepared({
        description: "Test",
        hashValidation: { isValid: false, error: "Hash mismatch" },
      });

      const output = formatDryRun(prepared);

      expect(output).toContain("WARNING: Hash validation failed - Hash mismatch");
    });
  });

  describe("formatMultiplePreparedTransactions", () => {
    it("should return empty string for empty array", () => {
      const output = formatMultiplePreparedTransactions([]);
      expect(output).toBe("");
    });

    it("should delegate to formatDryRun for single transaction", () => {
      const prepared = createMockPrepared({ description: "Single tx" });

      const output = formatMultiplePreparedTransactions([prepared]);

      expect(output).toContain("[DRY RUN] Single tx");
      expect(output).not.toContain("[DRY RUN 1/");
    });

    it("should format multiple transactions with numbering", () => {
      const txs: PreparedTransaction[] = [
        createMockPrepared({ description: "First tx" }),
        createMockPrepared({ description: "Second tx", chain: "nova", chainId: 42170 }),
      ];

      const output = formatMultiplePreparedTransactions(txs);

      expect(output).toContain("[DRY RUN 1/2] First tx");
      expect(output).toContain("[DRY RUN 2/2] Second tx");
      expect(output).toContain("Chain: arb1");
      expect(output).toContain("Chain: nova");
    });

    it("should include hash validation for each transaction", () => {
      const txs: PreparedTransaction[] = [
        createMockPrepared({
          description: "Valid",
          hashValidation: { isValid: true },
        }),
        createMockPrepared({
          description: "Invalid",
          hashValidation: { isValid: false, error: "Err" },
        }),
      ];

      const output = formatMultiplePreparedTransactions(txs);

      expect(output).toContain("Hash Valid: YES");
      expect(output).toContain("WARNING: Hash validation failed - Err");
    });
  });

  describe("formatTrackingResult", () => {
    it("should format basic tracking result", () => {
      const result = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
      ]);

      const output = formatTrackingResult(result);

      expect(output).toContain("Complete: false");
      expect(output).toContain("Stages: 2");
      expect(output).toContain("Proposal Created: COMPLETED");
      expect(output).toContain("Voting Active: PENDING");
    });

    it("should include label when provided", () => {
      const result = createMockTrackingResult([createMockStage("PROPOSAL_CREATED", "COMPLETED")]);

      const output = formatTrackingResult(result, "Test Label");

      expect(output).toContain("--- Test Label ---");
    });

    it("should include operationId when present in L2_TIMELOCK stage", () => {
      const result = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "COMPLETED", "arb1", { operationId: "0xoperation123" }),
      ]);

      const output = formatTrackingResult(result);

      expect(output).toContain("OperationId: 0xoperation123");
    });

    it("should include Security Council info when present", () => {
      const result = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "COMPLETED", "arb1", {
          operationId: "0xop",
          isSecurityCouncilOperation: true,
          securityCouncilNonce: "42",
        }),
      ]);

      const output = formatTrackingResult(result);

      expect(output).toContain("Security Council Nonce: 42");
    });

    it("should mark election proposals", () => {
      const result = createMockTrackingResult([createMockStage("PROPOSAL_CREATED", "COMPLETED")], {
        isElection: true,
      });

      const output = formatTrackingResult(result);

      expect(output).toContain("Type: createElection");
    });

    it("should include transaction URLs", () => {
      const builder = new StageBuilder("L2_TIMELOCK", "arb1", "COMPLETED");
      builder.tx("0xtxhash123", 12345, "arb1", 42161, { description: "execute" });
      const stage = builder.build();

      const result = createMockTrackingResult([stage]);

      const output = formatTrackingResult(result);

      expect(output).toContain("execute: 0xtxhash123");
      expect(output).toContain("arbiscan.io");
    });

    it("should include ETA when available", () => {
      const eta = Math.floor(Date.now() / 1000) + 3600;
      const builder = new StageBuilder("L2_TIMELOCK", "arb1", "PENDING");
      builder.timing({ eta });
      const stage = builder.build();

      const result = createMockTrackingResult([stage]);

      const output = formatTrackingResult(result);

      expect(output).toContain("ETA:");
    });

    it("should format retryable ticket info", () => {
      const result = createMockTrackingResult([
        createMockStage("RETRYABLE_EXECUTED", "PENDING", "arb1", {
          ticketCount: 3,
          creationDetails: [
            { targetChain: "arb1" },
            { targetChain: "arb1" },
            { targetChain: "nova" },
          ],
          redeemedCount: 1,
          pendingCount: 2,
        }),
      ]);

      const output = formatTrackingResult(result);

      expect(output).toContain("[3 tickets: 2 Arb1, 1 Nova - 1 redeemed, 2 pending]");
    });

    it("should show all redeemed for completed retryable stage", () => {
      const result = createMockTrackingResult([
        createMockStage("RETRYABLE_EXECUTED", "COMPLETED", "arb1", {
          ticketCount: 2,
          creationDetails: [{ targetChain: "arb1" }, { targetChain: "arb1" }],
        }),
      ]);

      const output = formatTrackingResult(result);

      expect(output).toContain("[2 tickets: 2 Arb1 - all redeemed]");
    });
  });

  describe("formatCacheStatus", () => {
    it("should format empty cache", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Total cached: 0");
      expect(output).toContain("Proposals: 0");
      expect(output).toContain("Timelock Ops: 0");
    });

    it("should count complete proposals", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("p1", createMockCheckpoint("governor", true, false));
      checkpoints.set("p2", createMockCheckpoint("governor", true, false));

      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Proposals: 2");
      expect(output).toContain("Complete: 2");
      expect(output).toContain("Active: 0");
    });

    it("should count active proposals", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("p1", createMockCheckpoint("governor", false, false));

      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Active: 1");
    });

    it("should count failed proposals", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("p1", createMockCheckpoint("governor", false, true));

      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Failed: 1");
    });

    it("should count timelock operations separately", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("t1", createMockCheckpoint("timelock", true, false));
      checkpoints.set("t2", createMockCheckpoint("timelock", false, false));

      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Timelock Ops: 2");
      expect(output).toContain("Complete: 1");
      expect(output).toContain("Active: 1");
    });

    it("should count elections separately", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("e1", createMockCheckpoint("governor", true, false, true));
      checkpoints.set("e2", createMockCheckpoint("governor", false, false, true));

      const output = formatCacheStatus(checkpoints);

      expect(output).toContain("Elections: 2 (1 complete)");
    });

    it("should not show elections section when none exist", () => {
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("p1", createMockCheckpoint("governor", true, false, false));

      const output = formatCacheStatus(checkpoints);

      expect(output).not.toContain("Elections:");
    });
  });

  describe("parseGasSettings", () => {
    it("should return defaults when no options provided", () => {
      const settings = parseGasSettings({});

      expect(settings.maxFeePerGas).toBe(DEFAULT_L2_GAS_SETTINGS.maxFeePerGas);
      expect(settings.maxPriorityFeePerGas).toBe(DEFAULT_L2_GAS_SETTINGS.maxPriorityFeePerGas);
    });

    it("should parse l2MaxFee option", () => {
      const settings = parseGasSettings({ l2MaxFee: "0.5" });

      expect(settings.maxFeePerGas).toBe(0.5);
    });

    it("should parse l2PriorityFee option", () => {
      const settings = parseGasSettings({ l2PriorityFee: "0.01" });

      expect(settings.maxPriorityFeePerGas).toBe(0.01);
    });

    it("should parse both options together", () => {
      const settings = parseGasSettings({ l2MaxFee: "1.0", l2PriorityFee: "0.1" });

      expect(settings.maxFeePerGas).toBe(1.0);
      expect(settings.maxPriorityFeePerGas).toBe(0.1);
    });
  });

  describe("parseChunkingConfig", () => {
    it("should parse chunk sizes with delay", () => {
      const config = parseChunkingConfig({ l1ChunkSize: "1000", l2ChunkSize: "10000" }, 100);

      expect(config.l1ChunkSize).toBe(1000);
      expect(config.l2ChunkSize).toBe(10000);
      expect(config.novaChunkSize).toBe(10000);
      expect(config.delayBetweenChunks).toBe(100);
    });

    it("should handle missing options with zero defaults", () => {
      const config = parseChunkingConfig({}, 50);

      expect(config.l1ChunkSize).toBe(0);
      expect(config.l2ChunkSize).toBe(0);
      expect(config.delayBetweenChunks).toBe(50);
    });
  });

  describe("createSigner", () => {
    it("should create signer from hex private key", () => {
      const key = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const signer = createSigner(key);

      expect(signer).toBeDefined();
      expect(signer.address).toBeDefined();
    });

    it("should create signer from non-prefixed private key", () => {
      const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const signer = createSigner(key);

      expect(signer).toBeDefined();
      expect(signer.address).toBeDefined();
    });
  });

  describe("createProvidersFromOptions", () => {
    beforeEach(() => {
      vi.stubEnv("ETH_RPC", "");
      vi.stubEnv("ARB1_RPC", "");
      vi.stubEnv("NOVA_RPC", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should throw when L1 RPC is missing", () => {
      expect(() => createProvidersFromOptions({})).toThrow("L1 RPC URL required");
    });

    it("should create providers with explicit options", () => {
      const providers = createProvidersFromOptions({
        l1Rpc: "https://eth.example.com",
        l2Rpc: "https://arb.example.com",
        novaRpc: "https://nova.example.com",
      });

      expect(providers.l1Provider).toBeDefined();
      expect(providers.l2Provider).toBeDefined();
      expect(providers.novaProvider).toBeDefined();
    });

    it("should use ETH_RPC env var", () => {
      vi.stubEnv("ETH_RPC", "https://env-eth.example.com");

      const providers = createProvidersFromOptions({});

      expect(providers.l1Provider).toBeDefined();
    });
  });

  describe("requirePrivateKeyForWrite", () => {
    it("should not throw when write is false", () => {
      expect(() => requirePrivateKeyForWrite({ write: false })).not.toThrow();
    });

    it("should not throw when write is undefined", () => {
      expect(() => requirePrivateKeyForWrite({})).not.toThrow();
    });

    it("should not throw when write is true and privateKey is provided", () => {
      expect(() => requirePrivateKeyForWrite({ write: true, privateKey: "0x123" })).not.toThrow();
    });
  });

  describe("addOptions", () => {
    it("should add options to command", () => {
      const cmd = new Command();
      const opts = [new Option("--test", "Test option"), new Option("--another", "Another option")];

      addOptions(cmd, opts);

      const options = cmd.options;
      expect(options).toHaveLength(2);
    });
  });

  describe("isShuttingDown", () => {
    it("should return false when not shutting down", () => {
      expect(isShuttingDown()).toBe(false);
    });
  });
});
