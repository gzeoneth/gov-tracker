import { describe, it, expect } from "vitest";
import * as election from "../src/election/index";

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
    it("should export trackElectionProposal", () => {
      expect(election.trackElectionProposal).toBeDefined();
      expect(typeof election.trackElectionProposal).toBe("function");
    });

    it("should export trackAllElections", () => {
      expect(election.trackAllElections).toBeDefined();
      expect(typeof election.trackAllElections).toBe("function");
    });

    it("should export trackIncompleteElections", () => {
      expect(election.trackIncompleteElections).toBeDefined();
      expect(typeof election.trackIncompleteElections).toBe("function");
    });

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
