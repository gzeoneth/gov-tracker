/**
 * Election Check - Shared election handling logic
 *
 * NOTE: This is CLI application code that demonstrates SDK usage, not library code.
 * Developers should treat this as part of the CLI application, not as part of the SDK API.
 *
 * Provides common patterns for checking Security Council elections,
 * creating new elections, and triggering member phase transitions.
 *
 * Uses tracker.checkElection() for unified election status checking.
 */

import { ethers } from "ethers";
import {
  createTracker,
  ADDRESSES,
  ElectionStatus,
  ElectionProposalStatus,
  ElectionCheckResult as SDKElectionCheckResult,
} from "../../index";
import { executeTransaction, formatDryRun, ProviderBundle } from "./cli";

// ============================================================================
// Types
// ============================================================================

export interface ElectionCheckOptions {
  /** Whether to execute transactions (requires signer) */
  write?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom nominee governor address (defaults to ADDRESSES.ELECTION_NOMINEE_GOVERNOR) */
  nomineeGovernor?: string;
}

export interface ElectionCheckResult {
  status: ElectionStatus;
  electionCreated?: boolean;
  memberElectionTriggered?: boolean;
  currentElectionStatus?: ElectionProposalStatus;
  errors: string[];
}

// ============================================================================
// Main Election Check
// ============================================================================

/**
 * Check and optionally execute election operations
 *
 * Uses tracker.checkElection() for unified status checking, then executes
 * prepared transactions if write mode is enabled.
 *
 * @param providers - Provider bundle (l2, l1, nova)
 * @param signer - Optional signer for execution (required for write mode)
 * @param options - Election check options
 * @returns Result with status and any actions taken
 */
export async function checkAndExecuteElection(
  providers: ProviderBundle,
  signer: ethers.Wallet | null,
  options: ElectionCheckOptions = {}
): Promise<ElectionCheckResult> {
  const nomineeGovernor = options.nomineeGovernor ?? ADDRESSES.ELECTION_NOMINEE_GOVERNOR;
  const errors: string[] = [];

  // Create tracker and use unified election check
  const tracker = createTracker(providers);

  const sdkResult: SDKElectionCheckResult = await tracker.checkElection({
    nomineeGovernorAddress: nomineeGovernor,
  });

  const result: ElectionCheckResult = {
    status: sdkResult.status,
    currentElectionStatus: sdkResult.currentElection,
    errors,
  };

  // Execute create election if ready and write mode enabled
  if (sdkResult.canCreate && sdkResult.prepared.createElection) {
    if (options.verbose) {
      console.log(`\n[ELECTION] Ready to create election #${sdkResult.status.electionCount}`);
    }

    if (signer && options.write) {
      const execResult = await executeTransaction(
        sdkResult.prepared.createElection,
        signer,
        providers
      );
      if (execResult.success) {
        console.log(`[ELECTION] Created! Tx: ${execResult.txHash}`);
        result.electionCreated = true;
      } else {
        errors.push(`Failed to create election: ${execResult.error}`);
      }
    } else if (options.verbose) {
      console.log(formatDryRun(sdkResult.prepared.createElection));
    }
  } else if (options.verbose) {
    console.log(`[ELECTION] Not ready. Time until election: ${sdkResult.status.timeUntilElection}`);
  }

  // Display and execute member election trigger if ready
  if (sdkResult.currentElection) {
    const currentElectionIndex = sdkResult.status.electionCount - 1;

    if (options.verbose) {
      console.log(
        `\n[ELECTION #${currentElectionIndex}] Phase: ${sdkResult.currentElection.phase}`
      );
      console.log(`  Compliant nominees: ${sdkResult.currentElection.compliantNomineeCount}/6`);
      if (sdkResult.currentElection.isInVettingPeriod) {
        console.log(
          `  In vetting period (deadline: block ${sdkResult.currentElection.vettingDeadline})`
        );
      }
    }

    if (sdkResult.canTriggerMember && sdkResult.prepared.triggerMember) {
      if (options.verbose) {
        console.log(`\n[ELECTION #${currentElectionIndex}] Ready to trigger member election`);
      }

      if (signer && options.write) {
        const execResult = await executeTransaction(
          sdkResult.prepared.triggerMember,
          signer,
          providers
        );
        if (execResult.success) {
          console.log(`[ELECTION] Member election triggered! Tx: ${execResult.txHash}`);
          result.memberElectionTriggered = true;
        } else {
          errors.push(`Failed to trigger member election: ${execResult.error}`);
        }
      } else if (options.verbose) {
        console.log(formatDryRun(sdkResult.prepared.triggerMember));
      }
    }
  }

  return result;
}

// ============================================================================
// Detailed Status Formatter
// ============================================================================

/**
 * Format detailed election status for CLI display
 */
export function formatElectionStatus(
  status: ElectionStatus,
  electionStatus?: ElectionProposalStatus
): string {
  const lines: string[] = [];

  lines.push(`=== Security Council Election Status ===`);
  lines.push(`Election Count: ${status.electionCount}`);
  lines.push(`Cohort: ${status.cohort === 0 ? "First (0)" : "Second (1)"}`);
  lines.push(`Next Election: ${new Date(status.nextElectionTimestamp * 1000).toISOString()}`);
  lines.push(`Current L1 Time: ${new Date(status.currentL1Timestamp * 1000).toISOString()}`);
  lines.push(`Can Create Election: ${status.canCreateElection ? "YES" : "NO"}`);

  if (!status.canCreateElection) {
    lines.push(`Time Until Election: ${status.timeUntilElection}`);
  }

  if (electionStatus) {
    const index = status.electionCount - 1;
    lines.push(``);
    lines.push(`=== Election #${index} Status ===`);
    lines.push(`Phase: ${electionStatus.phase}`);
    lines.push(
      `Compliant Nominees: ${electionStatus.compliantNomineeCount}/${electionStatus.targetNomineeCount}`
    );

    if (electionStatus.nomineeProposalId) {
      lines.push(`Nominee Proposal: ${electionStatus.nomineeProposalId}`);
      lines.push(`Nominee State: ${electionStatus.nomineeProposalState}`);
    }
    if (electionStatus.memberProposalId) {
      lines.push(`Member Proposal: ${electionStatus.memberProposalId}`);
      lines.push(`Member State: ${electionStatus.memberProposalState}`);
    }
    if (electionStatus.isInVettingPeriod) {
      lines.push(`In Vetting Period: YES (deadline block ${electionStatus.vettingDeadline})`);
    }
    lines.push(
      `Can Proceed to Member Phase: ${electionStatus.canProceedToMemberPhase ? "YES" : "NO"}`
    );
  }

  return lines.join("\n");
}
