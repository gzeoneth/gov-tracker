/**
 * Mocked tests for election details functions
 *
 * Tests getNomineeElectionDetails and getMemberElectionDetails functions
 * with all external dependencies mocked.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { BigNumber, ethers } from "ethers";

vi.mock("../src/election/proposal-ids", () => ({
  getElectionProposalId: vi.fn(),
  computeElectionProposalId: vi.fn(),
}));

vi.mock("../src/election/participants", () => ({
  getContenders: vi.fn(),
  getNomineesWithVotes: vi.fn(),
}));

vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn) => fn()),
}));

vi.mock("../src/utils/multicall", () => ({
  multicall: vi.fn(),
  buildCallInput: vi.fn((targetAddr, _iface, method, args) => ({
    targetAddr,
    method,
    args,
  })),
}));

vi.mock("../src/election/contracts", () => ({
  getNomineeGovernor: vi.fn(),
  getMemberGovernor: vi.fn(),
}));

import {
  getNomineeElectionDetails,
  getMemberElectionDetails,
  serializeNomineeDetails,
  serializeMemberDetails,
} from "../src/election/details";
import { getElectionProposalId, computeElectionProposalId } from "../src/election/proposal-ids";
import { getContenders, getNomineesWithVotes } from "../src/election/participants";
import { multicall } from "../src/utils/multicall";
import { getNomineeGovernor, getMemberGovernor } from "../src/election/contracts";
import type {
  ElectionContender,
  ElectionNominee,
  NomineeElectionDetails,
  MemberElectionDetails,
} from "../src/types";

describe("getNomineeElectionDetails", () => {
  const mockProvider = {} as ethers.providers.Provider;
  const mockProposalId = "123456789";
  const mockElectionIndex = 5;
  const mockSnapshotBlock = BigNumber.from(1000000);
  const mockQuorumThreshold = BigNumber.from("1000000000000000000000");

  const mockNomineeGovernor = {
    proposalSnapshot: vi.fn().mockResolvedValue(mockSnapshotBlock),
    quorum: vi.fn().mockResolvedValue(mockQuorumThreshold),
    compliantNominees: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getNomineeGovernor as Mock).mockReturnValue(mockNomineeGovernor);
  });

  describe("when proposal exists", () => {
    it("should return full nominee election details with contenders and nominees", async () => {
      // #given
      const mockContenders: ElectionContender[] = [
        {
          address: "0x1111111111111111111111111111111111111111",
          registeredAtBlock: 900000,
          registrationTxHash: "0xabc123",
        },
        {
          address: "0x2222222222222222222222222222222222222222",
          registeredAtBlock: 900100,
          registrationTxHash: "0xdef456",
        },
      ];

      const mockNominees: ElectionNominee[] = [
        {
          address: "0x1111111111111111111111111111111111111111",
          votesReceived: BigNumber.from("2000000000000000000000"),
          isExcluded: false,
        },
        {
          address: "0x3333333333333333333333333333333333333333",
          votesReceived: BigNumber.from("1500000000000000000000"),
          isExcluded: true,
        },
        {
          address: "0x4444444444444444444444444444444444444444",
          votesReceived: BigNumber.from("1800000000000000000000"),
          isExcluded: false,
        },
      ];

      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue(mockContenders);
      (getNomineesWithVotes as Mock).mockResolvedValue(mockNominees);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.proposalId).toBe(mockProposalId);
      expect(result!.electionIndex).toBe(mockElectionIndex);
      expect(result!.contenders).toEqual(mockContenders);
      expect(result!.nominees).toEqual(mockNominees);
      expect(result!.compliantNominees).toHaveLength(2);
      expect(result!.excludedNominees).toHaveLength(1);
      expect(result!.quorumThreshold).toEqual(mockQuorumThreshold);
      expect(result!.targetNomineeCount).toBe(6);
    });

    it("should correctly partition compliant and excluded nominees", async () => {
      // #given
      const mockNominees: ElectionNominee[] = [
        { address: "0x1111", votesReceived: BigNumber.from(1000), isExcluded: false },
        { address: "0x2222", votesReceived: BigNumber.from(2000), isExcluded: true },
        { address: "0x3333", votesReceived: BigNumber.from(3000), isExcluded: false },
        { address: "0x4444", votesReceived: BigNumber.from(4000), isExcluded: true },
        { address: "0x5555", votesReceived: BigNumber.from(5000), isExcluded: false },
      ];

      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue(mockNominees);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.compliantNominees).toHaveLength(3);
      expect(result!.excludedNominees).toHaveLength(2);
      expect(result!.compliantNominees.every((n) => !n.isExcluded)).toBe(true);
      expect(result!.excludedNominees.every((n) => n.isExcluded)).toBe(true);
    });

    it("should call governor.quorum with the snapshot block number", async () => {
      // #given
      const customSnapshot = BigNumber.from(999999);
      mockNomineeGovernor.proposalSnapshot.mockResolvedValue(customSnapshot);
      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue([]);

      // #when
      await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(mockNomineeGovernor.quorum).toHaveBeenCalledWith(999999);
    });

    it("should use custom nominee governor address when provided", async () => {
      // #given
      const customGovernorAddress = "0xCustomGovernor";
      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue([]);

      // #when
      await getNomineeElectionDetails(mockElectionIndex, mockProvider, customGovernorAddress);

      // #then
      expect(getNomineeGovernor).toHaveBeenCalledWith(customGovernorAddress, mockProvider);
      expect(getElectionProposalId).toHaveBeenCalledWith(
        mockElectionIndex,
        mockProvider,
        customGovernorAddress
      );
      expect(getContenders).toHaveBeenCalledWith(
        mockProposalId,
        mockProvider,
        customGovernorAddress
      );
      expect(getNomineesWithVotes).toHaveBeenCalledWith(
        mockProposalId,
        mockProvider,
        customGovernorAddress
      );
    });
  });

  describe("when proposal does not exist", () => {
    it("should return null when getElectionProposalId returns null", async () => {
      // #given
      (getElectionProposalId as Mock).mockResolvedValue(null);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).toBeNull();
      expect(getContenders).not.toHaveBeenCalled();
      expect(getNomineesWithVotes).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle empty contenders and nominees arrays", async () => {
      // #given
      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue([]);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.contenders).toHaveLength(0);
      expect(result!.nominees).toHaveLength(0);
      expect(result!.compliantNominees).toHaveLength(0);
      expect(result!.excludedNominees).toHaveLength(0);
    });

    it("should handle all nominees being compliant", async () => {
      // #given
      const allCompliant: ElectionNominee[] = [
        { address: "0x1111", votesReceived: BigNumber.from(1000), isExcluded: false },
        { address: "0x2222", votesReceived: BigNumber.from(2000), isExcluded: false },
      ];

      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue(allCompliant);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.compliantNominees).toHaveLength(2);
      expect(result!.excludedNominees).toHaveLength(0);
    });

    it("should handle all nominees being excluded", async () => {
      // #given
      const allExcluded: ElectionNominee[] = [
        { address: "0x1111", votesReceived: BigNumber.from(1000), isExcluded: true },
        { address: "0x2222", votesReceived: BigNumber.from(2000), isExcluded: true },
      ];

      (getElectionProposalId as Mock).mockResolvedValue(mockProposalId);
      (getContenders as Mock).mockResolvedValue([]);
      (getNomineesWithVotes as Mock).mockResolvedValue(allExcluded);

      // #when
      const result = await getNomineeElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.compliantNominees).toHaveLength(0);
      expect(result!.excludedNominees).toHaveLength(2);
    });
  });
});

describe("getMemberElectionDetails", () => {
  const mockProvider = {} as ethers.providers.Provider;
  const mockElectionIndex = 3;
  const mockMemberProposalId = "987654321";
  const mockNomineeProposalId = "111222333";

  const mockMemberGovernor = {
    state: vi.fn(),
  };

  const mockNomineeGovernor = {
    compliantNominees: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getMemberGovernor as Mock).mockReturnValue(mockMemberGovernor);
    (getNomineeGovernor as Mock).mockReturnValue(mockNomineeGovernor);
    (computeElectionProposalId as Mock).mockResolvedValue(mockMemberProposalId);
  });

  describe("when member proposal exists", () => {
    it("should return full member election details", async () => {
      // #given
      const mockWinners = [
        "0xWinner1111111111111111111111111111111111",
        "0xWinner2222222222222222222222222222222222",
        "0xWinner3333333333333333333333333333333333",
      ];
      const mockDeadline = BigNumber.from(1700000000);
      const mockFullWeightDeadline = BigNumber.from(1699000000);
      const mockAllNominees = [
        "0xWinner1111111111111111111111111111111111",
        "0xWinner2222222222222222222222222222222222",
        "0xWinner3333333333333333333333333333333333",
        "0xLoser4444444444444444444444444444444444",
      ];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);

      (multicall as Mock)
        .mockResolvedValueOnce([mockWinners, mockDeadline, mockFullWeightDeadline])
        .mockResolvedValueOnce([
          BigNumber.from(5000),
          BigNumber.from(4000),
          BigNumber.from(3000),
          BigNumber.from(2000),
        ]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.proposalId).toBe(mockMemberProposalId);
      expect(result!.electionIndex).toBe(mockElectionIndex);
      expect(result!.winners).toEqual(mockWinners);
      expect(result!.proposalDeadline).toBe(1700000000);
      expect(result!.fullWeightDeadline).toBe(1699000000);
      expect(result!.nominees).toHaveLength(4);
    });

    it("should sort nominees by weight in descending order", async () => {
      // #given
      const mockAllNominees = ["0xAddr1", "0xAddr2", "0xAddr3"];
      const mockWeights = [BigNumber.from(100), BigNumber.from(500), BigNumber.from(300)];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([[], BigNumber.from(0), BigNumber.from(0)])
        .mockResolvedValueOnce(mockWeights);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.nominees[0].weightReceived.toNumber()).toBe(500);
      expect(result!.nominees[1].weightReceived.toNumber()).toBe(300);
      expect(result!.nominees[2].weightReceived.toNumber()).toBe(100);
    });

    it("should assign correct ranks to sorted nominees", async () => {
      // #given
      const mockAllNominees = ["0xAddr1", "0xAddr2", "0xAddr3"];
      const mockWeights = [BigNumber.from(100), BigNumber.from(500), BigNumber.from(300)];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([[], BigNumber.from(0), BigNumber.from(0)])
        .mockResolvedValueOnce(mockWeights);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.nominees[0].rank).toBe(1);
      expect(result!.nominees[1].rank).toBe(2);
      expect(result!.nominees[2].rank).toBe(3);
    });

    it("should correctly mark winners based on topNominees", async () => {
      // #given
      const mockWinners = ["0xWinner1", "0xWinner2"];
      const mockAllNominees = ["0xWinner1", "0xLoser1", "0xWinner2"];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([mockWinners, BigNumber.from(0), BigNumber.from(0)])
        .mockResolvedValueOnce([BigNumber.from(100), BigNumber.from(50), BigNumber.from(80)]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      const winner1 = result!.nominees.find((n) => n.address === "0xWinner1");
      const winner2 = result!.nominees.find((n) => n.address === "0xWinner2");
      const loser = result!.nominees.find((n) => n.address === "0xLoser1");

      expect(winner1!.isWinner).toBe(true);
      expect(winner2!.isWinner).toBe(true);
      expect(loser!.isWinner).toBe(false);
    });

    it("should handle case-insensitive winner matching", async () => {
      // #given
      const mockWinners = ["0xABCDEF"];
      const mockAllNominees = ["0xabcdef"];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([mockWinners, BigNumber.from(0), BigNumber.from(0)])
        .mockResolvedValueOnce([BigNumber.from(100)]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.nominees[0].isWinner).toBe(true);
    });

    it("should use custom governor addresses when provided", async () => {
      // #given
      const customMemberGov = "0xCustomMember";
      const customNomineeGov = "0xCustomNominee";

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue([]);
      (getElectionProposalId as Mock).mockResolvedValue(null);
      (multicall as Mock).mockResolvedValueOnce([[], BigNumber.from(0), BigNumber.from(0)]);

      // #when
      await getMemberElectionDetails(
        mockElectionIndex,
        mockProvider,
        customMemberGov,
        customNomineeGov
      );

      // #then
      expect(getMemberGovernor).toHaveBeenCalledWith(customMemberGov, mockProvider);
      expect(getNomineeGovernor).toHaveBeenCalledWith(customNomineeGov, mockProvider);
      expect(getElectionProposalId).toHaveBeenCalledWith(
        mockElectionIndex,
        mockProvider,
        customNomineeGov
      );
    });
  });

  describe("when member proposal does not exist", () => {
    it("should return null when state call throws", async () => {
      // #given
      mockMemberGovernor.state.mockRejectedValue(new Error("Proposal not found"));

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).toBeNull();
      expect(multicall).not.toHaveBeenCalled();
    });
  });

  describe("when nominee proposal does not exist", () => {
    it("should return empty nominees array when getElectionProposalId returns null", async () => {
      // #given
      mockMemberGovernor.state.mockResolvedValue(1);
      (getElectionProposalId as Mock).mockResolvedValue(null);
      (multicall as Mock).mockResolvedValueOnce([[], BigNumber.from(1000), BigNumber.from(900)]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.nominees).toHaveLength(0);
      expect(mockNomineeGovernor.compliantNominees).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle empty allNominees array", async () => {
      // #given
      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue([]);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock).mockResolvedValueOnce([[], BigNumber.from(0), BigNumber.from(0)]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.nominees).toHaveLength(0);
    });

    it("should handle null/undefined values from multicall with defaults", async () => {
      // #given
      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(["0xAddr1"]);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock).mockResolvedValueOnce([null, null, null]).mockResolvedValueOnce([null]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.winners).toEqual([]);
      expect(result!.proposalDeadline).toBe(0);
      expect(result!.fullWeightDeadline).toBe(0);
      expect(result!.nominees[0].weightReceived.toNumber()).toBe(0);
    });

    it("should handle undefined values from multicall with defaults", async () => {
      // #given
      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(["0xAddr1"]);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([undefined, undefined, undefined])
        .mockResolvedValueOnce([undefined]);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result).not.toBeNull();
      expect(result!.winners).toEqual([]);
      expect(result!.proposalDeadline).toBe(0);
      expect(result!.fullWeightDeadline).toBe(0);
      expect(result!.nominees[0].weightReceived.toNumber()).toBe(0);
    });

    it("should handle nominees with equal weights", async () => {
      // #given
      const mockAllNominees = ["0xAddr1", "0xAddr2", "0xAddr3"];
      const equalWeights = [BigNumber.from(100), BigNumber.from(100), BigNumber.from(100)];

      mockMemberGovernor.state.mockResolvedValue(1);
      mockNomineeGovernor.compliantNominees.mockResolvedValue(mockAllNominees);
      (getElectionProposalId as Mock).mockResolvedValue(mockNomineeProposalId);
      (multicall as Mock)
        .mockResolvedValueOnce([[], BigNumber.from(0), BigNumber.from(0)])
        .mockResolvedValueOnce(equalWeights);

      // #when
      const result = await getMemberElectionDetails(mockElectionIndex, mockProvider);

      // #then
      expect(result!.nominees).toHaveLength(3);
      expect(result!.nominees.every((n) => n.weightReceived.eq(100))).toBe(true);
      expect(result!.nominees.map((n) => n.rank)).toContain(1);
      expect(result!.nominees.map((n) => n.rank)).toContain(2);
      expect(result!.nominees.map((n) => n.rank)).toContain(3);
    });
  });
});

describe("serializeNomineeDetails", () => {
  it("should convert BigNumber fields to strings", () => {
    // #given
    const details: NomineeElectionDetails = {
      proposalId: "123456",
      electionIndex: 2,
      contenders: [{ address: "0x1111", registeredAtBlock: 100, registrationTxHash: "0xabc" }],
      nominees: [
        {
          address: "0x2222",
          votesReceived: BigNumber.from("5000000000000000000000"),
          isExcluded: false,
        },
      ],
      compliantNominees: [
        {
          address: "0x2222",
          votesReceived: BigNumber.from("5000000000000000000000"),
          isExcluded: false,
        },
      ],
      excludedNominees: [
        {
          address: "0x3333",
          votesReceived: BigNumber.from("1000000000000000000000"),
          isExcluded: true,
        },
      ],
      quorumThreshold: BigNumber.from("2000000000000000000000"),
      targetNomineeCount: 6,
    };

    // #when
    const result = serializeNomineeDetails(details);

    // #then
    expect(result.proposalId).toBe("123456");
    expect(result.electionIndex).toBe(2);
    expect(result.nominees[0].votesReceived).toBe("5000000000000000000000");
    expect(result.compliantNominees[0].votesReceived).toBe("5000000000000000000000");
    expect(result.excludedNominees[0].votesReceived).toBe("1000000000000000000000");
    expect(result.quorumThreshold).toBe("2000000000000000000000");
    expect(typeof result.nominees[0].votesReceived).toBe("string");
  });

  it("should preserve optional nominee fields", () => {
    // #given
    const details: NomineeElectionDetails = {
      proposalId: "123",
      electionIndex: 1,
      contenders: [],
      nominees: [
        {
          address: "0x1111",
          votesReceived: BigNumber.from(100),
          isExcluded: true,
          nominatedAtBlock: 500,
          excludedAtBlock: 600,
          exclusionTxHash: "0xexclude",
        },
      ],
      compliantNominees: [],
      excludedNominees: [],
      quorumThreshold: BigNumber.from(1000),
      targetNomineeCount: 6,
    };

    // #when
    const result = serializeNomineeDetails(details);

    // #then
    expect(result.nominees[0].nominatedAtBlock).toBe(500);
    expect(result.nominees[0].excludedAtBlock).toBe(600);
    expect(result.nominees[0].exclusionTxHash).toBe("0xexclude");
  });

  it("should handle empty arrays", () => {
    // #given
    const details: NomineeElectionDetails = {
      proposalId: "123",
      electionIndex: 0,
      contenders: [],
      nominees: [],
      compliantNominees: [],
      excludedNominees: [],
      quorumThreshold: BigNumber.from(0),
      targetNomineeCount: 6,
    };

    // #when
    const result = serializeNomineeDetails(details);

    // #then
    expect(result.contenders).toHaveLength(0);
    expect(result.nominees).toHaveLength(0);
    expect(result.compliantNominees).toHaveLength(0);
    expect(result.excludedNominees).toHaveLength(0);
  });
});

describe("serializeMemberDetails", () => {
  it("should convert BigNumber fields to strings", () => {
    // #given
    const details: MemberElectionDetails = {
      proposalId: "789",
      electionIndex: 3,
      nominees: [
        {
          address: "0x1111",
          weightReceived: BigNumber.from("8000000000000000000000"),
          isWinner: true,
          rank: 1,
        },
        {
          address: "0x2222",
          weightReceived: BigNumber.from("5000000000000000000000"),
          isWinner: false,
          rank: 2,
        },
      ],
      winners: ["0x1111"],
      fullWeightDeadline: 1700000000,
      proposalDeadline: 1700500000,
    };

    // #when
    const result = serializeMemberDetails(details);

    // #then
    expect(result.proposalId).toBe("789");
    expect(result.electionIndex).toBe(3);
    expect(result.nominees[0].weightReceived).toBe("8000000000000000000000");
    expect(result.nominees[1].weightReceived).toBe("5000000000000000000000");
    expect(typeof result.nominees[0].weightReceived).toBe("string");
    expect(result.winners).toEqual(["0x1111"]);
    expect(result.fullWeightDeadline).toBe(1700000000);
    expect(result.proposalDeadline).toBe(1700500000);
  });

  it("should preserve nominee rank and winner status", () => {
    // #given
    const details: MemberElectionDetails = {
      proposalId: "456",
      electionIndex: 2,
      nominees: [
        { address: "0x1111", weightReceived: BigNumber.from(100), isWinner: true, rank: 1 },
        { address: "0x2222", weightReceived: BigNumber.from(50), isWinner: false, rank: 2 },
      ],
      winners: ["0x1111"],
      fullWeightDeadline: 100,
      proposalDeadline: 200,
    };

    // #when
    const result = serializeMemberDetails(details);

    // #then
    expect(result.nominees[0].isWinner).toBe(true);
    expect(result.nominees[0].rank).toBe(1);
    expect(result.nominees[1].isWinner).toBe(false);
    expect(result.nominees[1].rank).toBe(2);
  });

  it("should handle empty nominees array", () => {
    // #given
    const details: MemberElectionDetails = {
      proposalId: "000",
      electionIndex: 0,
      nominees: [],
      winners: [],
      fullWeightDeadline: 0,
      proposalDeadline: 0,
    };

    // #when
    const result = serializeMemberDetails(details);

    // #then
    expect(result.nominees).toHaveLength(0);
    expect(result.winners).toHaveLength(0);
  });
});
