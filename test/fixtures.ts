/**
 * TDD Ground Truth Test Data
 */

export const ARBITRUM_ADDRESSES = {
  // Governors
  CONSTITUTIONAL_GOVERNOR: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  NON_CONSTITUTIONAL_GOVERNOR: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",

  // Security Council Election Governors
  NOMINEE_ELECTION_GOVERNOR: "0x8a1cDA8dee421cD06023470608605934c16A05a0",
  MEMBER_ELECTION_GOVERNOR: "0x467923B9AE90BDB36BA88eCA11604D45F13b712C",

  // L2 Timelocks
  L2_CONSTITUTIONAL_TIMELOCK: "0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0",
  L2_NON_CONSTITUTIONAL_TIMELOCK: "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58",

  // L1 Timelock
  L1_TIMELOCK: "0xE6841D92B0C345144506576eC13ECf5103aC7f49",

  // Delayed Inboxes (for retryable detection)
  ARB1_DELAYED_INBOX: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  NOVA_DELAYED_INBOX: "0xc4448b71118c9071Bcb9734A0EAc55D18A153949",

  // Security Council Manager
  SECURITY_COUNCIL_MANAGER: "0xD509E5f5aEe2A205F554f36E8a7d56094494eDFC",

  // Chain IDs
  ARB_ONE_CHAIN_ID: 42161,
  NOVA_CHAIN_ID: 42170,
  ETHEREUM_CHAIN_ID: 1,
} as const;

/**
 * Test Case 1: Core Governor - Full L1 Round-trip (COMPLETED)
 * Use for: End-to-end tracking test, all stages completed
 */
export const CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP = {
  // Proposal info
  proposalId: "51852039695020109312343918128899814224888993575448130385109956762385891284115",
  governorAddress: ARBITRUM_ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  creationTxHash: "0x4bf0485d75ff6032dde76dfe98a0e5ff1ca9539cf82a62ff2b9ffb63339a0e8c",
  creationBlock: 369846189,

  // Timelock info
  timelockTxHash: "0xc5dd701fba7cdd670d8f8f5b64542404737c389b3322d78b821a9417708d48ce",
  operationId: "0xaf607f045944b4a9caf0b7e13f0fca93facbf22e389b23ea6cfee07afe452016",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 376175960,

  // Expected stage transactions
  expectedStages: {
    L2_TIMELOCK: {
      hash: "0x736cc1972523e5d6b8d59207765ff7d042e78df105f702fc602fe6d562e7b247",
      block: 378942159,
    },
    L1_TIMELOCK_QUEUED: {
      hash: "0xd4fe561c969a3c5826728fc02b191381233ff75330e93aaaafbc7e2c1a57b4f5",
      block: 23405392,
    },
    L1_TIMELOCK: {
      hash: "0x81f4da8c5dd87d618e927936c941151689ef674ce2639cd4f0857fa4b75a2861",
      block: 23426867,
    },
    RETRYABLE_EXECUTED: {
      l2Hash: "0x7dfa3f85feb3e2d0792edf7d52999fcc914010891bbd88b61c2d28ab1c267501",
      block: 382228795,
    },
  },
  l1OperationId: "0x6b839fadb37a6057524ffedee3815d73388bda3f6db15883272ec246454cc78f",
};

/**
 * Test Case 2: Treasury Governor - Simple Path (No L1 Round-trip)
 * Use for: Treasury governor path test, L2-only execution
 */
export const NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY = {
  // Proposal info
  proposalId: "57495998481040869152703890521939307107269690440073097268210566577740258992963",
  governorAddress: ARBITRUM_ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
  creationTxHash: "0xd426ee539f4bfc7ddda642a3db143f6054db97168c2e473a54720a2e363f4262",
  creationBlock: 389241837,

  // Timelock info
  timelockTxHash: "0x3926b73298699c92833b4474b9dd09ba8b201ea9cb54617f2f5c0ca0bd83ab3b",
  operationId: "0x313821aa48ce176d399069d29c0de9199c0325afa24158f08745443a9539a67e",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 395667897,

  // Expected: Only L2 execution, no L1 stages
  expectedStages: {
    L2_TIMELOCK: {
      hash: "0x917b1a38119548b9d7e91d5c5f41d5f9ec80703b35f0c56e676400cf1e90c0c5",
      block: 396707192,
    },
  },
  // Voting was extended
  votingExtended: true,
  extendedDeadline: "23704465",
};

/**
 * Test Case 3: Core Governor - In Progress (Challenge Period)
 * Use for: Partial progress test, pending stages
 */
export const CONSTITUTIONAL_GOVERNOR_IN_PROGRESS = {
  // Proposal info
  proposalId: "53154361738756237993090798888616593723057470462495169047773178676976253908001",
  governorAddress: ARBITRUM_ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  creationTxHash: "0x385043172e9314cdc34facf04efb540de5ff6ec99a41ec2ff373d79d0415736d",
  creationBlock: 406178381,

  // Timelock info
  timelockTxHash: "0xdfebb93861904590d6d538d48071a96137f66b7a947431a7d74d62a59ce182ec",
  operationId: "0xfe50c9ebc88eb67a91f1309a1b0f26c2bb2cf8ac3bc2b324acbd59953bad6de5",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 412140178,

  // Expected: L2 executed, L2→L1 message sent, waiting for challenge period
  expectedStages: {
    L2_TIMELOCK: {
      status: "COMPLETED" as const,
      hash: "0x8a618261ea734acc944236746a20662b6486da3edc1a8001b8389590d15552fe",
    },
    L2_TO_L1_MESSAGE: {
      status: "PENDING" as const,
      firstExecutableBlock: 24147417,
    },
    L1_TIMELOCK_QUEUED: { status: "NOT_STARTED" as const },
    L1_TIMELOCK: { status: "NOT_STARTED" as const },
    RETRYABLE_EXECUTED: { status: "NOT_STARTED" as const },
  },
};

/**
 * Test Case 4: Core Governor - All Stages Completed
 * Use for: Full lifecycle test with all stages completed
 * Creation tx: 0x0625ecb14f56cd385d7838e2c691e0d9cf096fd109fed915ec689d24c8cda068
 *
 * Block hints enable fast forward search (execution happens ~7 days after queue)
 */
export const CONSTITUTIONAL_GOVERNOR_COMPLETED = {
  // Proposal info
  proposalId: "97685288731263391833044854304895851471157040105038894699042975271050068874277",
  governorAddress: ARBITRUM_ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  creationTxHash: "0x0625ecb14f56cd385d7838e2c691e0d9cf096fd109fed915ec689d24c8cda068",
  creationBlock: 292019815, // Block when proposal was created

  // Timelock info
  timelockTxHash: "0xa391dcbeb4747f0f79b8fb67c96a2dc83bc8db6b64bb3ba5bc8e8f7d8e46a7b6",
  operationId: "0x8b915cc1882cbaa0f5dd0ead1d78fb96fbd9636f23d8ae93a0fe99a7e2be7c4b",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 369071489, // Block when CallScheduled emitted

  // Execution block hints for fast search (from cache ground truth)
  executionBlocks: {
    l2TimelockExecuted: 371840413, // ~2.77M blocks after queue (~7 days)
    l1TimelockQueued: 23258264, // L1 block
    l1TimelockExecuted: 23279739, // L1 block (~21k blocks after queue, ~3 days)
    retryableCreated: 375121482, // L2 block
    retryableRedeemed: 375122111, // L2 block (~600 blocks after creation)
  },

  // All stages completed
  expectedStages: {
    PROPOSAL_CREATED: { status: "COMPLETED" as const },
    VOTING_ACTIVE: { status: "COMPLETED" as const },
    PROPOSAL_QUEUED: { status: "COMPLETED" as const },
    L2_TIMELOCK: {
      status: "COMPLETED" as const,
      block: 371840413,
    },
    L2_TO_L1_MESSAGE: { status: "COMPLETED" as const },
    L1_TIMELOCK: {
      status: "COMPLETED" as const,
      block: 23279739,
    },
    RETRYABLE_EXECUTED: {
      status: "COMPLETED" as const,
      block: 375122111,
    },
  },
};

/**
 * Test Case 5: Direct Timelock Entry (No Governor)
 * Use for: Tracking from CallScheduled tx without proposal
 */
export const DIRECT_TIMELOCK_OPERATION = {
  // No proposal - start directly from timelock operation
  timelockTxHash: "0xc5dd701fba7cdd670d8f8f5b64542404737c389b3322d78b821a9417708d48ce",
  operationId: "0xaf607f045944b4a9caf0b7e13f0fca93facbf22e389b23ea6cfee07afe452016",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 376175960,

  // Same expected stages as CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP, starting from stage 4
  expectedStages: CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP.expectedStages,
};

/**
 * Test Case 6: Core Governor - Another Full Roundtrip (COMPLETED)
 * Different from CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP - uses different proposal
 */
export const CONSTITUTIONAL_GOVERNOR_FULL_ROUNDTRIP_2 = {
  // Timelock operation (full chain data available)
  timelockTxHash: "0xf0ab58113ea28071540c15f9b5b1392cab54c99ec9f5daa6783594b8c5244a24",
  operationId: "0x038f88c074c63860f6538515425c3ce854cc090377874185c67189d7d61e7327",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  queueBlockNumber: 354364540,

  // Ground truth execution data from cache
  expectedStages: {
    L2_TIMELOCK: {
      hash: "0xb546e23861748beecc7b857d99427913cc6bf7b9212ff4b8ceb21f4e66afeb2b",
      block: 357125102,
    },
    L1_TIMELOCK: {
      hash: "0x1bb74e3e8b538ef89abdbad4b61747fd71ca196f4d91cc251238f0c430f494ce",
      block: 22975183,
    },
    RETRYABLE_EXECUTED: {
      hash: "0xd70f62e61cf109cfd7d03bb0dcbe17c225261e0ee341b5aa378b08a72773cfe9",
    },
  },
};

/**
 * Test Case 7: Treasury Governor - Another L2-Only (COMPLETED)
 * Validates L2-only path with different proposal data
 */
export const NON_CONSTITUTIONAL_GOVERNOR_L2_ONLY_2 = {
  // Find from proposal-gov-tracker-cache.json - another treasury proposal
  proposalId: "37638751032596392177176596241110468090299645534448966767963399982622616318705",
  governorAddress: ARBITRUM_ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
  creationTxHash: "0x575d76451ec2a5746ecad6441541e1199094d8c4624d7866186671fd7a6d2a56",
  l2TimelockAddress: ARBITRUM_ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
};

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG = {
  l2ChunkSize: 10_000_000, // 10M blocks per chunk on L2
  l1ChunkSize: 10_000, // 10K blocks per chunk on L1
  delayBetweenChunks: 100, // 100ms delay between queries
};
