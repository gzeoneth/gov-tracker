/**
 * Zero-RPC Resume Test
 *
 * Verifies that completed stages are fully reconstructed from cache
 * without any RPC calls - the core requirement for unified caching.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";

import {
  ProposalStageTracker,
  createTracker,
  TrackingCheckpoint,
  TrackedStage,
  DEFAULT_RPC_URLS,
} from "../src";
import { createCheckpoint, createTrackingContext } from "../src/tracker/context";

import { CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP } from "./fixtures";

dotenv.config({ quiet: true });

describe.skipIf(process.env.NO_RPC === "1")("Zero-RPC Resume", () => {
  const TEST_CACHE_PATH = "/tmp/zero-rpc-test-gov-tracker-cache.json";

  beforeAll(() => {
    // Clean up any existing test cache
    if (fs.existsSync(TEST_CACHE_PATH)) {
      fs.unlinkSync(TEST_CACHE_PATH);
    }
  });

  it("should restore completed stages from cache without RPC calls", async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("RPC URLs required: Set ETH_RPC environment variables");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

    const l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    const l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
    const novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

    // First track: Fresh (requires RPC calls)
    const tracker1 = createTracker({
      l1Provider,
      l2Provider,
      novaProvider,
      cachePath: TEST_CACHE_PATH,
    });

    const start1 = Date.now();
    const results1 = await tracker1.trackByTxHash(
      CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
    );
    const result1 = results1[0];
    const time1 = Date.now() - start1;

    // Verify first track completed all stages
    expect(result1.isComplete).toBe(true);
    expect(result1.stages.every((s) => s.status === "COMPLETED" || s.status === "SKIPPED")).toBe(
      true
    );
    console.log(`First track: ${time1}ms, ${result1.stages.length} stages`);

    // Verify cache was written
    expect(fs.existsSync(TEST_CACHE_PATH)).toBe(true);

    // Second track: Should be zero-RPC (all from cache)
    const tracker2 = createTracker({
      l1Provider,
      l2Provider,
      novaProvider,
      cachePath: TEST_CACHE_PATH,
    });

    const start2 = Date.now();
    const results2 = await tracker2.trackByTxHash(
      CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
    );
    const result2 = results2[0];
    const time2 = Date.now() - start2;

    // Verify second track is fast (zero-RPC)
    console.log(`Second track: ${time2}ms (speedup: ${(time1 / time2).toFixed(0)}x)`);

    // Second track should be much faster (< 100ms for zero-RPC)
    expect(time2).toBeLessThan(100);

    // Results should be identical
    expect(result2.isComplete).toBe(true);
    expect(result2.stages.length).toBe(result1.stages.length);

    // All stages should be COMPLETED or SKIPPED
    for (const stage of result2.stages) {
      expect(["COMPLETED", "SKIPPED"]).toContain(stage.status);
    }

    // Verify stage data matches
    for (let i = 0; i < result1.stages.length; i++) {
      expect(result2.stages[i].type).toBe(result1.stages[i].type);
      expect(result2.stages[i].status).toBe(result1.stages[i].status);
    }

    // Cleanup
    fs.unlinkSync(TEST_CACHE_PATH);
  });

  it("should use unified cache format for all checkpoint types", async () => {
    // Create a mock cache with checkpoints (using tx: key format)
    const mockCache = {
      "discovery:watermarks": {
        version: 1,
        createdAt: Date.now(),
        input: { type: "discovery", id: "watermarks" },
        lastProcessedStage: null,
        lastProcessedBlock: { l1: 0, l2: 12345678 },
        cachedData: {
          discoveryWatermarks: {
            constitutionalGovernor: 12345678,
            nonConstitutionalGovernor: 12345678,
          },
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      } as TrackingCheckpoint,
      "tx:0xtest123": {
        version: 1,
        createdAt: Date.now(),
        input: {
          type: "governor",
          governorAddress: "0xtest",
          proposalId: "123",
          creationTxHash: "0xtest123",
        },
        lastProcessedStage: "PROPOSAL_CREATED",
        lastProcessedBlock: { l1: 1000, l2: 2000 },
        cachedData: {
          completedStages: [
            {
              type: "PROPOSAL_CREATED",
              status: "COMPLETED",
              chain: "arb1",
              chainId: 42161,
              transactions: [],
              data: {},
            },
          ] as TrackedStage[],
        },
        metadata: { errorCount: 0, lastTrackedAt: Date.now() },
      } as TrackingCheckpoint,
    };

    // Write mock cache
    fs.writeFileSync(TEST_CACHE_PATH, JSON.stringify(mockCache, null, 2));

    // Read it back using the static method
    const { watermarks, checkpoints } = await ProposalStageTracker.readCacheStatus(TEST_CACHE_PATH);

    // Verify unified format
    // Watermarks returned separately, checkpoints only includes tx: keys
    expect(watermarks.constitutionalGovernor).toBe(12345678);
    expect(checkpoints.size).toBe(1); // Only tx: checkpoint (watermarks returned separately)

    const govCheckpoint = checkpoints.get("tx:0xtest123");
    expect(govCheckpoint).toBeDefined();
    expect(govCheckpoint?.cachedData.completedStages?.length).toBe(1);

    // Cleanup
    fs.unlinkSync(TEST_CACHE_PATH);
  });

  it("should preserve PENDING stages with their data across cache resume", async () => {
    // This test verifies the fix for the bug where PENDING stages were not saved
    // to the checkpoint, causing data loss (like callScheduledData, ETA) on resume.
    //
    // Previously: only COMPLETED/SKIPPED stages were saved
    // Now: all tracked stages (not NOT_STARTED) are saved

    // Create mock providers (we won't actually call them in this unit test)
    const mockProvider = {
      getBlockNumber: async () => 12345678,
    } as unknown as ethers.providers.Provider;

    // Create a tracking context with PENDING stage data
    const pendingStage: TrackedStage = {
      type: "L2_TIMELOCK",
      status: "PENDING",
      chain: "arb1",
      chainId: 42161,
      transactions: [
        {
          hash: "0xtest-queued-hash",
          blockNumber: 1000,
          chain: "arb1",
          chainId: 42161,
          timestamp: 1700000000,
          description: "queued",
        },
      ],
      data: {
        operationId: "0xtest-operation-id",
        timelockAddress: "0xtest-timelock-address",
        state: "WAITING",
        eta: 1700100000,
        callScheduledData: [
          {
            operationId: "0xtest-operation-id",
            index: "0",
            target: "0xtest-target",
            value: "0",
            data: "0xtest-calldata",
            predecessor: "0x0",
            delay: "691200",
            blockNumber: 1000,
            txHash: "0xtest-queued-hash",
            logIndex: 0,
            timelockAddress: "0xtest-timelock-address",
          },
        ],
        isSecurityCouncilOperation: true,
        securityCouncilNonce: "15",
      },
      timing: {
        startedAt: 1700000000,
        eta: 1700100000,
      },
    };

    // Create context with the pending stage
    const ctx = createTrackingContext({
      providers: {
        l1: mockProvider,
        l2: mockProvider,
        nova: mockProvider,
      },
      input: {
        type: "timelock",
        timelockAddress: "0xtest-timelock-address",
        operationId: "0xtest-operation-id",
        scheduledTxHash: "0xtest-queued-hash",
      },
    });

    // Manually add the PENDING stage to the context's stages
    const ctxWithPendingStage = {
      ...ctx,
      stages: ctx.stages.map((s) => (s.type === "L2_TIMELOCK" ? pendingStage : s)),
    };

    // Create checkpoint
    const checkpoint = createCheckpoint(ctxWithPendingStage);

    // Verify PENDING stage is included in completedStages
    expect(checkpoint.cachedData.completedStages?.length).toBeGreaterThan(0);

    const savedPendingStage = checkpoint.cachedData.completedStages?.find(
      (s) => s.type === "L2_TIMELOCK"
    );
    expect(savedPendingStage).toBeDefined();
    expect(savedPendingStage?.status).toBe("PENDING");

    // Verify critical data is preserved
    expect(savedPendingStage?.data.operationId).toBe("0xtest-operation-id");
    expect(savedPendingStage?.data.callScheduledData).toBeDefined();
    expect(savedPendingStage?.data.isSecurityCouncilOperation).toBe(true);
    expect(savedPendingStage?.data.securityCouncilNonce).toBe("15");
    expect(savedPendingStage?.timing?.eta).toBe(1700100000);
    expect(savedPendingStage?.transactions?.length).toBe(1);
    expect(savedPendingStage?.transactions?.[0].hash).toBe("0xtest-queued-hash");

    // Now verify that loading from this checkpoint restores the data
    const restoredCtx = createTrackingContext({
      providers: {
        l1: mockProvider,
        l2: mockProvider,
        nova: mockProvider,
      },
      input: {
        type: "timelock",
        timelockAddress: "0xtest-timelock-address",
        operationId: "0xtest-operation-id",
        scheduledTxHash: "0xtest-queued-hash",
      },
      checkpoint,
    });

    // Verify the PENDING stage is restored with all data
    const restoredStage = restoredCtx.stages.find((s) => s.type === "L2_TIMELOCK");
    expect(restoredStage).toBeDefined();
    expect(restoredStage?.status).toBe("PENDING");
    expect(restoredStage?.data.operationId).toBe("0xtest-operation-id");
    expect(restoredStage?.data.callScheduledData).toBeDefined();
    expect(restoredStage?.data.isSecurityCouncilOperation).toBe(true);
    expect(restoredStage?.data.securityCouncilNonce).toBe("15");
    expect(restoredStage?.timing?.eta).toBe(1700100000);
  });
});
