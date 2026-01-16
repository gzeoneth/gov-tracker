/**
 * Mocked tests for election proposal ID computation and caching
 *
 * Tests cover:
 * - computeElectionProposalId: Computing proposal ID from election index
 * - getElectionProposalId: Getting cached or computed nominee proposal ID
 * - getMemberElectionProposalId: Getting member proposal ID
 * - getElectionProposalIds: Batch retrieval with caching
 * - clearElectionCache: Cache clearing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock external dependencies
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => unknown) => fn()),
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

// Import after mocking
import {
  computeElectionProposalId,
  getElectionProposalId,
  getMemberElectionProposalId,
  getElectionProposalIds,
  clearElectionCache,
  clearElectionProposalIdsCache,
} from "../src/election/proposal-ids";
import { getNomineeGovernor, getMemberGovernor } from "../src/election/contracts";
import { multicall } from "../src/utils/multicall";
import { ADDRESSES } from "../src/constants";

describe("computeElectionProposalId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should compute proposal ID from getProposeArgs and hashProposal", async () => {
    // #given
    const mockTargets = ["0x1111111111111111111111111111111111111111"];
    const mockValues = [BigNumber.from(0)];
    const mockCalldatas = ["0xabcd1234"];
    const mockDescription = "Election #2: Nominee Selection";
    const expectedDescriptionHash = ethers.utils.id(mockDescription);
    const expectedProposalId = BigNumber.from("123456789012345678901234567890");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([mockTargets, mockValues, mockCalldatas, mockDescription]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
    };

    // #when
    const result = await computeElectionProposalId(2, mockGovernor as unknown as ethers.Contract);

    // #then
    expect(mockGovernor.getProposeArgs).toHaveBeenCalledWith(2);
    expect(mockGovernor.hashProposal).toHaveBeenCalledWith(
      mockTargets,
      mockValues,
      mockCalldatas,
      expectedDescriptionHash
    );
    expect(result).toBe(expectedProposalId.toString());
  });

  it("should handle BigNumber values correctly in proposal args", async () => {
    // #given
    const mockTargets = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ];
    const mockValues = [
      BigNumber.from("1000000000000000000"),
      BigNumber.from("2000000000000000000"),
    ];
    const mockCalldatas = ["0xaa", "0xbb"];
    const mockDescription = "Multi-target election proposal";
    const expectedProposalId = BigNumber.from("987654321");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([mockTargets, mockValues, mockCalldatas, mockDescription]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
    };

    // #when
    const result = await computeElectionProposalId(0, mockGovernor as unknown as ethers.Contract);

    // #then
    expect(result).toBe("987654321");
  });
});

describe("getElectionProposalId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearElectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return proposal ID when proposal exists (state call succeeds)", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const expectedProposalId = BigNumber.from("111222333444555666");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Election #1",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
      state: vi.fn().mockResolvedValue(1), // Active state
    };
    vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    const result = await getElectionProposalId(1, mockProvider);

    // #then
    expect(result).toBe(expectedProposalId.toString());
    expect(mockGovernor.state).toHaveBeenCalledWith(expectedProposalId.toString());
  });

  it("should return null when proposal does not exist (state call fails)", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const expectedProposalId = BigNumber.from("999888777666");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Election #5",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
      state: vi.fn().mockRejectedValue(new Error("Proposal does not exist")),
    };
    vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    const result = await getElectionProposalId(5, mockProvider);

    // #then
    expect(result).toBeNull();
  });

  it("should use custom nominee governor address when provided", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const customAddress = "0xCustomNomineeGovernor1111111111111111111";
    const expectedProposalId = BigNumber.from("555444333");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Custom Election",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
      state: vi.fn().mockResolvedValue(1),
    };
    vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    await getElectionProposalId(0, mockProvider, customAddress);

    // #then
    expect(getNomineeGovernor).toHaveBeenCalledWith(customAddress, mockProvider);
  });

  it("should use default nominee governor address when not provided", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const expectedProposalId = BigNumber.from("123");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Default Election",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
      state: vi.fn().mockResolvedValue(1),
    };
    vi.mocked(getNomineeGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    await getElectionProposalId(0, mockProvider);

    // #then
    expect(getNomineeGovernor).toHaveBeenCalledWith(
      ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
      mockProvider
    );
  });
});

describe("getMemberElectionProposalId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearElectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should compute and return member election proposal ID", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const expectedProposalId = BigNumber.from("777888999");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0xmemberdata"],
          "Member Election #3",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
    };
    vi.mocked(getMemberGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    const result = await getMemberElectionProposalId(3, mockProvider);

    // #then
    expect(result).toBe(expectedProposalId.toString());
    expect(getMemberGovernor).toHaveBeenCalledWith(
      ADDRESSES.ELECTION_MEMBER_GOVERNOR,
      mockProvider
    );
  });

  it("should use custom member governor address when provided", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const customAddress = "0xCustomMemberGovernor2222222222222222222";
    const expectedProposalId = BigNumber.from("111");

    const mockGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Custom Member Election",
        ]),
      hashProposal: vi.fn().mockResolvedValue(expectedProposalId),
    };
    vi.mocked(getMemberGovernor).mockReturnValue(mockGovernor as unknown as ethers.Contract);

    // #when
    await getMemberElectionProposalId(1, mockProvider, customAddress);

    // #then
    expect(getMemberGovernor).toHaveBeenCalledWith(customAddress, mockProvider);
  });
});

describe("getElectionProposalIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearElectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return both nominee and member proposal IDs when both exist", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("111222333");
    const memberProposalId = BigNumber.from("444555666");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee Election",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member Election",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, 1]); // Both state calls succeed

    // #when
    const result = await getElectionProposalIds(2, mockProvider);

    // #then
    expect(result.nomineeProposalId).toBe(nomineeProposalId.toString());
    expect(result.memberProposalId).toBe(memberProposalId.toString());
  });

  it("should return null for nominee when nominee proposal does not exist", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("111");
    const memberProposalId = BigNumber.from("222");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, 1]); // Nominee state returns null (not found)

    // #when
    const result = await getElectionProposalIds(3, mockProvider);

    // #then
    expect(result.nomineeProposalId).toBeNull();
    expect(result.memberProposalId).toBe(memberProposalId.toString());
  });

  it("should return null for member when member proposal does not exist", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("333");
    const memberProposalId = BigNumber.from("444");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, null]); // Member state returns null (not found)

    // #when
    const result = await getElectionProposalIds(4, mockProvider);

    // #then
    expect(result.nomineeProposalId).toBe(nomineeProposalId.toString());
    expect(result.memberProposalId).toBeNull();
  });

  it("should use cached result on second call for same election index", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("555");
    const memberProposalId = BigNumber.from("666");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, 1]); // nomineeProposalId=null triggers immutable cache

    // #when - first call
    const result1 = await getElectionProposalIds(5, mockProvider);
    // Second call should use cache
    const result2 = await getElectionProposalIds(5, mockProvider);

    // #then - multicall should only be called once due to cache hit
    expect(multicall).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
    expect(result1.nomineeProposalId).toBeNull();
    expect(result1.memberProposalId).toBe(memberProposalId.toString());
  });

  it("should skip cache when skipCache option is true", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("777");
    const memberProposalId = BigNumber.from("888");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, 1]); // nomineeProposalId=null triggers immutable cache

    // #when - first call caches the result
    await getElectionProposalIds(6, mockProvider);
    // Second call with skipCache should bypass cache
    await getElectionProposalIds(6, mockProvider, { skipCache: true });

    // #then - multicall should be called twice because cache was skipped
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("should use block-scoped cache when blockNumber is provided", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("999");
    const memberProposalId = BigNumber.from("1000");
    const blockNumber = 12345678;

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, 1]);

    // #when - first call with blockNumber caches block-scoped result
    await getElectionProposalIds(7, mockProvider, { blockNumber });
    // Second call with same blockNumber should use cache
    await getElectionProposalIds(7, mockProvider, { blockNumber });

    // #then - multicall should only be called once
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("should use custom governor addresses when provided", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const customNomineeAddress = "0xCustomNominee3333333333333333333333333";
    const customMemberAddress = "0xCustomMember4444444444444444444444444";
    const nomineeProposalId = BigNumber.from("1111");
    const memberProposalId = BigNumber.from("2222");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Custom Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Custom Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, 1]);

    // #when
    await getElectionProposalIds(8, mockProvider, {
      nomineeGovernorAddress: customNomineeAddress,
      memberGovernorAddress: customMemberAddress,
    });

    // #then
    expect(getNomineeGovernor).toHaveBeenCalledWith(customNomineeAddress, mockProvider);
    expect(getMemberGovernor).toHaveBeenCalledWith(customMemberAddress, mockProvider);
  });
});

describe("clearElectionCache / clearElectionProposalIdsCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should clear the cache so subsequent calls refetch data", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("3333");
    const memberProposalId = BigNumber.from("4444");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, 1]); // nomineeProposalId=null triggers immutable cache

    // #when - first call caches the result
    await getElectionProposalIds(9, mockProvider);
    expect(multicall).toHaveBeenCalledTimes(1);

    // Clear cache
    clearElectionCache();

    // Third call should refetch because cache was cleared
    await getElectionProposalIds(9, mockProvider);

    // #then - multicall should be called twice total
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("clearElectionProposalIdsCache should also clear the cache", async () => {
    // #given
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("5555");
    const memberProposalId = BigNumber.from("6666");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, 1]); // nomineeProposalId=null triggers immutable cache

    // #when - first call caches the result
    await getElectionProposalIds(10, mockProvider);
    expect(multicall).toHaveBeenCalledTimes(1);

    // Clear cache using the specific function
    clearElectionProposalIdsCache();

    // Call again should refetch
    await getElectionProposalIds(10, mockProvider);

    // #then - multicall should be called twice total
    expect(multicall).toHaveBeenCalledTimes(2);
  });
});

describe("Cache immutability logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearElectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should cache when nomineeProposalId is null (election not started)", async () => {
    // #given - nomineeProposalId=null means election hasn't started, which is immutable
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("7777");
    const memberProposalId = BigNumber.from("8888");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([null, null]); // Both null = election not started

    // #when
    await getElectionProposalIds(11, mockProvider);
    await getElectionProposalIds(11, mockProvider);

    // #then - should cache because nomineeProposalId is null (isImmutable returns true)
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("should cache when memberProposalId is not null (election completed)", async () => {
    // #given - memberProposalId!=null means election reached member phase, which is immutable
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("9999");
    const memberProposalId = BigNumber.from("10000");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, 1]); // Both exist = member phase reached

    // #when
    await getElectionProposalIds(12, mockProvider);
    await getElectionProposalIds(12, mockProvider);

    // #then - should cache because memberProposalId is not null
    expect(multicall).toHaveBeenCalledTimes(1);
  });

  it("should NOT cache when in nominee phase (nomineeProposalId exists but memberProposalId is null)", async () => {
    // #given - nomineeProposalId!=null and memberProposalId=null means we're in nominee phase
    // This is mutable state (can transition to member phase), so should not cache without blockNumber
    const mockProvider = {} as ethers.providers.Provider;
    const nomineeProposalId = BigNumber.from("11111");
    const memberProposalId = BigNumber.from("22222");

    const mockNomineeGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x1111111111111111111111111111111111111111"],
          [BigNumber.from(0)],
          ["0x"],
          "Nominee",
        ]),
      hashProposal: vi.fn().mockResolvedValue(nomineeProposalId),
    };
    const mockMemberGovernor = {
      getProposeArgs: vi
        .fn()
        .mockResolvedValue([
          ["0x2222222222222222222222222222222222222222"],
          [BigNumber.from(0)],
          ["0x"],
          "Member",
        ]),
      hashProposal: vi.fn().mockResolvedValue(memberProposalId),
    };

    vi.mocked(getNomineeGovernor).mockReturnValue(
      mockNomineeGovernor as unknown as ethers.Contract
    );
    vi.mocked(getMemberGovernor).mockReturnValue(mockMemberGovernor as unknown as ethers.Contract);
    vi.mocked(multicall).mockResolvedValue([1, null]); // Nominee exists, member does not

    // #when
    await getElectionProposalIds(13, mockProvider);
    await getElectionProposalIds(13, mockProvider);

    // #then - should NOT cache because state is mutable (isImmutable returns false)
    expect(multicall).toHaveBeenCalledTimes(2);
  });
});
