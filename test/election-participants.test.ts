/**
 * Unit tests for election/participants.ts
 *
 * Tests for getContenders, getNomineesWithVotes, and getExcludedNominees.
 * All external dependencies are mocked to avoid RPC calls.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ethers, BigNumber } from "ethers";

// Mock modules before importing the functions under test
vi.mock("../src/utils/rpc-utils", () => ({
  queryWithRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../src/utils/multicall", () => ({
  multicall: vi.fn(),
  buildCallInput: vi.fn(
    (address: string, _iface: ethers.utils.Interface, method: string, args: unknown[]) => ({
      targetAddr: address,
      method,
      args,
    })
  ),
}));

vi.mock("../src/election/contracts", () => ({
  getNomineeGovernor: vi.fn(),
  getLogQueryBlockRange: vi.fn(),
}));

import {
  getContenders,
  getNomineesWithVotes,
  getExcludedNominees,
} from "../src/election/participants";
import { multicall } from "../src/utils/multicall";
import { getNomineeGovernor, getLogQueryBlockRange } from "../src/election/contracts";
import { nomineeElectionGovernorInterface } from "../src/abis";

describe("election/participants", () => {
  const mockProposalId = "12345678901234567890";
  const mockGovernorAddress = "0x8a1cDA8dee421cD06023470608605934c16A05a0";

  let mockProvider: {
    getLogs: Mock;
    getBlockNumber: Mock;
  };
  let mockGovernorContract: {
    nominees: Mock;
    votesReceived: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      getLogs: vi.fn(),
      getBlockNumber: vi.fn().mockResolvedValue(1000000),
    };

    mockGovernorContract = {
      nominees: vi.fn(),
      votesReceived: vi.fn(),
    };

    (getNomineeGovernor as Mock).mockReturnValue(mockGovernorContract);
    (getLogQueryBlockRange as Mock).mockResolvedValue({ fromBlock: 100000, toBlock: 200000 });
  });

  describe("getContenders", () => {
    it("should return empty array when no ContenderAdded logs found", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);

      // #when
      const result = await getContenders(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toEqual([]);
      expect(mockProvider.getLogs).toHaveBeenCalledTimes(1);
    });

    it("should parse ContenderAdded logs and return contender details", async () => {
      // #given
      const contenderAddress = "0xAbc1111111111111111111111111111111111111";
      const mockLog = {
        blockNumber: 150000,
        transactionHash: "0xabc123def456789",
        topics: [
          nomineeElectionGovernorInterface.getEventTopic("ContenderAdded"),
          ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
          ethers.utils.hexZeroPad(contenderAddress, 32),
        ],
        data: "0x",
      };
      mockProvider.getLogs.mockResolvedValue([mockLog]);

      // #when
      const result = await getContenders(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        address: contenderAddress.toLowerCase(),
        registeredAtBlock: 150000,
        registrationTxHash: "0xabc123def456789",
      });
    });

    it("should handle multiple contenders", async () => {
      // #given
      const contender1 = "0x1111111111111111111111111111111111111111";
      const contender2 = "0x2222222222222222222222222222222222222222";
      const mockLogs = [
        {
          blockNumber: 150000,
          transactionHash: "0xabc111",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("ContenderAdded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(contender1, 32),
          ],
          data: "0x",
        },
        {
          blockNumber: 150100,
          transactionHash: "0xabc222",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("ContenderAdded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(contender2, 32),
          ],
          data: "0x",
        },
      ];
      mockProvider.getLogs.mockResolvedValue(mockLogs);

      // #when
      const result = await getContenders(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe(contender1.toLowerCase());
      expect(result[1].address).toBe(contender2.toLowerCase());
    });

    it("should skip malformed logs that fail to parse", async () => {
      // #given
      const validContender = "0x1111111111111111111111111111111111111111";
      const mockLogs = [
        {
          blockNumber: 150000,
          transactionHash: "0xmalformed",
          topics: ["0xinvalid"],
          data: "0x",
        },
        {
          blockNumber: 150100,
          transactionHash: "0xvalid",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("ContenderAdded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(validContender, 32),
          ],
          data: "0x",
        },
      ];
      mockProvider.getLogs.mockResolvedValue(mockLogs);

      // #when
      const result = await getContenders(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(validContender.toLowerCase());
    });

    it("should use correct log filter parameters", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);
      const expectedTopic = nomineeElectionGovernorInterface.getEventTopic("ContenderAdded");
      const expectedProposalIdTopic = ethers.utils.hexZeroPad(
        BigNumber.from(mockProposalId).toHexString(),
        32
      );

      // #when
      await getContenders(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(mockProvider.getLogs).toHaveBeenCalledWith({
        address: mockGovernorAddress,
        topics: [expectedTopic, expectedProposalIdTopic],
        fromBlock: 100000,
        toBlock: 200000,
      });
    });

    it("should use default governor address when not provided", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);

      // #when
      await getContenders(mockProposalId, mockProvider as unknown as ethers.providers.Provider);

      // #then
      expect(getNomineeGovernor).toHaveBeenCalledWith(
        "0x8a1cDA8dee421cD06023470608605934c16A05a0",
        expect.anything()
      );
    });
  });

  describe("getNomineesWithVotes", () => {
    it("should return empty array when no nominees exist", async () => {
      // #given
      mockGovernorContract.nominees.mockResolvedValue([]);

      // #when
      const result = await getNomineesWithVotes(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toEqual([]);
      expect(multicall).not.toHaveBeenCalled();
    });

    it("should return nominees with votes and exclusion status via multicall", async () => {
      // #given
      const nominee1 = "0xABc1111111111111111111111111111111111111";
      const nominee2 = "0xdef2222222222222222222222222222222222222";
      mockGovernorContract.nominees.mockResolvedValue([nominee1, nominee2]);

      const multicallResults = [BigNumber.from(1000), false, BigNumber.from(2000), true];
      (multicall as Mock).mockResolvedValue(multicallResults);

      // #when
      const result = await getNomineesWithVotes(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        address: nominee1.toLowerCase(),
        votesReceived: BigNumber.from(1000),
        isExcluded: false,
      });
      expect(result[1]).toEqual({
        address: nominee2.toLowerCase(),
        votesReceived: BigNumber.from(2000),
        isExcluded: true,
      });
    });

    it("should build correct multicall inputs for votesReceived and isExcluded", async () => {
      // #given
      const nominee = "0x1111111111111111111111111111111111111111";
      mockGovernorContract.nominees.mockResolvedValue([nominee]);
      (multicall as Mock).mockResolvedValue([BigNumber.from(500), false]);

      // #when
      await getNomineesWithVotes(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(multicall).toHaveBeenCalledTimes(1);
      const calls = (multicall as Mock).mock.calls[0][1];
      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe("votesReceived");
      expect(calls[0].args).toEqual([mockProposalId, nominee]);
      expect(calls[1].method).toBe("isExcluded");
      expect(calls[1].args).toEqual([mockProposalId, nominee]);
    });

    it("should handle undefined multicall results with safe defaults", async () => {
      // #given
      const nominee = "0x1111111111111111111111111111111111111111";
      mockGovernorContract.nominees.mockResolvedValue([nominee]);
      (multicall as Mock).mockResolvedValue([undefined, undefined]);

      // #when
      const result = await getNomineesWithVotes(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0].votesReceived.eq(BigNumber.from(0))).toBe(true);
      expect(result[0].isExcluded).toBe(false);
    });

    it("should handle large number of nominees", async () => {
      // #given
      const nominees = Array.from(
        { length: 20 },
        (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`
      );
      mockGovernorContract.nominees.mockResolvedValue(nominees);

      const multicallResults = nominees.flatMap((_, i) => [
        BigNumber.from((i + 1) * 100),
        i % 3 === 0,
      ]);
      (multicall as Mock).mockResolvedValue(multicallResults);

      // #when
      const result = await getNomineesWithVotes(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(20);
      expect(result[0].votesReceived.eq(BigNumber.from(100))).toBe(true);
      expect(result[0].isExcluded).toBe(true);
      expect(result[5].votesReceived.eq(BigNumber.from(600))).toBe(true);
    });
  });

  describe("getExcludedNominees", () => {
    it("should return empty array when no NomineeExcluded logs found", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);

      // #when
      const result = await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toEqual([]);
    });

    it("should parse NomineeExcluded logs and fetch votes for each", async () => {
      // #given
      const excludedNominee = "0xAbC3333333333333333333333333333333333333";
      const mockLog = {
        blockNumber: 160000,
        transactionHash: "0xexcludetx123",
        topics: [
          nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded"),
          ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
          ethers.utils.hexZeroPad(excludedNominee, 32),
        ],
        data: "0x",
      };
      mockProvider.getLogs.mockResolvedValue([mockLog]);
      (multicall as Mock).mockResolvedValue([BigNumber.from(750)]);

      // #when
      const result = await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        address: excludedNominee.toLowerCase(),
        votesReceived: BigNumber.from(750),
        isExcluded: true,
        excludedAtBlock: 160000,
        exclusionTxHash: "0xexcludetx123",
      });
    });

    it("should handle multiple excluded nominees", async () => {
      // #given
      const excluded1 = "0x3333333333333333333333333333333333333333";
      const excluded2 = "0x4444444444444444444444444444444444444444";
      const mockLogs = [
        {
          blockNumber: 160000,
          transactionHash: "0xexclude1",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(excluded1, 32),
          ],
          data: "0x",
        },
        {
          blockNumber: 160100,
          transactionHash: "0xexclude2",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(excluded2, 32),
          ],
          data: "0x",
        },
      ];
      mockProvider.getLogs.mockResolvedValue(mockLogs);
      (multicall as Mock).mockResolvedValue([BigNumber.from(500), BigNumber.from(600)]);

      // #when
      const result = await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(2);
      expect(result[0].address).toBe(excluded1);
      expect(result[0].votesReceived.eq(BigNumber.from(500))).toBe(true);
      expect(result[1].address).toBe(excluded2);
      expect(result[1].votesReceived.eq(BigNumber.from(600))).toBe(true);
    });

    it("should skip malformed NomineeExcluded logs", async () => {
      // #given
      const validExcluded = "0x5555555555555555555555555555555555555555";
      const mockLogs = [
        {
          blockNumber: 160000,
          transactionHash: "0xmalformed",
          topics: ["0xinvalidtopic"],
          data: "0x",
        },
        {
          blockNumber: 160100,
          transactionHash: "0xvalid",
          topics: [
            nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded"),
            ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
            ethers.utils.hexZeroPad(validExcluded, 32),
          ],
          data: "0x",
        },
      ];
      mockProvider.getLogs.mockResolvedValue(mockLogs);
      (multicall as Mock).mockResolvedValue([BigNumber.from(300)]);

      // #when
      const result = await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(validExcluded.toLowerCase());
    });

    it("should call getLogQueryBlockRange with offsetFromSnapshot=0", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);

      // #when
      await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(getLogQueryBlockRange).toHaveBeenCalledWith(
        expect.anything(),
        mockProposalId,
        expect.anything(),
        0
      );
    });

    it("should use correct log filter for NomineeExcluded events", async () => {
      // #given
      mockProvider.getLogs.mockResolvedValue([]);
      const expectedTopic = nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded");
      const expectedProposalIdTopic = ethers.utils.hexZeroPad(
        BigNumber.from(mockProposalId).toHexString(),
        32
      );

      // #when
      await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(mockProvider.getLogs).toHaveBeenCalledWith({
        address: mockGovernorAddress,
        topics: [expectedTopic, expectedProposalIdTopic],
        fromBlock: 100000,
        toBlock: 200000,
      });
    });

    it("should set isExcluded=true for all returned nominees", async () => {
      // #given
      const excluded = "0x6666666666666666666666666666666666666666";
      const mockLog = {
        blockNumber: 170000,
        transactionHash: "0xtx",
        topics: [
          nomineeElectionGovernorInterface.getEventTopic("NomineeExcluded"),
          ethers.utils.hexZeroPad(BigNumber.from(mockProposalId).toHexString(), 32),
          ethers.utils.hexZeroPad(excluded, 32),
        ],
        data: "0x",
      };
      mockProvider.getLogs.mockResolvedValue([mockLog]);
      (multicall as Mock).mockResolvedValue([BigNumber.from(100)]);

      // #when
      const result = await getExcludedNominees(
        mockProposalId,
        mockProvider as unknown as ethers.providers.Provider,
        mockGovernorAddress
      );

      // #then
      expect(result).toHaveLength(1);
      expect(result[0].isExcluded).toBe(true);
    });
  });
});
