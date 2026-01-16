// ============================================================================
// Election Module Public API
// ============================================================================

// Contracts
export { getNomineeGovernor, getMemberGovernor } from "./contracts";

// Proposal IDs
export {
  clearElectionCache,
  getElectionProposalId,
  getMemberElectionProposalId,
} from "./proposal-ids";

// Params
export { getElectionProposalParams, getMemberElectionProposalParams } from "./params";
export type { ElectionProposalParams } from "./params";

// Participants
export { getContenders, getNomineesWithVotes, getExcludedNominees } from "./participants";

// Details
export {
  getNomineeElectionDetails,
  getMemberElectionDetails,
  serializeNomineeDetails,
  serializeMemberDetails,
} from "./details";

// Prepare
export {
  prepareElectionCreation,
  prepareMemberElectionTrigger,
  prepareMemberElectionExecution,
} from "./prepare";
export type { PreparedElectionCreation } from "./prepare";

// Status
export {
  getElectionCount,
  checkElectionStatus,
  hasVettingPeriod,
  determineElectionPhase,
} from "./status";

// Tracking
export {
  trackElectionProposal,
  trackAllElections,
  trackIncompleteElections,
  getElectionIndexForProposalId,
} from "./tracking";
