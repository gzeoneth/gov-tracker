/**
 * Public API Tests
 *
 * These tests verify that all intentionally-exported types and utilities
 * are accessible and work as expected. This also helps knip recognize
 * these exports as intentionally public.
 */

import { describe, it, expect } from "vitest";
import { ethers, BigNumber } from "ethers";

// Import all public types to verify they're exported
import type {
  // Base types (for consumers extending types)
  BaseStageData,
  BaseTimelockData,
  // Retryable types (for advanced usage)
  RetryableCreationDetail,
  RetryableRedemptionDetail,
  // Discovery types
  DiscoveryTrackingInput,
  DiscoveryWatermarks,
  DiscoveryTargets,
} from "../src/types";

import {
  // Cache implementations
  FileCache,
  LocalStorageCache,
  MemoryCache,
  // Constants
  ADDRESSES,
  CHAIN_IDS,
  NETWORK_IDS,
  TIMELOCK_SELECTORS,
  DEFAULT_RPC_URLS,
  PROPOSAL_STATE,
  PROPOSAL_STATE_MAP,
  PROPOSAL_STATE_LABEL,
  // ABIs — human-readable
  GOVERNOR_ABI,
  GOVERNOR_WITH_VETTER_ABI,
  // ABIs — JSON (wagmi/viem)
  governorAbi,
  timelockAbi,
  nomineeElectionGovernorAbi,
  memberElectionGovernorAbi,
  erc20VotesAbi,
  // Split ABIs
  governorReadAbi,
  governorWriteAbi,
  nomineeElectionGovernorReadAbi,
  nomineeElectionGovernorWriteAbi,
  // Timelock calldata prep
  prepareTimelockExecuteCalldata,
  prepareTimelockBatchCalldata,
  // Read helpers
  readProposalState,
  readProposalVotes,
  readProposalSnapshot,
  readProposalDeadline,
  readVotingPower,
  readQuorum,
  readGetVotes,
  readHasVoted,
  readCurrentVotingPower,
  readDelegate,
  readNomineeElectionState,
  readMemberElectionState,
  readElectionCount,
  readVotesUsed,
  readIsContender,
  readGovernorName,
  // State type
  isProposalState,
  // Utilities
  addressEquals,
  isAddressIn,
  compareBigNumbers,
  // RPC utilities
  isPermanentError,
  isRetryableError,
  getErrorMessage,
  queryWithRetry,
} from "../src";

describe("Public API: Types", () => {
  it("exports base stage data types for extension", () => {
    // #given - a BaseStageData type with optional skipReason field
    const base: BaseStageData = {
      skipReason: "test",
    };

    // #when - accessing the skipReason property
    const result = base.skipReason;

    // #then - the value should be accessible as defined
    expect(result).toBe("test");
  });

  it("exports BaseTimelockData for extending timelock stages", () => {
    // #given - a BaseTimelockData object with required timelock fields
    const timelock: BaseTimelockData = {
      timelockAddress: ADDRESSES.L1_TIMELOCK,
      operationId: "0x1234567890abcdef",
      callScheduledData: [
        {
          operationId: "0x1234",
          index: "0",
          target: ADDRESSES.L1_TIMELOCK,
          value: "0",
          data: "0x",
          predecessor: "0x0",
          delay: "259200",
          blockNumber: 12345,
          txHash: "0xabc",
          logIndex: 0,
          timelockAddress: ADDRESSES.L1_TIMELOCK,
        },
      ],
    };

    // #when - accessing timelock properties
    const address = timelock.timelockAddress;
    const opId = timelock.operationId;

    // #then - all required fields should be properly typed and accessible
    expect(address).toBe(ADDRESSES.L1_TIMELOCK);
    expect(opId).toBeDefined();
  });

  it("exports retryable types for advanced usage", () => {
    // #given - retryable creation and redemption detail objects
    const creationDetail: RetryableCreationDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      l2TxHash: "0x789",
    };
    const redemptionDetail: RetryableRedemptionDetail = {
      index: 0,
      targetChain: "arb1",
      targetChainId: 42161,
      status: "success",
      l2TxHash: "0xabc",
    };

    // #when - accessing retryable properties
    const creationIndex = creationDetail.index;
    const redemptionStatus = redemptionDetail.status;

    // #then - both types should expose their respective fields correctly
    expect(creationIndex).toBe(0);
    expect(redemptionStatus).toBe("success");
  });

  it("exports discovery types for custom discovery", () => {
    // #given - discovery-related type instances
    const input: DiscoveryTrackingInput = {
      type: "discovery",
      id: "watermarks",
    };
    const watermarks: DiscoveryWatermarks = {
      constitutionalGovernor: 12345,
    };
    const targets: DiscoveryTargets = {
      constitutionalGovernor: true,
      nonConstitutionalGovernor: true,
    };

    // #when - accessing discovery properties
    const inputType = input.type;
    const watermarkValue = watermarks.constitutionalGovernor;
    const targetValue = targets.constitutionalGovernor;

    // #then - all discovery types should be properly typed and accessible
    expect(inputType).toBe("discovery");
    expect(watermarkValue).toBe(12345);
    expect(targetValue).toBe(true);
  });
});

describe("Public API: Cache Implementations", () => {
  it("exports MemoryCache for testing", () => {
    // #given - the MemoryCache class exported from the public API

    // #when - instantiating a new MemoryCache
    const cache = new MemoryCache();

    // #then - the instance should have all required cache methods
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe("function");
    expect(typeof cache.set).toBe("function");
    expect(typeof cache.delete).toBe("function");
  });

  it("exports FileCache for Node.js environments", () => {
    // #given - the FileCache class exported from the public API

    // #when - checking if FileCache is available

    // #then - FileCache should be defined and importable
    expect(FileCache).toBeDefined();
  });

  it("exports LocalStorageCache for browser environments", () => {
    // #given - the LocalStorageCache class exported from the public API

    // #when - checking if LocalStorageCache is available

    // #then - LocalStorageCache should be defined and importable
    expect(LocalStorageCache).toBeDefined();
  });
});

describe("Public API: Constants", () => {
  it("exports ADDRESSES with all governance addresses", () => {
    // #given - the ADDRESSES constant exported from the public API

    // #when - accessing governance address properties

    // #then - all key governance addresses should be defined
    expect(ADDRESSES.CONSTITUTIONAL_GOVERNOR).toBeDefined();
    expect(ADDRESSES.L1_TIMELOCK).toBeDefined();
    expect(ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK).toBeDefined();
  });

  it("exports CHAIN_IDS for network identification", () => {
    // #given - the CHAIN_IDS constant exported from the public API

    // #when - accessing chain ID values

    // #then - chain IDs should match the expected network identifiers
    expect(CHAIN_IDS.ETHEREUM).toBe(1);
    expect(CHAIN_IDS.ARB_ONE).toBe(42161);
    expect(CHAIN_IDS.NOVA).toBe(42170);
  });

  it("exports NETWORK_IDS for simulation (Tenderly format)", () => {
    // #given - the NETWORK_IDS constant exported from the public API

    // #when - accessing network ID strings

    // #then - network IDs should be string format for Tenderly compatibility
    expect(NETWORK_IDS.ethereum).toBe("1");
    expect(NETWORK_IDS.arb1).toBe("42161");
    expect(NETWORK_IDS.nova).toBe("42170");
  });

  it("exports TIMELOCK_SELECTORS for calldata matching", () => {
    // #given - the TIMELOCK_SELECTORS constant exported from the public API

    // #when - accessing function selector values

    // #then - selectors should match the expected 4-byte function signatures
    expect(TIMELOCK_SELECTORS.schedule).toBe("0x01d5062a");
    expect(TIMELOCK_SELECTORS.execute).toBe("0x134008d3");
    expect(TIMELOCK_SELECTORS.scheduleBatch).toBe("0x8f2a0bb0");
    expect(TIMELOCK_SELECTORS.executeBatch).toBe("0xe38335e5");
  });

  it("exports DEFAULT_RPC_URLS for all supported chains", () => {
    // #given - the DEFAULT_RPC_URLS constant exported from the public API

    // #when - accessing RPC URL values

    // #then - all supported chains should have default RPC URLs defined
    expect(DEFAULT_RPC_URLS.ETHEREUM).toBe("https://eth.drpc.org");
    expect(DEFAULT_RPC_URLS.ARB_ONE).toBe("https://arb1.arbitrum.io/rpc");
    expect(DEFAULT_RPC_URLS.NOVA).toBe("https://nova.arbitrum.io/rpc");
  });
});

describe("Public API: Address Utilities", () => {
  it("exports addressEquals for case-insensitive comparison", () => {
    // #given - two addresses with different casing but same value
    const addr1 = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addr2 = "0xf07ded9dc292157749b6fd268e37df6ea38395b9";

    // #when - comparing addresses using addressEquals

    // #then - same addresses with different casing should be equal
    expect(addressEquals(addr1, addr2)).toBe(true);
    // #then - different addresses should not be equal
    expect(addressEquals(addr1, "0x0000000000000000000000000000000000000000")).toBe(false);
  });

  it("exports isAddressIn for membership checking", () => {
    // #given - an address and an array of addresses to check against
    const addr = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
    const addrs = [
      "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
      "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    ];

    // #when - checking address membership using isAddressIn

    // #then - address present in array should return true (case-insensitive)
    expect(isAddressIn(addr, addrs)).toBe(true);
    // #then - address not in array should return false
    expect(isAddressIn("0x0000000000000000000000000000000000000000", addrs)).toBe(false);
  });
});

describe("Public API: Proposal State", () => {
  it("exports PROPOSAL_STATE with OpenZeppelin Governor state values", () => {
    // #then - numeric state values should match OpenZeppelin Governor spec
    expect(PROPOSAL_STATE.PENDING).toBe(0);
    expect(PROPOSAL_STATE.ACTIVE).toBe(1);
    expect(PROPOSAL_STATE.CANCELED).toBe(2);
    expect(PROPOSAL_STATE.DEFEATED).toBe(3);
    expect(PROPOSAL_STATE.SUCCEEDED).toBe(4);
    expect(PROPOSAL_STATE.QUEUED).toBe(5);
    expect(PROPOSAL_STATE.EXPIRED).toBe(6);
    expect(PROPOSAL_STATE.EXECUTED).toBe(7);
  });

  it("exports PROPOSAL_STATE_MAP for numeric-to-string conversion", () => {
    // #then - reverse mapping should produce correct state names
    expect(PROPOSAL_STATE_MAP[0]).toBe("Pending");
    expect(PROPOSAL_STATE_MAP[7]).toBe("Executed");
    expect(Object.keys(PROPOSAL_STATE_MAP)).toHaveLength(8);
  });
});

describe("Public API: ABI Exports", () => {
  it("exports GOVERNOR_WITH_VETTER_ABI for Security Council vetting", () => {
    expect(GOVERNOR_WITH_VETTER_ABI).toContain("function vetter() view returns (address)");
    expect(GOVERNOR_WITH_VETTER_ABI.length).toBe(3);
  });

  it("creates ethers v5 Interface from as-const human-readable ABIs", () => {
    // #given - GOVERNOR_ABI exported with `as const`
    const iface = new ethers.utils.Interface(GOVERNOR_ABI);

    // #then - can look up functions and encode/decode round-trip
    expect(iface.getFunction("state")).toBeDefined();
    expect(iface.getFunction("castVote")).toBeDefined();

    const data = iface.encodeFunctionData("castVote", [BigNumber.from("12345"), 1]);
    const decoded = iface.decodeFunctionData("castVote", data);
    expect(decoded.proposalId.toString()).toBe("12345");
    expect(decoded.support).toBe(1);
  });
});

describe("Public API: RPC Utilities", () => {
  it("exports error classification and retry functions", () => {
    // Smoke test — detailed behavior tested in test/utils.test.ts
    expect(typeof isPermanentError).toBe("function");
    expect(typeof isRetryableError).toBe("function");
    expect(typeof getErrorMessage).toBe("function");
    expect(typeof queryWithRetry).toBe("function");
  });
});

describe("Public API: BigNumber Utilities", () => {
  it("exports compareBigNumbers for sorting", () => {
    // #given
    const a = BigNumber.from(1);
    const b = BigNumber.from(2);
    const c = BigNumber.from(1);

    // #then
    expect(compareBigNumbers(a, b)).toBe(-1);
    expect(compareBigNumbers(b, a)).toBe(1);
    expect(compareBigNumbers(a, c)).toBe(0);
  });
});

describe("Public API: JSON ABI Exports (wagmi/viem)", () => {
  it("exports governorAbi in JSON format with correct structure", () => {
    // #then - should be a non-empty array of objects (not strings)
    expect(governorAbi.length).toBeGreaterThan(0);
    expect(typeof governorAbi[0]).toBe("object");
    // #then - should have standard JSON ABI fields
    const stateFunc = governorAbi.find((item: { name?: string }) => item.name === "state") as any;
    expect(stateFunc).toBeDefined();
    expect(stateFunc!.type).toBe("function");
    expect(stateFunc!.stateMutability).toBe("view");
    expect(stateFunc!.inputs).toHaveLength(1);
    expect(stateFunc!.inputs[0].type).toBe("uint256");
  });

  it("exports timelockAbi with events", () => {
    const events = timelockAbi.filter((item: { type: string }) => item.type === "event");
    expect(events.length).toBeGreaterThan(0);
  });

  it("exports election ABIs", () => {
    expect(nomineeElectionGovernorAbi.length).toBeGreaterThan(0);
    expect(memberElectionGovernorAbi.length).toBeGreaterThan(0);
  });

  it("exports erc20VotesAbi", () => {
    expect(erc20VotesAbi).toHaveLength(3);
    const names = erc20VotesAbi.map((i: { name: string }) => i.name);
    expect(names).toContain("getPastVotes");
    expect(names).toContain("getVotes");
    expect(names).toContain("delegates");
  });

  it("governorAbi contains hasVoted and ProposalCreated event", () => {
    const names = governorAbi.map((i: { name: string }) => i.name);
    expect(names).toContain("hasVoted");
    const events = governorAbi.filter((i: { type: string }) => i.type === "event");
    const eventNames = events.map((i: { name: string }) => i.name);
    expect(eventNames).toContain("ProposalCreated");
  });

  it("governorReadAbi contains hasVoted", () => {
    const names = governorReadAbi.map((i: { name: string }) => i.name);
    expect(names).toContain("hasVoted");
  });

  it("exports curated read/write splits for governor", () => {
    // #then - read ABI contains only view/pure, write ABI has none
    expect(governorReadAbi.length).toBe(15);
    expect(governorWriteAbi.length).toBe(6);

    // #then - no overlap: read names and write names are disjoint
    const readNames = new Set(governorReadAbi.map((i: { name: string }) => i.name));
    const writeNames = new Set(governorWriteAbi.map((i: { name: string }) => i.name));
    for (const name of writeNames) {
      expect(readNames.has(name)).toBe(false);
    }
  });

  it("exports curated read/write splits for nominee election governor", () => {
    // #then - read subset is smaller than full ABI
    expect(nomineeElectionGovernorReadAbi.length).toBeLessThan(nomineeElectionGovernorAbi.length);
    // #then - read + write = all functions (no events in splits)
    expect(
      nomineeElectionGovernorReadAbi.length + nomineeElectionGovernorWriteAbi.length
    ).toBeLessThanOrEqual(nomineeElectionGovernorAbi.length);
  });
});

describe("Public API: ARB_TOKEN address", () => {
  it("exports ARB governance token address", () => {
    expect(ADDRESSES.ARB_TOKEN).toBe("0x912CE59144191C1204E64559FE8253a0e49E6548");
  });
});

describe("Public API: Lowercase proposal state labels", () => {
  it("exports PROPOSAL_STATE_LABEL with lowercase values", () => {
    expect(PROPOSAL_STATE_LABEL[0]).toBe("pending");
    expect(PROPOSAL_STATE_LABEL[1]).toBe("active");
    expect(PROPOSAL_STATE_LABEL[7]).toBe("executed");
    expect(Object.keys(PROPOSAL_STATE_LABEL)).toHaveLength(8);
  });
});

describe("Public API: Sync timelock calldata prep", () => {
  it("prepareTimelockExecuteCalldata encodes execute() without provider", () => {
    // #given
    const timelockAddr = "0x" + "aa".repeat(20);
    const params = {
      target: "0x" + "bb".repeat(20),
      value: BigNumber.from(0),
      data: "0xdeadbeef",
      predecessor: "0x" + "00".repeat(32),
      salt: "0x" + "cc".repeat(32),
    };

    // #when
    const tx = prepareTimelockExecuteCalldata(timelockAddr, params, "0x" + "dd".repeat(32));

    // #then
    expect(tx.to).toBe(timelockAddr);
    expect(tx.data).toMatch(/^0x/);
    expect(tx.chain).toBe("arb1");
    expect(tx.operationId).toBe("0x" + "dd".repeat(32));
  });

  it("prepareTimelockBatchCalldata encodes executeBatch() without provider", () => {
    // #given
    const timelockAddr = "0x" + "aa".repeat(20);
    const params = {
      targets: ["0x" + "bb".repeat(20), "0x" + "cc".repeat(20)],
      values: [BigNumber.from(0), BigNumber.from(100)],
      payloads: ["0xdead", "0xbeef"],
      predecessor: "0x" + "00".repeat(32),
      salt: "0x" + "11".repeat(32),
    };

    // #when
    const tx = prepareTimelockBatchCalldata(timelockAddr, params, "0x" + "ee".repeat(32));

    // #then
    expect(tx.to).toBe(timelockAddr);
    expect(tx.data).toMatch(/^0x/);
    expect(tx.value).toBe("100"); // sum of values
  });
});

describe("Public API: Read helpers (wagmi useReadContract)", () => {
  it("readProposalState returns wagmi-compatible params", () => {
    // #when
    const params = readProposalState("12345");

    // #then
    expect(params.address).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
    expect(params.functionName).toBe("state");
    expect(params.args).toEqual([BigInt("12345")]);
    expect(params.chainId).toBe(CHAIN_IDS.ARB_ONE);
    expect(Array.isArray(params.abi)).toBe(true);
  });

  it("readProposalState accepts governor shorthand", () => {
    const params = readProposalState("1", "non-constitutional");
    expect(params.address).toBe(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
  });

  it("readProposalVotes returns correct functionName", () => {
    const params = readProposalVotes("12345");
    expect(params.functionName).toBe("proposalVotes");
  });

  it("readVotingPower uses ARB_TOKEN by default", () => {
    const params = readVotingPower("0x" + "aa".repeat(20), 100);
    expect(params.address).toBe(ADDRESSES.ARB_TOKEN);
    expect(params.functionName).toBe("getPastVotes");
    expect(params.args).toEqual(["0x" + "aa".repeat(20), BigInt(100)]);
  });

  it("readQuorum accepts number or bigint blockNumber", () => {
    const p1 = readQuorum(100);
    const p2 = readQuorum(BigInt(100));
    expect(p1.args).toEqual([BigInt(100)]);
    expect(p2.args).toEqual([BigInt(100)]);
  });

  it("readProposalSnapshot returns correct functionName and args", () => {
    const params = readProposalSnapshot("99999");
    expect(params.functionName).toBe("proposalSnapshot");
    expect(params.args).toEqual([BigInt("99999")]);
    expect(params.address).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
  });

  it("readProposalDeadline returns correct functionName and args", () => {
    const params = readProposalDeadline("99999");
    expect(params.functionName).toBe("proposalDeadline");
    expect(params.args).toEqual([BigInt("99999")]);
  });

  it("readProposalDeadline accepts governor shorthand", () => {
    const params = readProposalDeadline("1", "non-constitutional");
    expect(params.address).toBe(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
  });

  it("readGetVotes returns correct functionName and args", () => {
    const account = "0x" + "bb".repeat(20);
    const params = readGetVotes(account, 500);
    expect(params.functionName).toBe("getVotes");
    expect(params.args).toEqual([account, BigInt(500)]);
    expect(params.address).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
  });

  it("readNomineeElectionState returns nominee governor params", () => {
    const params = readNomineeElectionState("777");
    expect(params.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(params.functionName).toBe("state");
    expect(params.args).toEqual([BigInt("777")]);
  });

  it("readNomineeElectionState accepts custom address", () => {
    const custom = "0x" + "cc".repeat(20);
    const params = readNomineeElectionState("1", custom);
    expect(params.address).toBe(custom);
  });

  it("readMemberElectionState returns member governor params", () => {
    const params = readMemberElectionState("888");
    expect(params.address).toBe(ADDRESSES.ELECTION_MEMBER_GOVERNOR);
    expect(params.functionName).toBe("state");
    expect(params.args).toEqual([BigInt("888")]);
  });

  it("readElectionCount returns nominee governor params", () => {
    const params = readElectionCount();
    expect(params.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(params.functionName).toBe("electionCount");
    expect(params.args).toEqual([]);
  });

  it("readHasVoted returns correct functionName and args", () => {
    const account = "0x" + "dd".repeat(20);
    const params = readHasVoted("12345", account);
    expect(params.functionName).toBe("hasVoted");
    expect(params.args).toEqual([BigInt("12345"), account]);
    expect(params.address).toBe(ADDRESSES.CONSTITUTIONAL_GOVERNOR);
  });

  it("readHasVoted accepts governor shorthand", () => {
    const params = readHasVoted("1", "0x" + "aa".repeat(20), "non-constitutional");
    expect(params.address).toBe(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR);
  });

  it("readCurrentVotingPower uses ARB_TOKEN by default", () => {
    const account = "0x" + "ee".repeat(20);
    const params = readCurrentVotingPower(account);
    expect(params.address).toBe(ADDRESSES.ARB_TOKEN);
    expect(params.functionName).toBe("getVotes");
    expect(params.args).toEqual([account]);
  });

  it("readCurrentVotingPower accepts custom token address", () => {
    const custom = "0x" + "ff".repeat(20);
    const params = readCurrentVotingPower("0x" + "aa".repeat(20), custom);
    expect(params.address).toBe(custom);
  });

  it("readDelegate returns correct functionName and args", () => {
    const account = "0x" + "cc".repeat(20);
    const params = readDelegate(account);
    expect(params.address).toBe(ADDRESSES.ARB_TOKEN);
    expect(params.functionName).toBe("delegates");
    expect(params.args).toEqual([account]);
  });

  it("readVotesUsed returns nominee governor params", () => {
    const account = "0x" + "aa".repeat(20);
    const params = readVotesUsed("999", account);
    expect(params.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(params.functionName).toBe("votesUsed");
    expect(params.args).toEqual([BigInt("999"), account]);
  });

  it("readVotesUsed accepts custom governor address", () => {
    const custom = "0x" + "bb".repeat(20);
    const params = readVotesUsed("1", "0x" + "aa".repeat(20), custom);
    expect(params.address).toBe(custom);
  });

  it("readIsContender returns nominee governor params", () => {
    const account = "0x" + "aa".repeat(20);
    const params = readIsContender("777", account);
    expect(params.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(params.functionName).toBe("isContender");
    expect(params.args).toEqual([BigInt("777"), account]);
  });

  it("readGovernorName returns nominee governor params", () => {
    const params = readGovernorName();
    expect(params.address).toBe(ADDRESSES.ELECTION_NOMINEE_GOVERNOR);
    expect(params.functionName).toBe("name");
    expect(params.args).toEqual([]);
  });

  it("readGovernorName accepts custom address", () => {
    const custom = "0x" + "dd".repeat(20);
    const params = readGovernorName(custom);
    expect(params.address).toBe(custom);
  });
});

describe("Public API: ProposalStateValue type guard", () => {
  it("isProposalState returns true for valid states 0-7", () => {
    for (let i = 0; i <= 7; i++) {
      expect(isProposalState(i)).toBe(true);
    }
  });

  it("isProposalState returns false for invalid values", () => {
    expect(isProposalState(-1)).toBe(false);
    expect(isProposalState(8)).toBe(false);
    expect(isProposalState(1.5)).toBe(false);
  });
});
