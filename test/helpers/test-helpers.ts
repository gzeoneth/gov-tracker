/**
 * Shared test helpers for creating mock checkpoints and stages
 */

import type {
  TrackingCheckpoint,
  TrackedStage,
  StageType,
  StageStatus,
  CacheAdapter,
} from "../../src/types";

/**
 * Mock cache adapter for testing
 *
 * Implements CacheAdapter interface with in-memory Map storage.
 * Use this instead of defining MockCache in individual test files.
 */
export class MockCache implements CacheAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (prefix) {
      return allKeys.filter((k) => k.startsWith(prefix));
    }
    return allKeys;
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Create a mock cache factory function (alternative to class instantiation)
 *
 * Returns an object implementing CacheAdapter with synchronous keys() that supports prefix filtering.
 * Useful when tests need the synchronous keys() pattern.
 */
export function createMockCache(): CacheAdapter & {
  keys(prefix?: string): string[];
  _storage: Map<string, unknown>;
} {
  const storage = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | null> => (storage.get(key) as T) ?? null,
    set: async <T>(key: string, value: T): Promise<void> => {
      storage.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      storage.delete(key);
    },
    has: async (key: string): Promise<boolean> => storage.has(key),
    clear: async (): Promise<void> => {
      storage.clear();
    },
    keys: (prefix?: string): string[] =>
      [...storage.keys()].filter((k) => !prefix || k.startsWith(prefix)),
    _storage: storage,
  };
}
import { ADDRESSES } from "../../src/constants";

/**
 * Create a minimal checkpoint for testing
 */
export function createTestCheckpoint(
  overrides: Partial<TrackingCheckpoint> & {
    stages?: TrackedStage[];
    inputType?: "governor" | "timelock" | "election";
    governorAddress?: string;
    electionStatus?: { phase: string };
  } = {}
): TrackingCheckpoint {
  const stages = overrides.stages ?? [];
  const inputType = overrides.inputType ?? "governor";

  let input: TrackingCheckpoint["input"];
  if (inputType === "election") {
    input = {
      type: "election" as const,
      electionIndex: 0,
    };
  } else if (inputType === "timelock") {
    input = {
      type: "timelock" as const,
      operationId: "0x" + "a".repeat(64),
      timelockAddress: "0x" + "b".repeat(40),
      scheduledTxHash: "0x" + "c".repeat(64),
    };
  } else {
    input = {
      type: "governor" as const,
      governorAddress: overrides.governorAddress ?? ADDRESSES.CONSTITUTIONAL_GOVERNOR,
      proposalId: "12345",
      creationTxHash: "0x" + "a".repeat(64),
    };
  }

  return {
    input,
    cachedData: {
      completedStages: stages,
      electionStatus: overrides.electionStatus,
    },
    metadata: overrides.metadata ?? { errorCount: 0, lastTrackedAt: Date.now() },
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  } as TrackingCheckpoint;
}

/**
 * Create a stage with minimal required fields
 */
export function createTestStage(type: StageType, status: StageStatus): TrackedStage {
  return {
    type,
    status,
    chain: "arb1",
    chainId: 42161,
    transactions: [],
    data: {},
  } as TrackedStage;
}
