/**
 * Centralized ABI constants and interfaces
 *
 * All contract ABIs used across the SDK are defined here.
 * Pre-created ethers Interface instances are exported to avoid
 * repeated interface creation throughout the codebase.
 */

import { ethers } from "ethers";

/**
 * Governor contract ABI (minimal required interface)
 */
export const GOVERNOR_ABI = [
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
  "function proposalEta(uint256 proposalId) view returns (uint256)",
  "function COUNTING_MODE() view returns (string)",
  "function votingDelay() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
  "function timelock() view returns (address)",
  // Governor with vetter extension (Security Council Nominee Election)
  "function nomineeVetter() view returns (address)",
  "function proposalVettingDeadline(uint256 proposalId) view returns (uint256)",
  // Extended deadline for late quorum
  "function proposalExtendedDeadline(uint256 proposalId) view returns (uint64)",
  // Queue and execute functions
  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
  // Voting functions
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
  "function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)",
  "function castVoteWithReasonAndParams(uint256 proposalId, uint8 support, string reason, bytes params) returns (uint256)",
  "function castVoteBySig(uint256 proposalId, uint8 support, uint8 v, bytes32 r, bytes32 s) returns (uint256)",
  // Read: get votes at snapshot
  "function getVotes(address account, uint256 blockNumber) view returns (uint256)",
];

/**
 * Governor with vetter ABI (Security Council specific)
 */
export const GOVERNOR_WITH_VETTER_ABI = [
  "function proposalVettingDeadline(uint256 proposalId) view returns (uint256)",
  "function vetter() view returns (address)",
  "function excludedNominee(uint256 proposalId, address) view returns (bool)",
];

/**
 * Timelock contract ABI (full interface for read and execution)
 */
export const TIMELOCK_ABI = [
  "function isOperation(bytes32 id) view returns (bool)",
  "function isOperationPending(bytes32 id) view returns (bool)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function getMinDelay() view returns (uint256)",
  "function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function hashOperationBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function execute(address target, uint256 value, bytes calldata payload, bytes32 predecessor, bytes32 salt) payable",
  "function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt) payable",
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function RETRYABLE_TICKET_MAGIC() view returns (address)",
  // Events for log parsing
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
];

/**
 * Security Council Manager ABI (minimal required interface)
 */
export const SECURITY_COUNCIL_MANAGER_ABI = [
  "function cohortSize() view returns (uint256)",
  "function getFirstCohort() external view returns (address[])",
  "function getSecondCohort() external view returns (address[])",
  "function updateNonce() view returns (uint256)",
  "function getScheduleUpdateInnerData(uint256 nonce) view returns (address[], bytes)",
  "function generateSalt(address[] newMembers, uint256 nonce) pure returns (bytes32)",
];

/**
 * Inbox contract ABI for retryable submission fee calculation
 */
export const INBOX_ABI = [
  "function calculateRetryableSubmissionFee(uint256 dataLength, uint256 baseFee) view returns (uint256)",
];

/**
 * ArbSys precompile ABI (includes L2ToL1Tx event for message tracking)
 */
const ARB_SYS_ABI = [
  "function arbBlockNumber() view returns (uint256)",
  "function sendTxToL1(address destination, bytes data) payable returns (uint256)",
  "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
];

/**
 * Upgrade Executor ABI
 */
const UPGRADE_EXECUTOR_ABI = ["function execute(address upgrade, bytes data)"];

/**
 * Security Council Member Sync Action ABI
 */
const MEMBER_SYNC_ACTION_ABI = [
  "function perform(address securityCouncil, address[] members, uint256 nonce) returns (bool)",
];

/**
 * Outbox ABI for L2→L1 message execution tracking
 */
const OUTBOX_ABI = [
  "event OutBoxTransactionExecuted(address indexed to, address indexed l2Sender, uint256 indexed zero, uint256 transactionIndex)",
];

/**
 * ArbRetryableTx precompile ABI for retryable ticket redemption
 */
const ARB_RETRYABLE_TX_ABI = ["function redeem(bytes32 ticketId) external"];

/**
 * Outbox ABI for encoding executeTransaction (separate from isSpent/events)
 */
const OUTBOX_EXECUTE_ABI = [
  "function executeTransaction(bytes32[] calldata proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes calldata data) external",
];

/**
 * SecurityCouncilNomineeElectionGovernor ABI
 */
export const NOMINEE_ELECTION_GOVERNOR_ABI = [
  "function electionCount() view returns (uint256)",
  "function electionToTimestamp(uint256 electionIndex) view returns (uint256)",
  "function electionIndexToCohort(uint256 electionIndex) view returns (uint8)",
  "function createElection() external returns (uint256)",
  "function nomineeVetter() view returns (address)",
  "function proposalVettingDeadline(uint256 proposalId) view returns (uint256)",
  "function compliantNomineeCount(uint256 proposalId) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function getProposeArgs(uint256 electionIndex) view returns (address[], uint256[], bytes[], string)",
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (bytes32)",
  // Detailed nominee tracking
  "function nominees(uint256 proposalId) view returns (address[])",
  "function compliantNominees(uint256 proposalId) view returns (address[])",
  "function votesReceived(uint256 proposalId, address contender) view returns (uint256)",
  "function isExcluded(uint256 proposalId, address nominee) view returns (bool)",
  "function quorum(uint256 blockNumber) view returns (uint256)",
  // Write actions
  "function name() view returns (string)",
  "function addContender(uint256 proposalId, bytes signature) external",
  "function castVoteWithReasonAndParams(uint256 proposalId, uint8 support, string reason, bytes params) returns (uint256)",
  "function isContender(uint256 proposalId, address possibleContender) view returns (bool)",
  "function votesUsed(uint256 proposalId, address account) view returns (uint256)",
  // Events
  "event ContenderAdded(uint256 indexed proposalId, address indexed contender)",
  "event NewNominee(uint256 indexed proposalId, address indexed nominee)",
  "event NomineeExcluded(uint256 indexed proposalId, address indexed nominee)",
  "event VoteCastForContender(uint256 indexed proposalId, address indexed voter, address indexed contender, uint256 votes, uint256 totalUsedVotes, uint256 usableVotes)",
];

/**
 * SecurityCouncilMemberElectionGovernor ABI
 */
export const MEMBER_ELECTION_GOVERNOR_ABI = [
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  // From ElectionGovernor base - used to compute proposal ID
  "function getProposeArgs(uint256 electionIndex) view returns (address[], uint256[], bytes[], string)",
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (bytes32)",
  // Detailed member election tracking
  "function weightReceived(uint256 proposalId, address nominee) view returns (uint256)",
  "function topNominees(uint256 proposalId) view returns (address[])",
  "function fullWeightVotingDeadline(uint256 proposalId) view returns (uint256)",
  "function fullWeightDuration() view returns (uint256)",
  // Write actions
  "function castVoteWithReasonAndParams(uint256 proposalId, uint8 support, string reason, bytes params) returns (uint256)",
  "function votesUsed(uint256 proposalId, address account) view returns (uint256)",
  // Events
  "event VoteCastForNominee(address indexed voter, uint256 indexed proposalId, address indexed nominee, uint256 votes, uint256 weight, uint256 totalUsedVotes, uint256 usableVotes, uint256 weightReceived)",
];

/**
 * ERC20Votes ABI (for reading voting power at snapshot blocks)
 */
export const ERC20_VOTES_ABI = [
  "function getPastVotes(address account, uint256 blockNumber) view returns (uint256)",
];

/**
 * ProposalCreated event signature for parsing
 */
const PROPOSAL_CREATED_EVENT =
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)";

/**
 * ProposalQueued event signature for parsing
 */
const PROPOSAL_QUEUED_EVENT = "event ProposalQueued(uint256 proposalId, uint256 eta)";

/**
 * ProposalExecuted event signature for parsing
 */
const PROPOSAL_EXECUTED_EVENT = "event ProposalExecuted(uint256 proposalId)";

// Pre-created Interface instances

export const governorInterface = new ethers.utils.Interface(GOVERNOR_ABI);
export const timelockInterface = new ethers.utils.Interface(TIMELOCK_ABI);
export const arbSysInterface = new ethers.utils.Interface(ARB_SYS_ABI);
export const outboxInterface = new ethers.utils.Interface(OUTBOX_ABI);
export const outboxExecuteInterface = new ethers.utils.Interface(OUTBOX_EXECUTE_ABI);
export const arbRetryableInterface = new ethers.utils.Interface(ARB_RETRYABLE_TX_ABI);
export const upgradeExecutorInterface = new ethers.utils.Interface(UPGRADE_EXECUTOR_ABI);
export const memberSyncActionInterface = new ethers.utils.Interface(MEMBER_SYNC_ACTION_ABI);
export const proposalCreatedInterface = new ethers.utils.Interface([PROPOSAL_CREATED_EVENT]);
export const proposalQueuedInterface = new ethers.utils.Interface([PROPOSAL_QUEUED_EVENT]);
export const proposalExecutedInterface = new ethers.utils.Interface([PROPOSAL_EXECUTED_EVENT]);
export const nomineeElectionGovernorInterface = new ethers.utils.Interface(
  NOMINEE_ELECTION_GOVERNOR_ABI
);
export const memberElectionGovernorInterface = new ethers.utils.Interface(
  MEMBER_ELECTION_GOVERNOR_ABI
);
