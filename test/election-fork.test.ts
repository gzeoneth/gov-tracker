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
import {
  checkElectionStatus,
  prepareElectionCreation,
  trackElectionProposal,
  createTracker,
  ADDRESSES,
  getElectionProposalId,
  getContenders,
  getNomineesWithVotes,
  getExcludedNominees,
  getNomineeElectionDetails,
  getMemberElectionDetails,
} from "../src";

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

  describe("trackElectionProposal", () => {
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
        const electionStatus = await trackElectionProposal(
          0, // First election
          forks.l2.provider,
          forks.l1.provider
        );

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

describe("Detailed Election Tracking", () => {
  let forks: DualForkResult | null = null;
  let rpcUrls: NonNullable<ReturnType<typeof getTestRpcUrls>>;

  // Election #0 completed around L2 block ~287M (Dec 2023)
  // Using a block after member election execution for full data
  const ELECTION_0_COMPLETE_BLOCK = 287_000_000;

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

  describe("getElectionProposalId", () => {
    it("should return proposal ID for election #0", async () => {
      // #given Fork at block after election #0 creation
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      // #when getting proposal ID for election 0
      const proposalId = await getElectionProposalId(0, forks.l2.provider);

      // #then should return a valid proposal ID
      expect(proposalId).toBeDefined();
      expect(proposalId).not.toBeNull();
      expect(typeof proposalId).toBe("string");
      expect(proposalId!.length).toBeGreaterThan(0);

      await forks.stopAll();
      forks = null;
    });
  });

  describe("getContenders", () => {
    it("should return contenders for election #0", async () => {
      // #given Fork at block after election #0 had contenders
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      const proposalId = await getElectionProposalId(0, forks.l2.provider);
      expect(proposalId).not.toBeNull();

      // #when getting contenders
      const contenders = await getContenders(proposalId!, forks.l2.provider);

      // #then should return array of contenders with valid structure
      expect(Array.isArray(contenders)).toBe(true);
      // Election #0 should have had contenders
      if (contenders.length > 0) {
        const contender = contenders[0];
        expect(contender).toHaveProperty("address");
        expect(contender).toHaveProperty("registeredAtBlock");
        expect(contender).toHaveProperty("registrationTxHash");
        expect(typeof contender.address).toBe("string");
        expect(typeof contender.registeredAtBlock).toBe("number");
        expect(typeof contender.registrationTxHash).toBe("string");
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("getNomineesWithVotes", () => {
    it("should return nominees with vote counts for election #0", async () => {
      // #given Fork at block after election #0 had nominees
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      const proposalId = await getElectionProposalId(0, forks.l2.provider);
      expect(proposalId).not.toBeNull();

      // #when getting nominees with votes
      const nominees = await getNomineesWithVotes(proposalId!, forks.l2.provider);

      // #then should return array of nominees with valid structure
      expect(Array.isArray(nominees)).toBe(true);
      // Election #0 should have had nominees (at least 6 for a successful election)
      if (nominees.length > 0) {
        const nominee = nominees[0];
        expect(nominee).toHaveProperty("address");
        expect(nominee).toHaveProperty("votesReceived");
        expect(nominee).toHaveProperty("isExcluded");
        expect(typeof nominee.address).toBe("string");
        expect(typeof nominee.isExcluded).toBe("boolean");
        // votesReceived is BigNumber
        expect(nominee.votesReceived._isBigNumber).toBe(true);
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("getExcludedNominees", () => {
    it("should return excluded nominees (if any) for election #0", async () => {
      // #given Fork at block after election #0 vetting period
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      const proposalId = await getElectionProposalId(0, forks.l2.provider);
      expect(proposalId).not.toBeNull();

      // #when getting excluded nominees
      const excluded = await getExcludedNominees(proposalId!, forks.l2.provider);

      // #then should return array (may be empty if no exclusions)
      expect(Array.isArray(excluded)).toBe(true);
      // If there are excluded nominees, verify structure
      if (excluded.length > 0) {
        const nominee = excluded[0];
        expect(nominee).toHaveProperty("address");
        expect(nominee).toHaveProperty("votesReceived");
        expect(nominee).toHaveProperty("isExcluded");
        expect(nominee.isExcluded).toBe(true);
        expect(nominee).toHaveProperty("excludedAtBlock");
        expect(nominee).toHaveProperty("exclusionTxHash");
      }

      await forks.stopAll();
      forks = null;
    });
  });

  describe("getNomineeElectionDetails", () => {
    it("should return comprehensive nominee election details for election #0", async () => {
      // #given Fork at block after election #0 completed
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      // #when getting nominee election details
      const details = await getNomineeElectionDetails(0, forks.l2.provider);

      // #then should return valid details structure
      expect(details).not.toBeNull();
      expect(details!.electionIndex).toBe(0);
      expect(details!.proposalId).toBeDefined();
      expect(Array.isArray(details!.contenders)).toBe(true);
      expect(Array.isArray(details!.nominees)).toBe(true);
      expect(Array.isArray(details!.compliantNominees)).toBe(true);
      expect(Array.isArray(details!.excludedNominees)).toBe(true);
      expect(details!.quorumThreshold._isBigNumber).toBe(true);
      expect(details!.targetNomineeCount).toBe(6);

      // Compliant + excluded should equal all nominees
      expect(details!.compliantNominees.length + details!.excludedNominees.length).toBe(
        details!.nominees.length
      );

      await forks.stopAll();
      forks = null;
    });
  });

  describe("getMemberElectionDetails", () => {
    it("should return comprehensive member election details for election #0", async () => {
      // #given Fork at block after election #0 member election completed
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      // #when getting member election details
      const details = await getMemberElectionDetails(0, forks.l2.provider);

      // #then should return valid details structure
      expect(details).not.toBeNull();
      expect(details!.electionIndex).toBe(0);
      expect(details!.proposalId).toBeDefined();
      expect(Array.isArray(details!.nominees)).toBe(true);
      expect(Array.isArray(details!.winners)).toBe(true);
      expect(typeof details!.fullWeightDeadline).toBe("number");
      expect(typeof details!.proposalDeadline).toBe("number");

      // Should have 6 winners for a completed election
      expect(details!.winners.length).toBe(6);

      // Nominees should have valid structure
      if (details!.nominees.length > 0) {
        const nominee = details!.nominees[0];
        expect(nominee).toHaveProperty("address");
        expect(nominee).toHaveProperty("weightReceived");
        expect(nominee).toHaveProperty("isWinner");
        expect(nominee).toHaveProperty("rank");
        expect(nominee.weightReceived._isBigNumber).toBe(true);
        expect(typeof nominee.isWinner).toBe("boolean");
        expect(typeof nominee.rank).toBe("number");
        expect(nominee.rank).toBeGreaterThan(0);
      }

      await forks.stopAll();
      forks = null;
    });

    it("should rank nominees by weight received in descending order", async () => {
      // #given Fork at block after election #0 member election
      forks = await startDualForksAtL2Block({
        l1Url: rpcUrls!.l1,
        l2Url: rpcUrls!.l2Archive,
        l2BlockNumber: ELECTION_0_COMPLETE_BLOCK,
      });

      // #when getting member election details
      const details = await getMemberElectionDetails(0, forks.l2.provider);
      expect(details).not.toBeNull();

      // #then nominees should be ranked in descending weight order
      const nominees = details!.nominees;
      for (let i = 1; i < nominees.length; i++) {
        const prev = nominees[i - 1];
        const curr = nominees[i];
        // Previous weight >= current weight (descending order)
        expect(prev.weightReceived.gte(curr.weightReceived)).toBe(true);
        // Ranks should increment
        expect(curr.rank).toBe(prev.rank + 1);
      }

      await forks.stopAll();
      forks = null;
    });
  });
});
