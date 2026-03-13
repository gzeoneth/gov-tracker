/**
 * JSON ABI exports for wagmi/viem consumers.
 *
 * These are the same contracts as the human-readable ABIs in abis.ts,
 * but in JSON format with `as const` for full wagmi type inference.
 *
 * Full ABIs are exported as `governorAbi`, `timelockAbi`, etc.
 * Curated read/write subsets are exported as `governorReadAbi`,
 * `governorWriteAbi` for large ABIs where the full version may
 * exceed viem's type inference limits.
 *
 * Generated from human-readable ABIs - do not edit manually.
 * Regenerate with: yarn build && node scripts/generate-json-abis.js
 */

export const governorAbi = [
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVotes",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "againstVotes",
        type: "uint256",
      },
      {
        name: "forVotes",
        type: "uint256",
      },
      {
        name: "abstainVotes",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalEta",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "COUNTING_MODE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingDelay",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingPeriod",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "timelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nomineeVetter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVettingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalExtendedDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "queue",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "castVote",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteWithReason",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteBySig",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "v",
        type: "uint8",
      },
      {
        name: "r",
        type: "bytes32",
      },
      {
        name: "s",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const governorWithVetterAbi = [
  {
    type: "function",
    name: "proposalVettingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "vetter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "excludedNominee",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const timelockAbi = [
  {
    type: "function",
    name: "isOperation",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationPending",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationReady",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationDone",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTimestamp",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMinDelay",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashOperation",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashOperationBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "payload",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "schedule",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
      {
        name: "delay",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "scheduleBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
      {
        name: "delay",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "RETRYABLE_TICKET_MAGIC",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CallScheduled",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "index",
        type: "uint256",
        indexed: true,
      },
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "delay",
        type: "uint256",
      },
    ],
  },
  {
    type: "event",
    name: "CallExecuted",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "index",
        type: "uint256",
        indexed: true,
      },
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
  },
] as const;

export const securityCouncilManagerAbi = [
  {
    type: "function",
    name: "cohortSize",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFirstCohort",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSecondCohort",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateNonce",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getScheduleUpdateInnerData",
    inputs: [
      {
        name: "nonce",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
      {
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "generateSalt",
    inputs: [
      {
        name: "newMembers",
        type: "address[]",
      },
      {
        name: "nonce",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "pure",
  },
] as const;

export const inboxAbi = [
  {
    type: "function",
    name: "calculateRetryableSubmissionFee",
    inputs: [
      {
        name: "dataLength",
        type: "uint256",
      },
      {
        name: "baseFee",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const nomineeElectionGovernorAbi = [
  {
    type: "function",
    name: "electionCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "electionToTimestamp",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "electionIndexToCohort",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createElection",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "nomineeVetter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVettingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "compliantNomineeCount",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposeArgs",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
      {
        name: "",
        type: "uint256[]",
      },
      {
        name: "",
        type: "bytes[]",
      },
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashProposal",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "compliantNominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesReceived",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "contender",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isExcluded",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "nominee",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addContender",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "signature",
        type: "bytes",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "isContender",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "possibleContender",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesUsed",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ContenderAdded",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "contender",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NewNominee",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "nominee",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "NomineeExcluded",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "nominee",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "VoteCastForContender",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "voter",
        type: "address",
        indexed: true,
      },
      {
        name: "contender",
        type: "address",
        indexed: true,
      },
      {
        name: "votes",
        type: "uint256",
      },
      {
        name: "totalUsedVotes",
        type: "uint256",
      },
      {
        name: "usableVotes",
        type: "uint256",
      },
    ],
  },
] as const;

export const memberElectionGovernorAbi = [
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposeArgs",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
      {
        name: "",
        type: "uint256[]",
      },
      {
        name: "",
        type: "bytes[]",
      },
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashProposal",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "weightReceived",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "nominee",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "topNominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fullWeightVotingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fullWeightDuration",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "votesUsed",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "VoteCastForNominee",
    inputs: [
      {
        name: "voter",
        type: "address",
        indexed: true,
      },
      {
        name: "proposalId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "nominee",
        type: "address",
        indexed: true,
      },
      {
        name: "votes",
        type: "uint256",
      },
      {
        name: "weight",
        type: "uint256",
      },
      {
        name: "totalUsedVotes",
        type: "uint256",
      },
      {
        name: "usableVotes",
        type: "uint256",
      },
      {
        name: "weightReceived",
        type: "uint256",
      },
    ],
  },
] as const;

export const erc20VotesAbi = [
  {
    type: "function",
    name: "getPastVotes",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

// ============================================================================
// Curated read/write subsets for large ABIs
// Use these when the full ABI exceeds viem's type inference limits.
// ============================================================================

export const governorReadAbi = [
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVotes",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "againstVotes",
        type: "uint256",
      },
      {
        name: "forVotes",
        type: "uint256",
      },
      {
        name: "abstainVotes",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalEta",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "COUNTING_MODE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingDelay",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingPeriod",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "timelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nomineeVetter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVettingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalExtendedDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const governorWriteAbi = [
  {
    type: "function",
    name: "queue",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "castVote",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteWithReason",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "castVoteBySig",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "v",
        type: "uint8",
      },
      {
        name: "r",
        type: "bytes32",
      },
      {
        name: "s",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
] as const;

export const nomineeElectionGovernorReadAbi = [
  {
    type: "function",
    name: "electionCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "electionToTimestamp",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "electionIndexToCohort",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nomineeVetter",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVettingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "compliantNomineeCount",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposeArgs",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
      {
        name: "",
        type: "uint256[]",
      },
      {
        name: "",
        type: "bytes[]",
      },
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashProposal",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "compliantNominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesReceived",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "contender",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isExcluded",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "nominee",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "blockNumber",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isContender",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "possibleContender",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesUsed",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const nomineeElectionGovernorWriteAbi = [
  {
    type: "function",
    name: "createElection",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "addContender",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "signature",
        type: "bytes",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
] as const;

export const memberElectionGovernorReadAbi = [
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposeArgs",
    inputs: [
      {
        name: "electionIndex",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
      {
        name: "",
        type: "uint256[]",
      },
      {
        name: "",
        type: "bytes[]",
      },
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashProposal",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "weightReceived",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "nominee",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "topNominees",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fullWeightVotingDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fullWeightDuration",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesUsed",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const memberElectionGovernorWriteAbi = [
  {
    type: "function",
    name: "castVoteWithReasonAndParams",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
      {
        name: "params",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
] as const;

export const timelockReadAbi = [
  {
    type: "function",
    name: "isOperation",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationPending",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationReady",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOperationDone",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTimestamp",
    inputs: [
      {
        name: "id",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMinDelay",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashOperation",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hashOperationBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "RETRYABLE_TICKET_MAGIC",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const timelockWriteAbi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "payload",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "schedule",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
      {
        name: "delay",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "scheduleBatch",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "payloads",
        type: "bytes[]",
      },
      {
        name: "predecessor",
        type: "bytes32",
      },
      {
        name: "salt",
        type: "bytes32",
      },
      {
        name: "delay",
        type: "uint256",
      },
    ],
    outputs: [],
  },
] as const;
