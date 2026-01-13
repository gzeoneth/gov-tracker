/**
 * Proposal Created Stage Tests
 *
 * Tests for proposal creation stage tracking functionality.
 * Uses mocked providers - no RPC calls required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigNumber, ethers } from "ethers";
import { trackProposalCreated } from "../src/stages/proposal-created";
import { ADDRESSES } from "../src/constants";
import type { ProposalData } from "../src/types";

// Mock the governor-discovery module
vi.mock("../src/discovery/governor-discovery", () => ({
  findProposalByTxHash: vi.fn(),
  findProposalCreatedEvent: vi.fn(),
  detectProposalType: vi.fn(),
}));

// Mock the utils module for getBlockTimestamp
vi.mock("../src/stages/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/stages/utils")>();
  return {
    ...actual,
    getBlockTimestamp: vi.fn(),
  };
});

// Import after mocking
import {
  findProposalByTxHash,
  findProposalCreatedEvent,
  detectProposalType,
} from "../src/discovery/governor-discovery";
import { getBlockTimestamp } from "../src/stages/utils";

const mockProvider = {} as ethers.providers.Provider;

function createProposalData(overrides: Partial<ProposalData> = {}): ProposalData {
  return {
    proposalId: "12345678901234567890",
    proposer: "0x" + "1".repeat(40),
    targets: ["0x" + "2".repeat(40)],
    values: [BigNumber.from(0)],
    signatures: ["execute()"],
    calldatas: ["0xabcdef"],
    startBlock: BigNumber.from(1000),
    endBlock: BigNumber.from(2000),
    description: "Test proposal description",
    creationBlock: 900,
    creationTxHash: "0x" + "a".repeat(64),
    ...overrides,
  };
}

describe("Proposal Created Stage Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");
    vi.mocked(getBlockTimestamp).mockResolvedValue(1700000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("trackProposalCreated", () => {
    describe("fast path - creationTxHash provided", () => {
      it("should return COMPLETED when proposal is found via creationTxHash", async () => {
        // #given proposal exists and can be found by tx hash
        const proposalData = createProposalData();
        vi.mocked(findProposalByTxHash).mockResolvedValue(proposalData);

        // #when tracking proposal created stage with creationTxHash option
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: proposalData.creationTxHash }
        );

        // #then stage should be COMPLETED with proposal data populated
        expect(result.stage.status).toBe("COMPLETED");
        expect(result.stage.type).toBe("PROPOSAL_CREATED");
        expect(result.proposalData).toEqual(proposalData);
        expect(findProposalByTxHash).toHaveBeenCalledWith(
          proposalData.creationTxHash,
          mockProvider
        );
        expect(findProposalCreatedEvent).not.toHaveBeenCalled();
      });

      it("should populate stage data correctly from proposal", async () => {
        // #given proposal with specific data fields
        const proposalData = createProposalData({
          proposalId: "99999",
          proposer: "0x" + "5".repeat(40),
          description: "AIP-123: Upgrade timelock",
          targets: ["0xaaa", "0xbbb"],
          values: [BigNumber.from(100), BigNumber.from(200)],
          signatures: ["foo()", "bar()"],
          calldatas: ["0x1234", "0x5678"],
          startBlock: BigNumber.from(5000),
          endBlock: BigNumber.from(6000),
        });
        vi.mocked(findProposalByTxHash).mockResolvedValue(proposalData);

        // #when tracking proposal created stage
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: "0xtxhash" }
        );

        // #then stage data should contain correct proposal fields
        expect(result.stage.data.proposalId).toBe("99999");
        expect(result.stage.data.proposer).toBe("0x" + "5".repeat(40));
        expect(result.stage.data.description).toBe("AIP-123: Upgrade timelock");
        expect(result.stage.data.targetCount).toBe(2);
        expect(result.stage.data.targets).toEqual(["0xaaa", "0xbbb"]);
        expect(result.stage.data.values).toEqual(["100", "200"]);
        expect(result.stage.data.signatures).toEqual(["foo()", "bar()"]);
        expect(result.stage.data.calldatas).toEqual(["0x1234", "0x5678"]);
        expect(result.stage.data.startBlock).toBe("5000");
        expect(result.stage.data.endBlock).toBe("6000");
      });

      it("should set transaction data on stage", async () => {
        // #given proposal with specific creation block and tx hash
        const proposalData = createProposalData({
          creationBlock: 12345,
          creationTxHash: "0x" + "f".repeat(64),
        });
        vi.mocked(findProposalByTxHash).mockResolvedValue(proposalData);
        vi.mocked(getBlockTimestamp).mockResolvedValue(1699999999);

        // #when tracking proposal created stage
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: proposalData.creationTxHash }
        );

        // #then stage should have transaction data in transactions array
        expect(result.stage.transactions).toHaveLength(1);
        expect(result.stage.transactions[0].hash).toBe("0x" + "f".repeat(64));
        expect(result.stage.transactions[0].blockNumber).toBe(12345);
        expect(result.stage.transactions[0].chain).toBe("arb1");
        expect(result.stage.transactions[0].chainId).toBe(42161);
      });
    });

    describe("fallback path - event search", () => {
      it("should search for ProposalCreated event when txHash lookup returns null", async () => {
        // #given txHash lookup fails but event search succeeds
        const proposalData = createProposalData();
        vi.mocked(findProposalByTxHash).mockResolvedValue(null);
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(proposalData);

        // #when tracking proposal created stage with txHash that doesn't match
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: "0xnonexistent" }
        );

        // #then should fallback to event search and return COMPLETED
        expect(result.stage.status).toBe("COMPLETED");
        expect(result.proposalData).toEqual(proposalData);
        expect(findProposalByTxHash).toHaveBeenCalled();
        expect(findProposalCreatedEvent).toHaveBeenCalledWith(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          expect.objectContaining({ startBlock: expect.any(Number) })
        );
      });

      it("should search events without txHash when not provided", async () => {
        // #given no txHash provided, event search returns proposal
        const proposalData = createProposalData();
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(proposalData);

        // #when tracking without creationTxHash option
        const result = await trackProposalCreated(
          ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider
        );

        // #then should search events directly
        expect(result.stage.status).toBe("COMPLETED");
        expect(findProposalByTxHash).not.toHaveBeenCalled();
        expect(findProposalCreatedEvent).toHaveBeenCalledWith(
          ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          expect.objectContaining({ startBlock: expect.any(Number) })
        );
      });

      it("should use fromBlock option when provided", async () => {
        // #given fromBlock option is specified
        const proposalData = createProposalData();
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(proposalData);
        const customFromBlock = 50000;

        // #when tracking with fromBlock option
        await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { fromBlock: customFromBlock }
        );

        // #then event search should use the specified fromBlock
        expect(findProposalCreatedEvent).toHaveBeenCalledWith(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { startBlock: customFromBlock }
        );
      });
    });

    describe("proposal not found", () => {
      it("should return NOT_STARTED when proposal is not found anywhere", async () => {
        // #given both txHash lookup and event search return null
        vi.mocked(findProposalByTxHash).mockResolvedValue(null);
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking a non-existent proposal
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          "nonexistent-proposal-id",
          mockProvider,
          { creationTxHash: "0xbadtxhash" }
        );

        // #then stage should be NOT_STARTED with null proposalData
        expect(result.stage.status).toBe("NOT_STARTED");
        expect(result.stage.type).toBe("PROPOSAL_CREATED");
        expect(result.proposalData).toBeNull();
      });

      it("should return NOT_STARTED when no txHash provided and event not found", async () => {
        // #given event search returns null
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking without txHash
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          "missing-proposal",
          mockProvider
        );

        // #then stage should be NOT_STARTED
        expect(result.stage.status).toBe("NOT_STARTED");
        expect(result.proposalData).toBeNull();
        expect(result.stage.transactions).toHaveLength(0);
      });
    });

    describe("detectProposalType", () => {
      it("should detect CONSTITUTIONAL proposal type", async () => {
        // #given Constitutional Governor address
        vi.mocked(detectProposalType).mockReturnValue("CONSTITUTIONAL");
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          "123",
          mockProvider
        );

        // #then should call detectProposalType with correct address
        expect(detectProposalType).toHaveBeenCalledWith(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
        expect(result.stage.data.proposalType).toBe("CONSTITUTIONAL");
      });

      it("should detect NON_CONSTITUTIONAL proposal type", async () => {
        // #given Non-Constitutional Governor address
        vi.mocked(detectProposalType).mockReturnValue("NON_CONSTITUTIONAL");
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
          "456",
          mockProvider
        );

        // #then should detect NON_CONSTITUTIONAL type
        expect(detectProposalType).toHaveBeenCalledWith(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
        expect(result.stage.data.proposalType).toBe("NON_CONSTITUTIONAL");
      });

      it("should detect ELECTION_NOMINEE proposal type", async () => {
        // #given Election Nominee Governor address
        vi.mocked(detectProposalType).mockReturnValue("ELECTION_NOMINEE");
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
          "789",
          mockProvider
        );

        // #then should detect ELECTION_NOMINEE type
        expect(detectProposalType).toHaveBeenCalledWith(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
        expect(result.stage.data.proposalType).toBe("ELECTION_NOMINEE");
      });

      it("should detect ELECTION_MEMBER proposal type", async () => {
        // #given Election Member Governor address
        vi.mocked(detectProposalType).mockReturnValue("ELECTION_MEMBER");
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.ELECTION_MEMBER_GOVERNOR,
          "101112",
          mockProvider
        );

        // #then should detect ELECTION_MEMBER type
        expect(detectProposalType).toHaveBeenCalledWith(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
        expect(result.stage.data.proposalType).toBe("ELECTION_MEMBER");
      });

      it("should detect UNKNOWN proposal type for unknown governor", async () => {
        // #given unknown governor address
        const unknownGovernor = "0x" + "9".repeat(40);
        vi.mocked(detectProposalType).mockReturnValue("UNKNOWN");
        vi.mocked(findProposalCreatedEvent).mockResolvedValue(null);

        // #when tracking proposal from unknown governor
        const result = await trackProposalCreated(unknownGovernor, "999", mockProvider);

        // #then should detect UNKNOWN type
        expect(detectProposalType).toHaveBeenCalledWith(unknownGovernor);
        expect(result.stage.data.proposalType).toBe("UNKNOWN");
      });
    });

    describe("timing data", () => {
      it("should set timing.startedAt from block timestamp", async () => {
        // #given proposal with specific creation block
        const proposalData = createProposalData({ creationBlock: 54321 });
        vi.mocked(findProposalByTxHash).mockResolvedValue(proposalData);
        vi.mocked(getBlockTimestamp).mockResolvedValue(1699888777);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: proposalData.creationTxHash }
        );

        // #then timing.startedAt should match block timestamp
        expect(getBlockTimestamp).toHaveBeenCalledWith(54321, mockProvider);
        expect(result.stage.timing?.startedAt).toBe(1699888777);
      });
    });

    describe("chain data", () => {
      it("should set stage chain to arb1", async () => {
        // #given any proposal
        const proposalData = createProposalData();
        vi.mocked(findProposalByTxHash).mockResolvedValue(proposalData);

        // #when tracking proposal
        const result = await trackProposalCreated(
          ADDRESSES.CONSTITUTIONAL_GOVERNOR,
          proposalData.proposalId,
          mockProvider,
          { creationTxHash: proposalData.creationTxHash }
        );

        // #then chain should be arb1 (Arbitrum One)
        expect(result.stage.chain).toBe("arb1");
      });
    });
  });
});
