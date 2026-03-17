// ============================================================================
// Election Module Public API
// ============================================================================

// Contracts
export { getNomineeGovernor, getMemberGovernor } from "./contracts";

// Proposal IDs and lookup
export {
  clearElectionCache,
  getElectionProposalId,
  getMemberElectionProposalId,
  getElectionIndexForProposalId,
} from "./proposal-ids";

// Params and preparation
export {
  getElectionProposalParams,
  getMemberElectionProposalParams,
  prepareElectionCreation,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
} from "./params";
export type { ElectionProposalParams, PreparedElectionCreation } from "./params";

// Participants
export { getContenders, getNomineesWithVotes, getExcludedNominees } from "./participants";

// Details
export {
  getNomineeElectionDetails,
  getMemberElectionDetails,
  serializeNomineeDetails,
  serializeMemberDetails,
} from "./details";

// Status
export {
  getElectionCount,
  checkElectionStatus,
  hasVettingPeriod,
  determineElectionPhase,
  getElectionStatus,
  getAllElectionStatuses,
} from "./status";

// Write actions (prepare-only)
export {
  encodeElectionVoteParams,
  decodeElectionVoteParams,
  getAddContenderTypedData,
  prepareAddContender,
  prepareContenderRegistration,
  prepareNomineeElectionVote,
  prepareMemberElectionVote,
} from "./write";
export type { AddContenderTypedData, PreparedContenderRegistration } from "./write";
