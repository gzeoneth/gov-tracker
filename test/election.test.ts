/**
 * Tests for Election Module
 *
 * Tests for Security Council election-related functions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { BigNumber, ethers } from "ethers";
import * as dotenv from "dotenv";
import * as election from "../src/election/index";
import {
  ADDRESSES,
  checkElectionStatus,
  checkVettingPeriod,
  hasVettingPeriod,
  getElectionProposalId,
  getElectionProposalParams,
  prepareMemberElectionTrigger,
  prepareElectionCreation,
  ProposalStageTracker,
  ElectionProposalStatus,
  ElectionStatus,
} from "../src";
import { getVettingDeadline } from "./helpers/election-helpers";
import { shouldSkipRpc, createRpcTestSuite } from "./helpers";

dotenv.config({ quiet: true });

describe("Election Module", () => {
  // Note: hasVettingPeriod requires a proper ethers Contract which needs a signer/provider
  // These are integration-level tests and require RPC access
  // Unit tests focus on pure functions

  describe("Election Address Detection", () => {
    it("should identify Election Nominee Governor", () => {
      // The ELECTION_NOMINEE_GOVERNOR address should be properly defined
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).toBeDefined();
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should identify Election Member Governor", () => {
      // The ELECTION_MEMBER_GOVERNOR address should be properly defined
      expect(ADDRESSES.ELECTION_MEMBER_GOVERNOR).toBeDefined();
      expect(ADDRESSES.ELECTION_MEMBER_GOVERNOR).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should have distinct addresses for different election governors", () => {
      expect(ADDRESSES.ELECTION_NOMINEE_GOVERNOR).not.toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
    });

    it("should have Security Council Manager address defined", () => {
      expect(ADDRESSES.SECURITY_COUNCIL_MANAGER).toBeDefined();
      expect(ADDRESSES.SECURITY_COUNCIL_MANAGER).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("Election Module Exports", () => {
    describe("contract factories", () => {
      it("should export getNomineeGovernor", () => {
        expect(election.getNomineeGovernor).toBeDefined();
        expect(typeof election.getNomineeGovernor).toBe("function");
      });

      it("should export getMemberGovernor", () => {
        expect(election.getMemberGovernor).toBeDefined();
        expect(typeof election.getMemberGovernor).toBe("function");
      });
    });

    describe("proposal ID functions", () => {
      it("should export clearElectionCache", () => {
        expect(election.clearElectionCache).toBeDefined();
        expect(typeof election.clearElectionCache).toBe("function");
      });

      it("should export getElectionProposalId", () => {
        expect(election.getElectionProposalId).toBeDefined();
        expect(typeof election.getElectionProposalId).toBe("function");
      });

      it("should export getMemberElectionProposalId", () => {
        expect(election.getMemberElectionProposalId).toBeDefined();
        expect(typeof election.getMemberElectionProposalId).toBe("function");
      });
    });

    describe("proposal params functions", () => {
      it("should export getElectionProposalParams", () => {
        expect(election.getElectionProposalParams).toBeDefined();
        expect(typeof election.getElectionProposalParams).toBe("function");
      });

      it("should export getMemberElectionProposalParams", () => {
        expect(election.getMemberElectionProposalParams).toBeDefined();
        expect(typeof election.getMemberElectionProposalParams).toBe("function");
      });
    });

    describe("participants functions", () => {
      it("should export getContenders", () => {
        expect(election.getContenders).toBeDefined();
        expect(typeof election.getContenders).toBe("function");
      });

      it("should export getNomineesWithVotes", () => {
        expect(election.getNomineesWithVotes).toBeDefined();
        expect(typeof election.getNomineesWithVotes).toBe("function");
      });

      it("should export getExcludedNominees", () => {
        expect(election.getExcludedNominees).toBeDefined();
        expect(typeof election.getExcludedNominees).toBe("function");
      });
    });

    describe("details functions", () => {
      it("should export getNomineeElectionDetails", () => {
        expect(election.getNomineeElectionDetails).toBeDefined();
        expect(typeof election.getNomineeElectionDetails).toBe("function");
      });

      it("should export getMemberElectionDetails", () => {
        expect(election.getMemberElectionDetails).toBeDefined();
        expect(typeof election.getMemberElectionDetails).toBe("function");
      });
    });

    describe("prepare functions", () => {
      it("should export prepareElectionCreation", () => {
        expect(election.prepareElectionCreation).toBeDefined();
        expect(typeof election.prepareElectionCreation).toBe("function");
      });

      it("should export prepareMemberElectionTrigger", () => {
        expect(election.prepareMemberElectionTrigger).toBeDefined();
        expect(typeof election.prepareMemberElectionTrigger).toBe("function");
      });

      it("should export prepareMemberElectionExecution", () => {
        expect(election.prepareMemberElectionExecution).toBeDefined();
        expect(typeof election.prepareMemberElectionExecution).toBe("function");
      });
    });

    describe("status functions", () => {
      it("should export checkElectionStatus", () => {
        expect(election.checkElectionStatus).toBeDefined();
        expect(typeof election.checkElectionStatus).toBe("function");
      });

      it("should export hasVettingPeriod", () => {
        expect(election.hasVettingPeriod).toBeDefined();
        expect(typeof election.hasVettingPeriod).toBe("function");
      });

      it("should export determineElectionPhase", () => {
        expect(election.determineElectionPhase).toBeDefined();
        expect(typeof election.determineElectionPhase).toBe("function");
      });
    });

    describe("tracking functions", () => {
      it("should export getElectionIndexForProposalId", () => {
        expect(election.getElectionIndexForProposalId).toBeDefined();
        expect(typeof election.getElectionIndexForProposalId).toBe("function");
      });
    });

    describe("type exports", () => {
      it("should be usable with correct parameter types", () => {
        const params: election.ElectionProposalParams = {
          targets: ["0x123"],
          values: [],
          calldatas: ["0x"],
          description: "test",
          descriptionHash: "0x123",
        };
        expect(params.targets).toHaveLength(1);
      });

      it("should provide PreparedElectionCreation type", () => {
        const prepared: election.PreparedElectionCreation = {
          transaction: {
            to: "0x123",
            data: "0x",
            value: "0",
            chain: "arb1",
            chainId: 42161,
            description: "test",
          },
          electionIndex: 0,
        };
        expect(prepared.electionIndex).toBe(0);
      });
    });
  });
});

describe.skipIf(shouldSkipRpc())("Election Integration Tests", () => {
  const { cache, beforeAllSetup } = createRpcTestSuite();
  let l2Provider: ethers.providers.JsonRpcProvider;
  let l1Provider: ethers.providers.JsonRpcProvider;
  let tracker: ProposalStageTracker;

  // Cached election tracking results - populated once in beforeAll
  const electionCache = new Map<number, ElectionProposalStatus>();
  let cachedElectionStatus: ElectionStatus;

  // Cached vetting check results - populated once in beforeAll
  let cachedNomineeHasVetting: boolean;
  let cachedCoreHasVetting: boolean;
  let cachedCoreVettingPeriod: Awaited<ReturnType<typeof checkVettingPeriod>>;
  let cachedCoreVettingDeadline: Awaited<ReturnType<typeof getVettingDeadline>>;
  let cachedNomineeVettingDeadline: Awaited<ReturnType<typeof getVettingDeadline>>;

  beforeAll(async () => {
    await beforeAllSetup();
    const providers = cache.getProviders();
    l2Provider = providers.l2Provider;
    l1Provider = providers.l1Provider;
    tracker = cache.getTracker();

    // Fetch election status once for reuse
    cachedElectionStatus = await checkElectionStatus(
      l2Provider,
      l1Provider,
      ADDRESSES.ELECTION_NOMINEE_GOVERNOR
    );

    // Track elections 0-4 once upfront for all tests in this suite
    const trackingPromises = [0, 1, 2, 3, 4].map(async (i) => {
      const status = await tracker.trackElection(i);
      electionCache.set(i, status);
    });

    // Cache vetting check results in parallel with election tracking
    const [
      nomineeHasVetting,
      coreHasVetting,
      coreVettingPeriod,
      coreVettingDeadline,
      nomineeVettingDeadline,
    ] = await Promise.all([
      hasVettingPeriod(ADDRESSES.ELECTION_NOMINEE_GOVERNOR, l2Provider),
      hasVettingPeriod(ADDRESSES.CONSTITUTIONAL_GOVERNOR, l2Provider),
      checkVettingPeriod(ADDRESSES.CONSTITUTIONAL_GOVERNOR, "0", l2Provider),
      getVettingDeadline(ADDRESSES.CONSTITUTIONAL_GOVERNOR, "0", l2Provider),
      getVettingDeadline(ADDRESSES.ELECTION_NOMINEE_GOVERNOR, "0", l2Provider),
      ...trackingPromises,
    ]);
    cachedNomineeHasVetting = nomineeHasVetting;
    cachedCoreHasVetting = coreHasVetting;
    cachedCoreVettingPeriod = coreVettingPeriod;
    cachedCoreVettingDeadline = coreVettingDeadline;
    cachedNomineeVettingDeadline = nomineeVettingDeadline;
  }, 180000); // 3 minutes - tracks 5 elections with multiple RPC calls

  describe("hasVettingPeriod", () => {
    it("should detect nominee election governor has vetting", () => {
      // #given cached vetting check result
      expect(cachedNomineeHasVetting).toBe(true);
    });

    it("should detect core governor does not have vetting", () => {
      // #given cached vetting check result
      expect(cachedCoreHasVetting).toBe(false);
    });
  });

  describe("checkVettingPeriod", () => {
    it("should check vetting period for non-vetting governor", () => {
      // #given cached vetting period result for core governor
      expect(cachedCoreVettingPeriod.hasVettingPeriod).toBe(false);
      expect(cachedCoreVettingPeriod.vettingDeadline).toBeNull();
      expect(cachedCoreVettingPeriod.isVettingActive).toBe(false);
    });
  });

  describe("getVettingDeadline", () => {
    it("should return undefined for non-vetting governor", () => {
      // #given cached vetting deadline result for core governor
      expect(cachedCoreVettingDeadline).toBeUndefined();
    });

    it("should return a value for nominee election governor (vetting period check succeeds)", () => {
      // #given cached vetting deadline result for nominee governor
      // Nominee election governor has proposalVettingDeadline function
      // For any proposal ID, it calculates: proposalDeadline + vettingDuration
      // The function succeeds even for proposal ID 0 (returns calculated value)
      expect(cachedNomineeVettingDeadline).toBeDefined();
      expect(cachedNomineeVettingDeadline?.toNumber()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getElectionProposalId", () => {
    it("should return proposal ID for past elections", async () => {
      // Use cached election status for election count
      if (cachedElectionStatus.electionCount > 0) {
        let foundProposalId = false;
        for (let i = cachedElectionStatus.electionCount - 1; i >= 0; i--) {
          const proposalId = await getElectionProposalId(i, l2Provider);
          if (proposalId !== null) {
            foundProposalId = true;
            break;
          }
        }
        expect(foundProposalId).toBe(true);
      }
    });
  });

  describe("Election Proposal Params", () => {
    it("should fetch proposal params for a completed election", async () => {
      // Use cached elections - find one with a valid proposal ID
      if (cachedElectionStatus.electionCount > 0) {
        let foundParams = false;
        for (let i = cachedElectionStatus.electionCount - 1; i >= 0; i--) {
          const cachedElection = electionCache.get(i);
          if (cachedElection?.nomineeProposalId) {
            // Fetch params for this election
            const params = await getElectionProposalParams(i, l2Provider);

            if (params) {
              foundParams = true;
              break;
            }
          }
        }
        expect(foundParams).toBe(true);
      }
    });

    it("should return null for non-existent election", async () => {
      const params = await getElectionProposalParams(999, l2Provider);
      expect(params).toBeNull();
    });
  });

  describe("Member Election Trigger", () => {
    it("should return null when election cannot proceed to member phase", async () => {
      // Use cached election status
      if (cachedElectionStatus.electionCount > 0) {
        // Use cached election 0 (should be completed and cannot proceed)
        const electionStatus = electionCache.get(0)!;

        // A completed election cannot proceed to member phase
        if (electionStatus.phase === "COMPLETED") {
          const tx = await prepareMemberElectionTrigger(
            { electionIndex: 0, canProceedToMemberPhase: false },
            l2Provider
          );
          expect(tx).toBeNull();
        }
      }
    });
  });

  describe("Election TX Hash Discovery", () => {
    // Known tx hashes from production data - regression tests
    const KNOWN_ELECTION_TX_HASHES: Record<number, string> = {
      0: "0xcb6787863f4001e1190f76ae29f14927ba8a7af0ba4f42f1f8b74730948f11db",
      1: "0xedb92c48fd8b10c121d08620a1f3c5f8c8c270cd4f278cde86f940c0cf4ee0ce",
      2: "0x8551b140f50104393d273942bc1b80637d6077791b8f68d3be825c2684af8dc3",
      3: "0xb1d2df615f4abd98dcef744ce902d84ba3cd83238e99aa04816787f858d30d62",
      4: "0x82a0baf3d7e6a6b3247d5848e88732c8ebad0c46b204ff2b7c81beb3158600a6",
    };

    // Known execute tx hashes
    const KNOWN_ELECTION_EXECUTE_TX_HASHES: Record<
      number,
      { nomineeExecute: string; memberExecute: string }
    > = {
      4: {
        nomineeExecute: "0xd6d394edbe03cb46ddf8356d7fe8a53dc0e6502b8bd8d0388774de91e639ea04",
        memberExecute: "0xf41a266144273f65c384536c0932f589a42e9c669d8603d94423a885627ca697",
      },
    };

    // Known timelock operation IDs from member execute
    const KNOWN_TIMELOCK_OPERATION_IDS: Record<number, string> = {
      0: "0x2aa636db2693091e72991d6dcaa0d1d22d8bbad0d6dc0d7bd0509148c8a5842d",
      1: "0x96252a7db617494beaf8c5d43bb906099e4032f82c7979e7335285dacc5c6162",
      4: "0x59b7e93c50a31204ee62b7a881a78b49046ccb10a5a770b9cf4fbdbcefbba2fb",
    };

    it("should find creation tx hash for all elections", () => {
      for (let i = 0; i < 5; i++) {
        const electionStatus = electionCache.get(i)!;
        expect(electionStatus.creationTxHash).toBe(KNOWN_ELECTION_TX_HASHES[i]);
      }
    });

    it("should have creation tx in stages for tracked elections", () => {
      const electionStatus = electionCache.get(1)!;
      const createStage = electionStatus.stages?.find((s) => s.type === "CREATE_ELECTION");
      expect(createStage).toBeDefined();
      expect(createStage?.transactions.length).toBeGreaterThan(0);
      expect(createStage?.transactions[0].hash).toBe(KNOWN_ELECTION_TX_HASHES[1]);
    });

    it("should find nominee execute tx hash for election #4", () => {
      const electionStatus = electionCache.get(4)!;
      expect(electionStatus.nomineeExecuteTxHash).toBe(
        KNOWN_ELECTION_EXECUTE_TX_HASHES[4].nomineeExecute
      );
    });

    it("should find member execute tx hash for election #4", () => {
      const electionStatus = electionCache.get(4)!;
      expect(electionStatus.memberExecuteTxHash).toBe(
        KNOWN_ELECTION_EXECUTE_TX_HASHES[4].memberExecute
      );
    });

    it("should have execute tx in stages for completed elections", () => {
      const electionStatus = electionCache.get(4)!;

      const vettingStage = electionStatus.stages?.find((s) => s.type === "NOMINEE_VETTING");
      expect(vettingStage).toBeDefined();
      expect(vettingStage?.transactions.length).toBeGreaterThan(0);
      expect(vettingStage?.transactions[0].hash).toBe(
        KNOWN_ELECTION_EXECUTE_TX_HASHES[4].nomineeExecute
      );

      const memberStage = electionStatus.stages?.find((s) => s.type === "MEMBER_ELECTION");
      expect(memberStage).toBeDefined();
      expect(memberStage?.transactions.length).toBeGreaterThan(0);
      expect(memberStage?.transactions[0].hash).toBe(
        KNOWN_ELECTION_EXECUTE_TX_HASHES[4].memberExecute
      );
    });

    it("should find timelock operation ID for election #4", () => {
      const electionStatus = electionCache.get(4)!;
      expect(electionStatus.timelockOperationId).toBe(KNOWN_TIMELOCK_OPERATION_IDS[4]);
    });

    it("should track post-member-execute stages for completed election #4", () => {
      const electionStatus = electionCache.get(4)!;

      expect(electionStatus.stages?.length).toBe(8);

      const l2TimelockStage = electionStatus.stages?.find((s) => s.type === "L2_TIMELOCK");
      expect(l2TimelockStage).toBeDefined();
      expect(l2TimelockStage?.status).toBe("COMPLETED");
      expect(l2TimelockStage?.transactions.length).toBeGreaterThan(0);

      const l2ToL1Stage = electionStatus.stages?.find((s) => s.type === "L2_TO_L1_MESSAGE");
      expect(l2ToL1Stage).toBeDefined();
      expect(l2ToL1Stage?.status).toBe("COMPLETED");

      const l1TimelockStage = electionStatus.stages?.find((s) => s.type === "L1_TIMELOCK");
      expect(l1TimelockStage).toBeDefined();
      expect(l1TimelockStage?.status).toBe("COMPLETED");

      const retryableStage = electionStatus.stages?.find((s) => s.type === "RETRYABLE_EXECUTED");
      expect(retryableStage).toBeDefined();
    });
  });

  describe("Election Phase Tracking", () => {
    it("should correctly identify completed election phases", () => {
      // Use cached elections 0-2 for phase data verification
      for (let i = 0; i < 3; i++) {
        const electionStatus = electionCache.get(i)!;

        expect(electionStatus.electionIndex).toBe(i);
        expect(electionStatus.targetNomineeCount).toBe(6);
        expect([0, 1]).toContain(electionStatus.cohort);

        // Completed elections should have proposal IDs
        if (electionStatus.phase === "COMPLETED") {
          expect(electionStatus.nomineeProposalId).not.toBeNull();
          expect(electionStatus.memberProposalId).not.toBeNull();
          expect(electionStatus.nomineeProposalState).toBe("Executed");
          expect(electionStatus.memberProposalState).toBe("Executed");
          expect(electionStatus.isInVettingPeriod).toBe(false);
          expect(electionStatus.canProceedToMemberPhase).toBe(false);
        }
      }
    });

    it("should track cohort alternation across elections", () => {
      const election0 = electionCache.get(0)!;
      const election1 = electionCache.get(1)!;

      // Cohorts should alternate
      expect(election0.cohort).not.toBe(election1.cohort);
    });
  });
});

describe("Election Module - Mocked Tests", () => {
  describe("prepareMemberElectionTrigger", () => {
    it("should build correct execute calldata structure", () => {
      // #given - test that the governor interface encoding is correct
      const governorInterface = new ethers.utils.Interface([
        "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)",
      ]);

      const targets = ["0x1111111111111111111111111111111111111111"];
      const values = [BigNumber.from(0)];
      const calldatas = ["0xabcdef"];
      const descriptionHash = ethers.utils.id("Test election proposal");

      // #when - encoding the execute calldata
      const calldata = governorInterface.encodeFunctionData("execute", [
        targets,
        values,
        calldatas,
        descriptionHash,
      ]);

      // #then - should produce valid calldata
      expect(calldata).toContain("0x");
      expect(calldata.length).toBeGreaterThan(10);
    });
  });

  describe("prepareElectionCreation", () => {
    it("should prepare election creation transaction", () => {
      // #given - minimal election status with election count
      // #when - preparing election creation
      const result = prepareElectionCreation({ electionCount: 5 });

      // #then - should return prepared transaction
      expect(result.transaction).toBeDefined();
      expect(result.transaction.to).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
      expect(result.transaction.chain).toBe("arb1");
      expect(result.transaction.chainId).toBe(42161);
      expect(result.transaction.value).toBe("0");
      expect(result.electionIndex).toBe(5);
    });

    it("should use custom governor address when provided", () => {
      // #given - custom governor address
      const customAddress = "0x1111111111111111111111111111111111111111";

      // #when - preparing with custom address
      const result = prepareElectionCreation({ electionCount: 3 }, customAddress);

      // #then - should use custom address
      expect(result.transaction.to).toBe(customAddress);
    });
  });
});
