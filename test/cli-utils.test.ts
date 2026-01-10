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
  runWithLoop,
  executeTransaction,
  ProviderBundle,
  trackAndPrepare,
  runMonitorCycle,
} from "../src/cli/lib/cli";
import { formatElectionStatus } from "../src/cli/lib/election-check";
import { ElectionStatus, ElectionProposalStatus } from "../src/types/election";
import { ethers } from "ethers";
import { Command, Option } from "commander";
import {
  PreparedTransaction,
  TrackingResult,
  TrackedStage,
  TrackingCheckpoint,
  StageStatus,
  ProposalStageTracker,
} from "../src/index";
import { ADDRESSES } from "../src/constants";
import { StageBuilder } from "../src/stages/builder";

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
  const builder = new StageBuilder(type, chain);
  builder.status(status); // Set status via method to properly set executable flag
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

    it("should show expected ETA for NOT_STARTED stages", () => {
      // #given - a completed stage followed by NOT_STARTED stage
      const completedBuilder = new StageBuilder("PROPOSAL_CREATED", "arb1", "COMPLETED");
      completedBuilder.tx("0xabc", 100, "arb1", 42161, {
        timestamp: 1700000000,
        description: "executed",
      });
      const completedStage = completedBuilder.build();

      const notStartedBuilder = new StageBuilder("VOTING_ACTIVE", "arb1", "NOT_STARTED");
      const notStartedStage = notStartedBuilder.build();

      const result = createMockTrackingResult([completedStage, notStartedStage]);

      // #when
      const output = formatTrackingResult(result);

      // #then - should include Expected ETA
      expect(output).toContain("Expected:");
    });

    it("should show retryable info without pending count", () => {
      // #given - retryable stage with tickets but no pending count (edge case)
      const result = createMockTrackingResult([
        createMockStage("RETRYABLE_EXECUTED", "READY", "arb1", {
          ticketCount: 2,
          creationDetails: [{ targetChain: "arb1" }, { targetChain: "nova" }],
          // No pendingCount or redeemedCount
        }),
      ]);

      // #when
      const output = formatTrackingResult(result);

      // #then - should show basic ticket info without pending/redeemed counts
      expect(output).toContain("[2 tickets: 1 Arb1, 1 Nova]");
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

    it("should count failed timelock operations", () => {
      // #given - a failed timelock operation (isFailed = true)
      const checkpoints = new Map<string, TrackingCheckpoint>();
      checkpoints.set("t1", createMockCheckpoint("timelock", false, true));

      // #when
      const output = formatCacheStatus(checkpoints);

      // #then - should show failed count
      expect(output).toContain("Timelock Ops: 1");
      expect(output).toContain("Failed: 1");
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

    it("should use default L1 RPC when not provided", () => {
      // L1 RPC now defaults to https://eth.llamarpc.com when not provided
      const providers = createProvidersFromOptions({});
      expect(providers.l1Provider).toBeDefined();
      expect(providers.l2Provider).toBeDefined();
      expect(providers.novaProvider).toBeDefined();
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

    it("should exit with error when write is true but privateKey is missing", () => {
      expect(() => requirePrivateKeyForWrite({ write: true })).toThrow("process.exit");
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

  describe("runWithLoop", () => {
    it("should run cycle once when loop is false", async () => {
      const cycleFn = vi.fn().mockResolvedValue(undefined);

      await runWithLoop(cycleFn, { loop: false, intervalMs: 1000 });

      expect(cycleFn).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors when loop is false", async () => {
      const cycleFn = vi.fn().mockRejectedValue(new Error("Test error"));

      await expect(runWithLoop(cycleFn, { loop: false, intervalMs: 1000 })).rejects.toThrow(
        "Test error"
      );
    });
  });

  describe("executeTransaction", () => {
    function createMockProviders(): ProviderBundle {
      return {
        l1Provider: {} as ethers.providers.JsonRpcProvider,
        l2Provider: {} as ethers.providers.JsonRpcProvider,
        novaProvider: {} as ethers.providers.JsonRpcProvider,
      };
    }

    function createMockSigner(
      sendResult: { hash: string; wait: () => Promise<{ blockNumber: number }> } | Error
    ) {
      const mockConnectedSigner = {
        sendTransaction:
          sendResult instanceof Error
            ? vi.fn().mockRejectedValue(sendResult)
            : vi.fn().mockResolvedValue(sendResult),
      };
      return {
        connect: vi.fn().mockReturnValue(mockConnectedSigner),
      } as unknown as ethers.Wallet;
    }

    it("should execute L1 transaction successfully", async () => {
      const mockTx = {
        hash: "0x" + "a".repeat(64),
        wait: vi.fn().mockResolvedValue({ blockNumber: 12345 }),
      };
      const signer = createMockSigner(mockTx);
      const providers = createMockProviders();
      const prepared = createMockPrepared({ chain: "ethereum", chainId: 1 });

      const result = await executeTransaction(prepared, signer, providers);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe(mockTx.hash);
    });

    it("should execute L2 transaction with gas settings", async () => {
      const mockTx = {
        hash: "0x" + "b".repeat(64),
        wait: vi.fn().mockResolvedValue({ blockNumber: 99999 }),
      };
      const signer = createMockSigner(mockTx);
      const providers = createMockProviders();
      const prepared = createMockPrepared({ chain: "arb1", chainId: 42161 });

      const result = await executeTransaction(prepared, signer, providers, {
        maxFeePerGas: 1,
        maxPriorityFeePerGas: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.txHash).toBe(mockTx.hash);
    });

    it("should execute Nova transaction", async () => {
      const mockTx = {
        hash: "0x" + "c".repeat(64),
        wait: vi.fn().mockResolvedValue({ blockNumber: 77777 }),
      };
      const signer = createMockSigner(mockTx);
      const providers = createMockProviders();
      const prepared = createMockPrepared({ chain: "nova", chainId: 42170 });

      const result = await executeTransaction(prepared, signer, providers);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe(mockTx.hash);
    });

    it("should handle transaction failure", async () => {
      const signer = createMockSigner(new Error("Insufficient funds"));
      const providers = createMockProviders();
      const prepared = createMockPrepared();

      const result = await executeTransaction(prepared, signer, providers);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient funds");
    });

    it("should treat already-redeemed retryable as success", async () => {
      const signer = createMockSigner(new Error("NoTicketWithID"));
      const providers = createMockProviders();
      const prepared = createMockPrepared({
        description: "Redeem retryable ticket",
      });

      const result = await executeTransaction(prepared, signer, providers);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should log value when non-zero", async () => {
      const mockTx = {
        hash: "0x" + "d".repeat(64),
        wait: vi.fn().mockResolvedValue({ blockNumber: 12345 }),
      };
      const signer = createMockSigner(mockTx);
      const providers = createMockProviders();
      const prepared = createMockPrepared({ value: "1000000000000000000" }); // 1 ETH

      const result = await executeTransaction(prepared, signer, providers);

      expect(result.success).toBe(true);
    });
  });

  describe("formatElectionStatus", () => {
    function createMockElectionStatus(overrides: Partial<ElectionStatus> = {}): ElectionStatus {
      const now = Math.floor(Date.now() / 1000);
      return {
        electionCount: 5,
        cohort: 0,
        nextElectionTimestamp: now + 86400,
        currentL1Timestamp: now,
        canCreateElection: false,
        secondsUntilElection: 86400,
        timeUntilElection: "1 day",
        ...overrides,
      };
    }

    function createMockProposalStatus(
      overrides: Partial<ElectionProposalStatus> = {}
    ): ElectionProposalStatus {
      return {
        electionIndex: 4,
        cohort: 0,
        phase: "NOMINEE_SELECTION",
        targetNomineeCount: 6,
        compliantNomineeCount: 3,
        isInVettingPeriod: false,
        vettingDeadline: null,
        canProceedToMemberPhase: false,
        nomineeProposalId: null,
        nomineeProposalState: null,
        memberProposalId: null,
        memberProposalState: null,
        ...overrides,
      };
    }

    it("should format basic election status", () => {
      const status = createMockElectionStatus({
        electionCount: 5,
        cohort: 0,
        canCreateElection: false,
        timeUntilElection: "2 days, 3 hours",
      });

      const output = formatElectionStatus(status);

      expect(output).toContain("Security Council Election Status");
      expect(output).toContain("Election Count: 5");
      expect(output).toContain("Cohort: First (0)");
      expect(output).toContain("Can Create Election: NO");
      expect(output).toContain("Time Until Election: 2 days, 3 hours");
    });

    it("should show second cohort correctly", () => {
      const status = createMockElectionStatus({ cohort: 1 });

      const output = formatElectionStatus(status);

      expect(output).toContain("Cohort: Second (1)");
    });

    it("should not show time until election when election can be created", () => {
      const status = createMockElectionStatus({
        canCreateElection: true,
        secondsUntilElection: 0,
        timeUntilElection: "0 seconds",
      });

      const output = formatElectionStatus(status);

      expect(output).toContain("Can Create Election: YES");
      expect(output).not.toContain("Time Until Election:");
    });

    it("should format election proposal status when provided", () => {
      const status = createMockElectionStatus({ electionCount: 5 });
      const electionStatus = createMockProposalStatus({
        phase: "NOMINEE_SELECTION",
        compliantNomineeCount: 4,
        targetNomineeCount: 6,
        canProceedToMemberPhase: false,
      });

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("Election #4 Status");
      expect(output).toContain("Phase: NOMINEE_SELECTION");
      expect(output).toContain("Compliant Nominees: 4/6");
      expect(output).toContain("Can Proceed to Member Phase: NO");
    });

    it("should show nominee proposal info when present", () => {
      const status = createMockElectionStatus();
      const electionStatus = createMockProposalStatus({
        nomineeProposalId: "123456789",
        nomineeProposalState: "Active",
      });

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("Nominee Proposal: 123456789");
      expect(output).toContain("Nominee State: Active");
    });

    it("should show member proposal info when present", () => {
      const status = createMockElectionStatus();
      const electionStatus = createMockProposalStatus({
        memberProposalId: "987654321",
        memberProposalState: "Succeeded",
      });

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("Member Proposal: 987654321");
      expect(output).toContain("Member State: Succeeded");
    });

    it("should show vetting period info when in vetting period", () => {
      const status = createMockElectionStatus();
      const electionStatus = createMockProposalStatus({
        isInVettingPeriod: true,
        vettingDeadline: 20000000,
      });

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("In Vetting Period: YES");
      expect(output).toContain("deadline block 20000000");
    });

    it("should show can proceed when ready", () => {
      const status = createMockElectionStatus();
      const electionStatus = createMockProposalStatus({
        compliantNomineeCount: 6,
        canProceedToMemberPhase: true,
      });

      const output = formatElectionStatus(status, electionStatus);

      expect(output).toContain("Compliant Nominees: 6/6");
      expect(output).toContain("Can Proceed to Member Phase: YES");
    });
  });

  describe("trackAndPrepare", () => {
    function createMockProviders(): ProviderBundle {
      return {
        l1Provider: {} as ethers.providers.JsonRpcProvider,
        l2Provider: {} as ethers.providers.JsonRpcProvider,
        novaProvider: {} as ethers.providers.JsonRpcProvider,
      };
    }

    it("should track and return results", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "COMPLETED"),
      ]);

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        prepareTransaction: vi.fn().mockResolvedValue({ success: false, error: "Not ready" }),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        {},
        providers
      );

      // #then
      expect(mockTracker.trackByTxHash).toHaveBeenCalledWith("0x1234");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(mockTrackingResult);
    });

    it("should prepare ready stages when prepare option enabled", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("L2_TIMELOCK", "READY", "arb1", {
          operationId: "0x" + "ab".repeat(32),
        }),
      ]);

      const preparedTx = createMockPrepared({
        description: "Execute L2 Timelock",
      });

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        prepareTransaction: vi.fn().mockResolvedValue({ success: true, prepared: preparedTx }),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        { prepare: true },
        providers
      );

      // #then
      expect(mockTracker.prepareTransaction).toHaveBeenCalled();
      expect(result.preparedTransactions).toHaveLength(1);
      expect(result.preparedTransactions[0]).toBe(preparedTx);
    });

    it("should return empty preparations when no stages are ready", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
      ]);

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        { prepare: true },
        providers
      );

      // #then
      expect(result.preparations).toHaveLength(0);
      expect(result.preparedTransactions).toHaveLength(0);
    });

    it("should handle multiple tracking results", async () => {
      // #given
      const mockResult1 = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
      ]);
      const mockResult2 = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "READY", "arb1", {
          operationId: "0x" + "cd".repeat(32),
        }),
      ]);

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockResult1, mockResult2]),
        prepareTransaction: vi.fn().mockResolvedValue({ success: false, error: "Not ready" }),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        { prepare: true },
        providers
      );

      // #then
      expect(result.results).toHaveLength(2);
    });

    it("should prepare completed timelock stages when prepareCompleted option enabled", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "COMPLETED", "arb1", {
          operationId: "0x" + "ab".repeat(32),
        }),
      ]);

      const preparedTx = createMockPrepared({
        description: "Execute L2 Timelock",
      });

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        prepareTransaction: vi.fn().mockResolvedValue({ success: true, prepared: preparedTx }),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        { prepare: true, prepareCompleted: true },
        providers
      );

      // #then
      expect(mockTracker.prepareTransaction).toHaveBeenCalled();
      expect(result.preparedTransactions).toHaveLength(1);
    });

    it("should prepare pending stages when preparePending option enabled", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "PENDING", "arb1", {
          operationId: "0x" + "ab".repeat(32),
        }),
      ]);

      const preparedTx = createMockPrepared({
        description: "Execute L2 Timelock",
      });

      const mockTracker = {
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        prepareTransaction: vi.fn().mockResolvedValue({ success: true, prepared: preparedTx }),
      };
      const providers = createMockProviders();

      // #when
      const result = await trackAndPrepare(
        mockTracker as unknown as ProposalStageTracker,
        "0x1234",
        { prepare: true, preparePending: true },
        providers
      );

      // #then
      expect(mockTracker.prepareTransaction).toHaveBeenCalled();
      expect(result.preparedTransactions).toHaveLength(1);
    });
  });

  describe("runMonitorCycle", () => {
    function createMockProviders(): ProviderBundle {
      const mockProvider = {
        getBlockNumber: vi.fn().mockResolvedValue(100000),
      };
      return {
        l1Provider: mockProvider as unknown as ethers.providers.JsonRpcProvider,
        l2Provider: mockProvider as unknown as ethers.providers.JsonRpcProvider,
        novaProvider: mockProvider as unknown as ethers.providers.JsonRpcProvider,
      };
    }

    it("should run discovery and return results", async () => {
      // #given
      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn(),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      expect(mockTracker.discoverAll).toHaveBeenCalled();
      expect(result.result.tracked).toBe(0);
      expect(result.result.errors).toBe(0);
      expect(result.proposals).toEqual([]);
      expect(result.timelockOps).toEqual([]);
    });

    it("should track discovered proposals", async () => {
      // #given
      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
      ]);

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      expect(mockTracker.trackByTxHash).toHaveBeenCalledWith(mockProposal.creationTxHash);
      expect(result.result.tracked).toBe(1);
    });

    it("should call onTrack callback for each tracked proposal", async () => {
      // #given
      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
      ]);

      const onTrack = vi.fn();

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      await runMonitorCycle(mockTracker as unknown as ProposalStageTracker, providers, { onTrack });

      // #then
      expect(onTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          key: `tx:${mockProposal.creationTxHash.toLowerCase()}`,
          result: mockTrackingResult,
        })
      );
    });

    it("should handle tracking errors gracefully", async () => {
      // #given
      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      const onTrack = vi.fn();

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockRejectedValue(new Error("RPC error")),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers,
        { onTrack }
      );

      // #then
      expect(result.result.errors).toBe(1);
      expect(onTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "RPC error",
          result: null,
        })
      );
    });

    it("should retrack when shouldRetrack is returned from callback", async () => {
      // #given
      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
      ]);

      let callCount = 0;
      const onTrack = vi.fn().mockImplementation(() => {
        callCount++;
        // Only request retrack on first call
        return callCount === 1 ? { shouldRetrack: true } : undefined;
      });

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      await runMonitorCycle(mockTracker as unknown as ProposalStageTracker, providers, { onTrack });

      // #then
      // Should have been called twice (original + retrack)
      expect(onTrack).toHaveBeenCalledTimes(2);
    });

    it("should track timelock operations", async () => {
      // #given
      const mockTimelockOp = {
        scheduledTxHash: "0x" + "c".repeat(64),
        operationId: "0x" + "d".repeat(64),
        timelockAddress: "0x" + "e".repeat(40),
      };

      const mockTrackingResult = createMockTrackingResult(
        [
          createMockStage("L2_TIMELOCK", "PENDING", "arb1", {
            operationId: mockTimelockOp.operationId,
          }),
        ],
        {
          input: {
            type: "timelock",
            timelockAddress: mockTimelockOp.timelockAddress,
            operationId: mockTimelockOp.operationId,
            scheduledTxHash: mockTimelockOp.scheduledTxHash,
          },
        }
      );

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [mockTimelockOp],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      expect(mockTracker.trackByTxHash).toHaveBeenCalledWith(mockTimelockOp.scheduledTxHash);
      expect(result.result.tracked).toBe(1);
    });

    it("should use custom startBlock when provided", async () => {
      // #given
      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn(),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      await runMonitorCycle(mockTracker as unknown as ProposalStageTracker, providers, {
        startBlock: 50000,
      });

      // #then
      expect(mockTracker.discoverAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Number),
        expect.objectContaining({
          constitutionalGovernor: 49999, // startBlock - 1
        })
      );
    });

    it("should prepare ready stages when prepare option enabled", async () => {
      // #given
      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      const mockTrackingResult = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "READY", "arb1", {
          operationId: "0x" + "ab".repeat(32),
        }),
      ]);

      const preparedTx = createMockPrepared();

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockTrackingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn().mockResolvedValue({ success: true, prepared: preparedTx }),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers,
        { prepare: true }
      );

      // #then
      expect(mockTracker.prepareTransaction).toHaveBeenCalled();
      expect(result.result.prepared).toBe(1);
    });

    it("should skip duplicate timelock operations already tracked via proposals", async () => {
      // #given
      const operationId = "0x" + "d".repeat(64);

      const mockProposal = {
        creationTxHash: "0x" + "a".repeat(64),
        proposalId: "123",
        governor: "0x" + "b".repeat(40),
      };

      // Timelock op with same operationId as proposal
      const mockTimelockOp = {
        scheduledTxHash: "0x" + "c".repeat(64),
        operationId: operationId,
        timelockAddress: "0x" + "e".repeat(40),
      };

      const mockProposalResult = createMockTrackingResult(
        [createMockStage("L2_TIMELOCK", "PENDING", "arb1", { operationId })],
        {
          timelockLink: {
            operationId,
            txHash: "0x" + "a".repeat(64),
            timelockAddress: "0x" + "e".repeat(40),
            queueBlockNumber: 100000,
          },
        }
      );

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [mockProposal],
          timelockOps: [mockTimelockOp],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([mockProposalResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      // Should only track once (the proposal), not the duplicate timelock op
      expect(mockTracker.trackByTxHash).toHaveBeenCalledTimes(1);
      expect(result.result.tracked).toBe(1);
    });

    it("should retrack incomplete checkpoints", async () => {
      // #given
      const mockTrackingResult = createMockTrackingResult([
        createMockStage("PROPOSAL_CREATED", "COMPLETED"),
        createMockStage("VOTING_ACTIVE", "PENDING"),
      ]);

      const mockCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        input: {
          type: "governor",
          governorAddress: "0x" + "a".repeat(40),
          proposalId: "123",
          creationTxHash: "0x" + "b".repeat(64),
        },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() - 100000 },
      };

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi
          .fn()
          .mockResolvedValue([{ key: "tx:0x" + "b".repeat(64), checkpoint: mockCheckpoint }]),
        trackByTxHash: vi.fn(),
        trackFromCheckpoint: vi.fn().mockResolvedValue(mockTrackingResult),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      expect(mockTracker.trackFromCheckpoint).toHaveBeenCalledWith(mockCheckpoint);
      expect(result.result.retracked).toBe(1);
    });

    it("should throw when timelock operation tracking returns no results", async () => {
      // #given - covers lines 880-881
      const mockTimelockOp = {
        scheduledTxHash: "0x" + "c".repeat(64),
        operationId: "0x" + "d".repeat(64),
        timelockAddress: "0x" + "e".repeat(40),
      };

      const onTrack = vi.fn();

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [mockTimelockOp],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([]), // Returns empty array
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers,
        { onTrack }
      );

      // #then - should record as error
      expect(result.result.errors).toBe(1);
      expect(onTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("No timelock operation found"),
          result: null,
        })
      );
    });

    it("should find matching result by operationId from timelockLink", async () => {
      // #given - covers lines 882-887 (matching by timelockLink.operationId)
      const operationId = "0x" + "d".repeat(64);
      const mockTimelockOp = {
        scheduledTxHash: "0x" + "c".repeat(64),
        operationId: operationId,
        timelockAddress: "0x" + "e".repeat(40),
      };

      // First result doesn't match, second has matching timelockLink.operationId
      const nonMatchingResult = createMockTrackingResult([
        createMockStage("L2_TIMELOCK", "PENDING", "arb1", { operationId: "0x" + "f".repeat(64) }),
      ]);

      const matchingResult = createMockTrackingResult(
        [createMockStage("L2_TIMELOCK", "PENDING", "arb1", { operationId: "other" })],
        {
          timelockLink: {
            operationId: operationId, // Matches via timelockLink
            txHash: mockTimelockOp.scheduledTxHash,
            timelockAddress: mockTimelockOp.timelockAddress,
            queueBlockNumber: 100000,
          },
        }
      );

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [mockTimelockOp],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi.fn().mockResolvedValue([]),
        trackByTxHash: vi.fn().mockResolvedValue([nonMatchingResult, matchingResult]),
        trackFromCheckpoint: vi.fn(),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      const onTrack = vi.fn();

      // #when
      await runMonitorCycle(mockTracker as unknown as ProposalStageTracker, providers, { onTrack });

      // #then - should find and use the matching result
      expect(onTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          result: matchingResult,
        })
      );
    });

    it("should retrack incomplete timelock checkpoints", async () => {
      // #given - covers lines 893-903
      const operationId = "0x" + "op".repeat(32);
      const mockTrackingResult = createMockTrackingResult(
        [createMockStage("L2_TIMELOCK", "PENDING", "arb1", { operationId })],
        {
          input: {
            type: "timelock",
            timelockAddress: "0xTL",
            operationId,
            scheduledTxHash: "0x" + "b".repeat(64),
          },
        }
      );

      const mockCheckpoint: TrackingCheckpoint = {
        version: 1,
        createdAt: Date.now(),
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 0 },
        input: {
          type: "timelock",
          timelockAddress: "0xTL",
          operationId,
          scheduledTxHash: "0x" + "b".repeat(64),
        },
        cachedData: { completedStages: [] },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() - 100000 },
      };

      const mockTracker = {
        discoverAll: vi.fn().mockResolvedValue({
          proposals: [],
          timelockOps: [],
          watermarks: {},
        }),
        queryIncompleteCheckpoints: vi
          .fn()
          .mockResolvedValue([{ key: "tx:0x" + "b".repeat(64), checkpoint: mockCheckpoint }]),
        trackByTxHash: vi.fn(),
        trackFromCheckpoint: vi.fn().mockResolvedValue(mockTrackingResult),
        prepareTransaction: vi.fn(),
      };
      const providers = createMockProviders();

      // #when
      const result = await runMonitorCycle(
        mockTracker as unknown as ProposalStageTracker,
        providers
      );

      // #then
      expect(mockTracker.trackFromCheckpoint).toHaveBeenCalledWith(mockCheckpoint);
      expect(result.result.retracked).toBe(1);
    });
  });
});
