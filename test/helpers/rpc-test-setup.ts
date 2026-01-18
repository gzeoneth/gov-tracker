/**
 * Shared RPC Test Setup
 *
 * Provides consistent tracker/provider setup and caching for RPC-based tests.
 * Reduces code duplication and improves test performance by:
 * - Centralizing env var handling
 * - Caching tracking results across tests
 * - Providing type-safe access to test fixtures
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  createTracker,
  ProposalStageTracker,
  DEFAULT_RPC_URLS,
  TrackingResult,
  TrackingCheckpoint,
} from "../../src";

dotenv.config({ quiet: true });

// ============================================================================
// Environment & Provider Setup
// ============================================================================

export interface RpcConfig {
  ethRpc: string;
  arbRpc: string;
  novaRpc: string;
  arbArchiveRpc?: string;
}

/**
 * Get RPC URLs from environment with fallbacks
 */
export function getRpcConfig(): RpcConfig | null {
  const ethRpc = process.env.ETH_RPC;
  const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
  const novaRpc = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;
  const arbArchiveRpc = process.env.ARB1_ARCHIVE_RPC;

  // ETH_RPC is required for most RPC tests
  if (!ethRpc) {
    return null;
  }

  return { ethRpc, arbRpc, novaRpc, arbArchiveRpc };
}

/**
 * Check if RPC tests should be skipped
 */
export function shouldSkipRpc(): boolean {
  return process.env.NO_RPC === "1" || !getRpcConfig();
}

export interface ProviderBundle {
  l1Provider: ethers.providers.JsonRpcProvider;
  l2Provider: ethers.providers.JsonRpcProvider;
  novaProvider: ethers.providers.JsonRpcProvider;
}

/**
 * Create provider bundle from RPC config
 */
export function createProviders(config: RpcConfig): ProviderBundle {
  return {
    l1Provider: new ethers.providers.JsonRpcProvider(config.ethRpc),
    l2Provider: new ethers.providers.JsonRpcProvider(config.arbRpc),
    novaProvider: new ethers.providers.JsonRpcProvider(config.novaRpc),
  };
}

/**
 * Create tracker with standard configuration
 */
export function createTestTracker(providers: ProviderBundle): ProposalStageTracker {
  return createTracker({
    l1Provider: providers.l1Provider,
    l2Provider: providers.l2Provider,
    novaProvider: providers.novaProvider,
  });
}

// ============================================================================
// Cached Test Data
// ============================================================================

/**
 * Cache for tracking results to avoid redundant RPC calls
 */
export class TestDataCache {
  private trackingResults = new Map<string, TrackingResult[]>();
  private checkpoints = new Map<string, TrackingCheckpoint>();
  private tracker: ProposalStageTracker | null = null;

  constructor(private providers?: ProviderBundle) {}

  /**
   * Initialize tracker if providers are available
   */
  init(providers: ProviderBundle): void {
    this.providers = providers;
    this.tracker = createTestTracker(providers);
  }

  getTracker(): ProposalStageTracker {
    if (!this.tracker) {
      throw new Error("TestDataCache not initialized. Call init() first.");
    }
    return this.tracker;
  }

  getProviders(): ProviderBundle {
    if (!this.providers) {
      throw new Error("TestDataCache not initialized. Call init() first.");
    }
    return this.providers;
  }

  /**
   * Get or fetch tracking result by tx hash
   */
  async getTrackingResult(txHash: string): Promise<TrackingResult[]> {
    const cached = this.trackingResults.get(txHash.toLowerCase());
    if (cached) {
      return cached;
    }

    const tracker = this.getTracker();
    const results = await tracker.trackByTxHash(txHash);
    this.trackingResults.set(txHash.toLowerCase(), results);
    return results;
  }

  /**
   * Prefetch multiple tracking results in parallel
   */
  async prefetch(txHashes: string[]): Promise<void> {
    const tracker = this.getTracker();
    const uncached = txHashes.filter((h) => !this.trackingResults.has(h.toLowerCase()));

    if (uncached.length === 0) return;

    const results = await Promise.all(uncached.map((h) => tracker.trackByTxHash(h)));

    uncached.forEach((hash, i) => {
      this.trackingResults.set(hash.toLowerCase(), results[i]);
    });
  }

  /**
   * Store a checkpoint for later retrieval
   */
  setCheckpoint(key: string, checkpoint: TrackingCheckpoint): void {
    this.checkpoints.set(key, checkpoint);
  }

  /**
   * Get stored checkpoint
   */
  getCheckpoint(key: string): TrackingCheckpoint | undefined {
    return this.checkpoints.get(key);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.trackingResults.clear();
    this.checkpoints.clear();
  }
}

// ============================================================================
// Test Fixture Helpers
// ============================================================================

import {
  CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
  CONSTITUTIONAL_GOVERNOR_IN_PROGRESS,
  DIRECT_TIMELOCK_OPERATION,
  CONSTITUTIONAL_GOVERNOR_FAILED_VOTING,
  CONSTITUTIONAL_GOVERNOR_COMPLETED,
} from "../fixtures";

export const FIXTURES = {
  FULL_ROUNDTRIP: CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP,
  L2_ONLY: NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY,
  IN_PROGRESS: CONSTITUTIONAL_GOVERNOR_IN_PROGRESS,
  DIRECT_TIMELOCK: DIRECT_TIMELOCK_OPERATION,
  FAILED_VOTING: CONSTITUTIONAL_GOVERNOR_FAILED_VOTING,
  COMPLETED: CONSTITUTIONAL_GOVERNOR_COMPLETED,
} as const;

/**
 * Common test fixture tx hashes for prefetching
 */
export const COMMON_TX_HASHES = [
  FIXTURES.FULL_ROUNDTRIP.creationTxHash,
  FIXTURES.L2_ONLY.creationTxHash,
  FIXTURES.COMPLETED.creationTxHash,
] as const;

// ============================================================================
// Test Suite Helpers
// ============================================================================

/**
 * Setup for RPC test suites
 *
 * @example
 * ```typescript
 * describe.skipIf(shouldSkipRpc())("My RPC Tests", () => {
 *   const { cache, beforeAllSetup } = createRpcTestSuite();
 *
 *   beforeAll(async () => {
 *     await beforeAllSetup();
 *     // Prefetch specific data needed for this suite
 *     await cache.prefetch([FIXTURES.FULL_ROUNDTRIP.creationTxHash]);
 *   }, 60000);
 *
 *   it("should test something", async () => {
 *     const results = await cache.getTrackingResult(FIXTURES.FULL_ROUNDTRIP.creationTxHash);
 *     expect(results[0].stages).toBeDefined();
 *   });
 * });
 * ```
 */
export function createRpcTestSuite(): {
  cache: TestDataCache;
  beforeAllSetup: () => Promise<void>;
} {
  const cache = new TestDataCache();

  const beforeAllSetup = async (): Promise<void> => {
    const config = getRpcConfig();
    if (!config) {
      throw new Error("RPC config not available. Ensure ETH_RPC is set.");
    }
    const providers = createProviders(config);
    cache.init(providers);
  };

  return { cache, beforeAllSetup };
}

/**
 * Setup for tests that only need L2 provider
 */
export function createL2OnlyTestSuite(): {
  getProvider: () => ethers.providers.JsonRpcProvider;
  beforeAllSetup: () => void;
} {
  let provider: ethers.providers.JsonRpcProvider | null = null;

  const beforeAllSetup = (): void => {
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
    provider = new ethers.providers.JsonRpcProvider(arbRpc);
  };

  const getProvider = (): ethers.providers.JsonRpcProvider => {
    if (!provider) {
      throw new Error("L2 provider not initialized. Call beforeAllSetup() first.");
    }
    return provider;
  };

  return { getProvider, beforeAllSetup };
}
