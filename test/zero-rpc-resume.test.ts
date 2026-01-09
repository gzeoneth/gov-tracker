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
import { createCheckpoint, createTrackingState } from "../src/tracker/state";

import { CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP } from "./fixtures";

dotenv.config({ quiet: true });

describe.skipIf(process.env.NO_RPC === "1")(
  "Zero-RPC Resume",
  {
    timeout: 180000, // 3 minutes for slow RPC tracking
  },
  () => {
    const TEST_CACHE_PATH = "/tmp/zero-rpc-test-gov-tracker-cache.json";

    beforeAll(() => {
      // Clean up any existing test cache
      if (fs.existsSync(TEST_CACHE_PATH)) {
        fs.unlinkSync(TEST_CACHE_PATH);
      }
    });

    it("should restore completed stages from cache without RPC calls", async () => {
      // #given - RPC providers and a tracker with file cache configured
      const ethRpc = process.env.ETH_RPC;
      if (!ethRpc) {
        throw new Error("RPC URLs required: Set ETH_RPC environment variables");
      }
      const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
      const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

      const l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
      const l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);
      const novaProvider = new ethers.providers.JsonRpcProvider(novaRpc);

      const tracker1 = createTracker({
        l1Provider,
        l2Provider,
        novaProvider,
        cachePath: TEST_CACHE_PATH,
      });

      // #when - tracking a completed proposal for the first time (populates cache)
      const start1 = Date.now();
      const results1 = await tracker1.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result1 = results1[0];
      const time1 = Date.now() - start1;

      // #then - first track completes all stages and writes cache
      expect(result1.isComplete).toBe(true);
      expect(result1.stages.every((s) => s.status === "COMPLETED" || s.status === "SKIPPED")).toBe(
        true
      );
      console.log(`First track: ${time1}ms, ${result1.stages.length} stages`);
      expect(fs.existsSync(TEST_CACHE_PATH)).toBe(true);

      // #given - a second tracker instance with same cache path
      const tracker2 = createTracker({
        l1Provider,
        l2Provider,
        novaProvider,
        cachePath: TEST_CACHE_PATH,
      });

      // #when - tracking the same proposal again (should use cache)
      const start2 = Date.now();
      const results2 = await tracker2.trackByTxHash(
        CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.creationTxHash
      );
      const result2 = results2[0];
      const time2 = Date.now() - start2;

      // #then - second track is fast (< 100ms) with identical results
      console.log(`Second track: ${time2}ms (speedup: ${(time1 / time2).toFixed(0)}x)`);
      expect(time2).toBeLessThan(100);
      expect(result2.isComplete).toBe(true);
      expect(result2.stages.length).toBe(result1.stages.length);

      for (const stage of result2.stages) {
        expect(["COMPLETED", "SKIPPED"]).toContain(stage.status);
      }

      for (let i = 0; i < result1.stages.length; i++) {
        expect(result2.stages[i].type).toBe(result1.stages[i].type);
        expect(result2.stages[i].status).toBe(result1.stages[i].status);
      }

      // Cleanup
      fs.unlinkSync(TEST_CACHE_PATH);
    });

    it("should use unified cache format for all checkpoint types", async () => {
      // #given - a mock cache file with both discovery watermarks and tx checkpoint entries
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
            ] as unknown as TrackedStage[],
          },
          metadata: { errorCount: 0, lastTrackedAt: Date.now() },
        } as TrackingCheckpoint,
      };

      fs.writeFileSync(TEST_CACHE_PATH, JSON.stringify(mockCache, null, 2));

      // #when - reading cache status using the static method
      const { watermarks, checkpoints } =
        await ProposalStageTracker.readCacheStatus(TEST_CACHE_PATH);

      // #then - watermarks and checkpoints are parsed separately in unified format
      expect(watermarks.constitutionalGovernor).toBe(12345678);
      expect(checkpoints.size).toBe(1);

      const govCheckpoint = checkpoints.get("tx:0xtest123");
      expect(govCheckpoint).toBeDefined();
      expect(govCheckpoint?.cachedData.completedStages?.length).toBe(1);

      // Cleanup
      fs.unlinkSync(TEST_CACHE_PATH);
    });

    it("should preserve PENDING stages with their data across cache resume", async () => {
      // #given - a tracking context with a PENDING L2_TIMELOCK stage containing critical data
      const mockProvider = {
        getBlockNumber: async () => 12345678,
      } as unknown as ethers.providers.Provider;

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

      const ctx = createTrackingState({
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

      const ctxWithPendingStage = {
        ...ctx,
        stages: ctx.stages.map((s) => (s.type === "L2_TIMELOCK" ? pendingStage : s)),
      };

      // #when - creating a checkpoint from context with PENDING stage
      const checkpoint = createCheckpoint(ctxWithPendingStage);

      // #then - PENDING stage is included in checkpoint with all critical data preserved
      expect(checkpoint.cachedData.completedStages?.length).toBeGreaterThan(0);

      const savedPendingStage = checkpoint.cachedData.completedStages?.find(
        (s) => s.type === "L2_TIMELOCK"
      );
      expect(savedPendingStage).toBeDefined();
      expect(savedPendingStage?.status).toBe("PENDING");
      expect(savedPendingStage?.data.operationId).toBe("0xtest-operation-id");
      expect(savedPendingStage?.data.callScheduledData).toBeDefined();
      expect(savedPendingStage?.data.isSecurityCouncilOperation).toBe(true);
      expect(savedPendingStage?.data.securityCouncilNonce).toBe("15");
      expect(savedPendingStage?.timing?.eta).toBe(1700100000);
      expect(savedPendingStage?.transactions?.length).toBe(1);
      expect(savedPendingStage?.transactions?.[0].hash).toBe("0xtest-queued-hash");

      // #when - creating a new context from the checkpoint
      const restoredCtx = createTrackingState({
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

      // #then - PENDING stage is restored with all data intact
      const restoredStage = restoredCtx.stages.find((s) => s.type === "L2_TIMELOCK");
      expect(restoredStage).toBeDefined();
      expect(restoredStage?.status).toBe("PENDING");
      expect(restoredStage?.data.operationId).toBe("0xtest-operation-id");
      expect(restoredStage?.data.callScheduledData).toBeDefined();
      expect(restoredStage?.data.isSecurityCouncilOperation).toBe(true);
      expect(restoredStage?.data.securityCouncilNonce).toBe("15");
      expect(restoredStage?.timing?.eta).toBe(1700100000);
    });
  }
);
