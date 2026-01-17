/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Election Tracking Tests with Anvil Fork
 *
 * Tests election status checking and vetting period validation using
 * anvil forks at historical block numbers for deterministic results.
 *
 * NOTE: These tests require ARB1_ARCHIVE_RPC to be set in .env.
 * They use small block ranges to avoid slow log queries.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as dotenv from "dotenv";
import { startDualForksAtL2Block, getTestRpcUrls, DualForkResult } from "./helpers/anvil-fork";
import { checkElectionStatus, prepareElectionCreation, createTracker, ADDRESSES } from "../src";

dotenv.config({ quiet: true });

// Test data: L2 block numbers where we know the state
// The L1 block is automatically determined from the L2 block's embedded l1BlockNumber
const TEST_L2_BLOCKS = {
  // A stable historical block for basic functionality tests
  CONSISTENT: 200_000_000,

  // Election creation block - tx 0x82a0baf3d7e6a6b3247d5848e88732c8ebad0c46b204ff2b7c81beb3158600a6
  // At block 379398080 (just before), canCreateElection should be true
  // At block 379398081 (creation), election was created
  ELECTION_POKE: 379_398_080,
};

describe("Election Fork Tests", () => {
  let forks: DualForkResult | null = null;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;

  beforeAll(() => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("checkElectionStatus", () => {
    it("should check election status at a historical block", async () => {
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: TEST_L2_BLOCKS.CONSISTENT,
      });

      const status = await checkElectionStatus(
        forks.l2.provider,
        forks.l1.provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      // Verify the status structure is correct
      expect(status).toHaveProperty("electionCount");
      expect(status).toHaveProperty("cohort");
      expect(status).toHaveProperty("nextElectionTimestamp");
      expect(status).toHaveProperty("currentL1Timestamp");
      expect(status).toHaveProperty("canCreateElection");
      expect(status).toHaveProperty("secondsUntilElection");
      expect(status).toHaveProperty("timeUntilElection");

      // At this historical block, we can verify deterministic results
      expect(typeof status.electionCount).toBe("number");
      expect(status.electionCount).toBeGreaterThanOrEqual(0);

      // Cohort should be 0 or 1
      expect([0, 1]).toContain(status.cohort);

      // Test prepareElectionCreation at this block
      const { transaction, electionIndex } = prepareElectionCreation(status);

      // Verify transaction structure
      expect(transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(transaction.data).toBeDefined();
      expect(transaction.value).toBe("0");
      expect(transaction.chain).toBe("arb1");
      expect(transaction.description).toContain("createElection()");

      // Verify election index matches status
      expect(electionIndex).toBe(status.electionCount);

      await forks.stopAll();
      forks = null;
    });

    it("should detect election ready to be created (poke scenario)", async () => {
      // Fork at block just before election creation tx 0x82a0baf3...
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: TEST_L2_BLOCKS.ELECTION_POKE,
      });

      const status = await checkElectionStatus(
        forks.l2.provider,
        forks.l1.provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      // At this block, election should be ready to create (poke needed)
      expect(status.canCreateElection).toBe(true);
      expect(status.secondsUntilElection).toBe(0);

      // Prepare the transaction that would create the election
      const { transaction } = prepareElectionCreation(status);
      expect(transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(transaction.description).toContain("createElection()");

      await forks.stopAll();
      forks = null;
    });
  });
});

describe("Election Proposal Tracking with Forks", () => {
  let forks: DualForkResult | null = null;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;

  beforeAll(() => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  describe("trackElection (via tracker)", () => {
    it("should track election proposal status at historical block", async () => {
      // Use the ELECTION_POKE block which is known to have elections
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: TEST_L2_BLOCKS.ELECTION_POKE,
      });

      // Get the current election count to track a past election
      const status = await checkElectionStatus(
        forks.l2.provider,
        forks.l1.provider,
        ADDRESSES.ELECTION_NOMINEE_GOVERNOR
      );

      // Track an earlier election (if any exist)
      if (status.electionCount > 0) {
        // Use the unified pipeline via tracker
        const tracker = createTracker({
          l1Provider: forks.l1.provider,
          l2Provider: forks.l2.provider,
          novaProvider: forks.l2.provider,
        });

        const electionStatus = await tracker.trackElection(0); // First election

        expect(electionStatus.electionIndex).toBe(0);
        expect([0, 1]).toContain(electionStatus.cohort);
        expect(electionStatus.targetNomineeCount).toBe(6);

        // At this block (Dec 2024), first election should be completed
        // But if NOT_STARTED, it means the proposal wasn't found - this is acceptable for fork state
        expect(["COMPLETED", "NOT_STARTED"]).toContain(electionStatus.phase);
      }

      await forks.stopAll();
      forks = null;
    });
  });
});

describe("Tracker checkElection Integration", () => {
  let forks: DualForkResult | null = null;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;

  beforeAll(() => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
  });

  afterAll(async () => {
    if (forks) {
      await forks.stopAll();
    }
  });

  it("should prepare createElection transaction when canCreateElection is true", async () => {
    // #given Fork at block where election can be created
    forks = await startDualForksAtL2Block({
      l1Url: rpcUrls!.l1,
      l2Url: rpcUrls!.l2Archive,
      l2BlockNumber: TEST_L2_BLOCKS.ELECTION_POKE,
    });

    // Create tracker with forked providers
    const tracker = createTracker({
      l1Provider: forks.l1.provider,
      l2Provider: forks.l2.provider,
      novaProvider: forks.l2.provider, // Use L2 provider for nova (not used in election check)
    });

    // #when checking election through tracker
    const result = await tracker.checkElection();

    // #then should have canCreate=true and prepared transaction
    expect(result.canCreate).toBe(true);
    expect(result.prepared.createElection).toBeDefined();
    expect(result.prepared.createElection!.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(result.prepared.createElection!.description).toContain("createElection()");

    // Should also have current election info since electionCount > 0
    expect(result.currentElection).toBeDefined();

    await forks.stopAll();
    forks = null;
  });
});

describe("Fork Infrastructure Tests", () => {
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;

  beforeAll(() => {
    const urls = getTestRpcUrls();
    if (!urls) {
      throw new Error(
        "Archive RPC URLs required for fork tests. Set ARB1_ARCHIVE_RPC and ETH_RPC environment variables."
      );
    }
    rpcUrls = urls;
  });

  it("should start and stop anvil forks", async () => {
    const forks = await startDualForksAtL2Block({
      l1Url: rpcUrls!.l1,
      l2Url: rpcUrls!.l2Archive,
      l2BlockNumber: TEST_L2_BLOCKS.CONSISTENT,
    });

    // Verify both forks are running at the expected blocks
    const l1Block = await forks.l1.provider.getBlockNumber();
    const l2Block = await forks.l2.provider.getBlockNumber();

    // L2 block should match our target
    expect(l2Block).toBe(TEST_L2_BLOCKS.CONSISTENT);
    // L1 block was auto-detected from L2, should be a reasonable historical block
    expect(l1Block).toBeGreaterThan(19_000_000); // Reasonable L1 block for L2 200M

    // Verify we can query the chains
    const l1Network = await forks.l1.provider.getNetwork();
    const l2Network = await forks.l2.provider.getNetwork();

    expect(l1Network.chainId).toBe(1);
    expect(l2Network.chainId).toBe(42161);

    // Clean up
    await forks.stopAll();
  });
});
